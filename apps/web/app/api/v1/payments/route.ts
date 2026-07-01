import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyApiKey, ApiKeyError } from "../../../lib/verify-api-key";

export const runtime = "nodejs";

function db() {
  return createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET /api/v1/payments
// Returns billing history for the key's merchant's subscriptions.
// Optional query param: ?subscription=<subscription_pda> to filter to one subscriber.
// Only successful collections are returned (status = "success").
export async function GET(req: NextRequest) {
  let wallet: string;
  try {
    wallet = await verifyApiKey(req);
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const filterSub = req.nextUrl.searchParams.get("subscription");
  const supa = db();

  const { data: merchant } = await supa
    .from("merchants")
    .select("id")
    .eq("destination_wallet", wallet)
    .maybeSingle();

  if (!merchant) return NextResponse.json({ data: [] });

  const { data: plans } = await supa
    .from("plans")
    .select("id, plan_pda, name, merchant_amount")
    .eq("merchant_id", merchant.id);

  const planIds = (plans ?? []).map((p: any) => p.id);
  if (planIds.length === 0) return NextResponse.json({ data: [] });

  const planById = new Map((plans ?? []).map((p: any) => [p.id, p]));

  // Fetch subscriptions — optionally filtered to one pda.
  let subsQuery = supa
    .from("subscriptions")
    .select("id, subscription_pda, plan_id, subscriber_wallet")
    .in("plan_id", planIds);
  if (filterSub) subsQuery = subsQuery.eq("subscription_pda", filterSub);

  const { data: subs } = await subsQuery;
  const subIds = (subs ?? []).map((s: any) => s.id);
  if (subIds.length === 0) return NextResponse.json({ data: [] });

  const subById = new Map((subs ?? []).map((s: any) => [s.id, s]));

  const { data: history } = await supa
    .from("billing_history")
    .select("id, subscription_id, amount, tx_signature, attempted_at")
    .in("subscription_id", subIds)
    .eq("status", "success")
    .order("attempted_at", { ascending: false })
    .limit(200);

  const out = (history ?? []).map((h: any) => {
    const sub: any = subById.get(h.subscription_id);
    const plan: any = sub ? planById.get(sub.plan_id) : null;
    const merchantAmount = plan?.merchant_amount ?? h.amount;
    const fee = h.amount - merchantAmount;
    return {
      id: h.id,
      subscription: sub?.subscription_pda ?? h.subscription_id,
      plan: plan?.plan_pda ?? null,
      plan_name: plan?.name ?? null,
      subscriber: sub?.subscriber_wallet ?? null,
      amount: merchantAmount,
      fee: fee > 0 ? fee : 0,
      tx: h.tx_signature,
      collected_at: h.attempted_at,
    };
  });

  return NextResponse.json({ data: out });
}
