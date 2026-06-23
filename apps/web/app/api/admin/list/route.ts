import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyAdmin } from "../verify-admin";
import { AuthError } from "../../../lib/verify-auth";

export const runtime = "nodejs";

// GET /api/admin/list?wallet=..&timestamp=..&signature=..
// Admin-gated. Returns actionable records: subscriptions and payroll items that
// are active or paused (the ones you can act on), plus the most recent failure
// reason for each so you can see WHY something needs attention.
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet") ?? undefined;
    const timestampRaw = req.nextUrl.searchParams.get("timestamp");
    const signature = req.nextUrl.searchParams.get("signature") ?? undefined;
    const timestamp = timestampRaw ? Number(timestampRaw) : undefined;

    try {
      verifyAdmin({ action: "admin-list", wallet, timestamp, signature, params: {} });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Actionable subscriptions: active or paused.
    const { data: subsRaw } = await db
      .from("subscriptions")
      .select("id, subscriber_wallet, status, next_collection_at, last_collection_at, plans(name, amount, merchant_amount, period_seconds)")
      .in("status", ["active", "paused"])
      .order("status", { ascending: true });

    // Attach the most recent failure reason (if the latest attempt failed).
    const subs = [];
    for (const s of subsRaw ?? []) {
      const { data: lastRow } = await db
        .from("billing_history")
        .select("status, failure_reason, attempted_at")
        .eq("subscription_id", (s as any).id)
        .order("attempted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      subs.push({
        ...s,
        lastStatus: lastRow?.status ?? null,
        lastFailure: lastRow?.status === "failed" ? lastRow?.failure_reason ?? null : null,
      });
    }

    // Actionable payroll items: active or paused.
    const { data: itemsRaw } = await db
      .from("payroll_items")
      .select("id, employee_wallet, amount, status, next_payment_at, payrolls(name, employer_wallet)")
      .in("status", ["active", "paused"])
      .order("status", { ascending: true });

    const items = [];
    for (const i of itemsRaw ?? []) {
      const { data: lastRow } = await db
        .from("payroll_history")
        .select("status, failure_reason, paid_at")
        .eq("payroll_item_id", (i as any).id)
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      items.push({
        ...i,
        lastStatus: lastRow?.status ?? null,
        lastFailure: lastRow?.status === "failed" ? lastRow?.failure_reason ?? null : null,
      });
    }

    return NextResponse.json({ subscriptions: subs, payrollItems: items });
  } catch (e: any) {
    console.error("admin list failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}