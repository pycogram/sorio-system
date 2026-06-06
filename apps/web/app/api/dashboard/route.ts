import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const db = createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Find the merchant by destination wallet.
  const { data: merchant } = await db
    .from("merchants")
    .select("id, name")
    .eq("destination_wallet", wallet)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json({ merchant: null, plans: [], totalRevenue: 0, recentPayments: [] });
  }

  // All plans for this merchant.
  const { data: plans } = await db
    .from("plans")
    .select("id, plan_pda, name, amount, merchant_amount, period_seconds, active")
    .eq("merchant_id", merchant.id)
    .order("id", { ascending: false });

  const planIds = (plans ?? []).map((p) => p.id);

  // Subscriptions across those plans.
  const { data: subs } = planIds.length
    ? await db
        .from("subscriptions")
        .select("id, plan_id, subscriber_wallet, status, next_collection_at, last_collection_at")
        .in("plan_id", planIds)
    : { data: [] as any[] };

  // Recent payments (billing_history) for those subscriptions.
  const subIds = (subs ?? []).map((s) => s.id);
  const { data: payments } = subIds.length
    ? await db
        .from("billing_history")
        .select("id, subscription_id, amount, status, tx_signature, attempted_at")
        .in("subscription_id", subIds)
        .order("attempted_at", { ascending: false })
        .limit(20)
    : { data: [] as any[] };

  // Total revenue = merchant's share of successful collections.
  // Each successful payment's merchant portion = the plan's merchant_amount.
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const subById = new Map((subs ?? []).map((s) => [s.id, s]));
  let totalRevenue = 0;
  for (const pay of payments ?? []) {
    if (pay.status !== "success") continue;
    const sub = subById.get(pay.subscription_id);
    const plan = sub ? planById.get(sub.plan_id) : null;
    if (plan) totalRevenue += plan.merchant_amount ?? plan.amount;
  }

  // Attach subscribers to each plan.
  const plansWithSubs = (plans ?? []).map((p) => ({
    ...p,
    subscribers: (subs ?? []).filter((s) => s.plan_id === p.id),
  }));

  return NextResponse.json({
    merchant,
    plans: plansWithSubs,
    totalRevenue,
    recentPayments: payments ?? [],
  });
}