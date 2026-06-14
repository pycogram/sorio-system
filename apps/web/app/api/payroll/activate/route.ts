import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { itemId, subscriptionPda, wallet, startDate } = await req.json();
    if (!itemId || !subscriptionPda) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Ownership check: the item's payroll must belong to this employer wallet.
    const { data: item } = await db
      .from("payroll_items")
      .select("id, payrolls(employer_wallet)")
      .eq("id", itemId)
      .maybeSingle();

    const ownerWallet = (item as any)?.payrolls?.employer_wallet ?? null;
    if (!item || ownerWallet !== wallet) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    // next_payment_at controls when the worker first pays this employee:
    //  - startDate provided  -> first payment on that date (then every period)
    //  - no startDate         -> due now (worker pays on its next run, or the
    //                            "pay now" flow charges immediately)
    const nextPaymentAt = startDate ? new Date(startDate).toISOString() : new Date().toISOString();

    const { error } = await db
      .from("payroll_items")
      .update({
        subscription_pda: subscriptionPda,
        status: "active",
        next_payment_at: nextPaymentAt,
      })
      .eq("id", itemId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("payroll activate failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}