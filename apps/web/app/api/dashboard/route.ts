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

  // --- Customer view: subscriptions where THIS wallet is the subscriber ---
  const { data: mySubsRaw } = await db
    .from("subscriptions")
    .select("id, subscription_pda, status, next_collection_at, plan_id, plans(plan_pda, name, amount, merchant_amount, period_seconds, merchants(name))")
    .eq("subscriber_wallet", wallet)
    .order("subscribed_at", { ascending: false });

  const mySubscriptions = (mySubsRaw ?? []).map((s: any) => ({
    id: s.id,
    subscription_pda: s.subscription_pda,
    status: s.status,
    next_collection_at: s.next_collection_at,
    plan_pda: s.plans?.plan_pda ?? null,
    plan_name: s.plans?.name ?? "Plan",
    amount: s.plans?.amount ?? 0,
    period_seconds: s.plans?.period_seconds ?? 0,
    merchant_name: s.plans?.merchants?.name ?? "Merchant",
  }));

  // --- Merchant view: plans created by this wallet ---
  const { data: merchant } = await db
    .from("merchants")
    .select("id, name")
    .eq("destination_wallet", wallet)
    .maybeSingle();

  if (!merchant) {
    // Not a merchant — return only the customer view.
    return NextResponse.json({
      merchant: null,
      plans: [],
      totalRevenue: 0,
      recentPayments: [],
      mySubscriptions,
    });
  }

  const { data: plans } = await db
    .from("plans")
    .select("id, plan_pda, name, amount, merchant_amount, period_seconds, active, hidden")
    .eq("merchant_id", merchant.id)
    .order("id", { ascending: false });

  const planIds = (plans ?? []).map((p) => p.id);

  const { data: subs } = planIds.length
    ? await db
        .from("subscriptions")
        .select("id, plan_id, subscriber_wallet, status, next_collection_at, last_collection_at")
        .in("plan_id", planIds)
    : { data: [] as any[] };

  const subIds = (subs ?? []).map((s) => s.id);
  const { data: payments } = subIds.length
    ? await db
        .from("billing_history")
        .select("id, subscription_id, amount, status, tx_signature, attempted_at")
        .in("subscription_id", subIds)
        .order("attempted_at", { ascending: false })
        .limit(200)
    : { data: [] as any[] };

  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const subById = new Map((subs ?? []).map((s) => [s.id, s]));
  let totalRevenue = 0;
  for (const pay of payments ?? []) {
    if (pay.status !== "success") continue;
    const sub = subById.get(pay.subscription_id);
    const plan = sub ? planById.get(sub.plan_id) : null;
    if (plan) totalRevenue += plan.merchant_amount ?? plan.amount;
  }

  const plansWithSubs = (plans ?? []).map((p) => ({
    ...p,
    subscribers: (subs ?? []).filter((s) => s.plan_id === p.id),
  }));

  return NextResponse.json({
    merchant,
    plans: plansWithSubs,
    totalRevenue,
    recentPayments: payments ?? [],
    mySubscriptions,
  });
}