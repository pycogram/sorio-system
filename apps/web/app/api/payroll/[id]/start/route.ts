import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Set or update a payroll's "first payment" policy:
//   mode = "pay_now"  -> employees pay immediately when approved
//   mode = "date"     -> employees' first payment is `startDate`
//
// Editable only until the first payment is made on this payroll. Once any
// payment exists, the policy is locked. When the date changes, all already
// approved-but-unpaid employees are moved to the new date so the team stays
// in sync.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { wallet, mode, startDate } = await req.json();

    if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
    if (mode !== "pay_now" && mode !== "date") {
      return NextResponse.json({ error: "mode must be 'pay_now' or 'date'" }, { status: 400 });
    }
    if (mode === "date" && !startDate) {
      return NextResponse.json({ error: "startDate required for date mode" }, { status: 400 });
    }

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Ownership check + load items to test the "any payment made" lock.
    const { data: payroll, error: pErr } = await db
      .from("payrolls")
      .select("id, employer_wallet, payroll_items(id, status, payroll_history(status))")
      .eq("id", id)
      .maybeSingle();

    if (pErr || !payroll) {
      return NextResponse.json({ error: "Payroll not found" }, { status: 404 });
    }
    if ((payroll as any).employer_wallet !== wallet) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    // Lock: if any successful payment exists on any item, the policy is frozen.
    const anyPaid = ((payroll as any).payroll_items ?? []).some((it: any) =>
      (it.payroll_history ?? []).some((h: any) => h.status === "success")
    );
    if (anyPaid) {
      return NextResponse.json(
        { error: "This payroll has already paid out — the start setting is locked." },
        { status: 409 }
      );
    }

    const startIso = mode === "date" ? new Date(startDate).toISOString() : null;

    // Save the policy on the payroll.
    const { error: uErr } = await db
      .from("payrolls")
      .update({ start_mode: mode, start_date: startIso })
      .eq("id", id);
    if (uErr) throw uErr;

    // If a date was set, move all already-active (approved, unpaid) employees
    // to that date so the whole team's first payment lands together.
    if (mode === "date" && startIso) {
      await db
        .from("payroll_items")
        .update({ next_payment_at: startIso })
        .eq("payroll_id", id)
        .eq("status", "active");
    }

    return NextResponse.json({ ok: true, start_mode: mode, start_date: startIso });
  } catch (e: any) {
    console.error("payroll start setting failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}