import { NextResponse } from "next/server";
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

// GET /api/v1/subscriptions
// Auth: Authorization: Bearer sk_live_xxx
// Returns subscriptions to the key's merchant's plans (their customers).
export async function GET(req: Request) {
  let wallet: string;
  try {
    wallet = await verifyApiKey(req);
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supa = db();

  const { data: merchant } = await supa
    .from("merchants")
    .select("id")
    .eq("destination_wallet", wallet)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json({ data: [] });
  }

  const { data: plans } = await supa
    .from("plans")
    .select("id, plan_pda, name")
    .eq("merchant_id", merchant.id);

  const planIds = (plans ?? []).map((p: any) => p.id);
  if (planIds.length === 0) return NextResponse.json({ data: [] });
  const planById = new Map((plans ?? []).map((p: any) => [p.id, p]));

  const { data: subs } = await supa
    .from("subscriptions")
    .select("id, subscription_pda, plan_id, subscriber_wallet, status, next_collection_at, last_collection_at, max_payments, subscribed_at")
    .in("plan_id", planIds)
    .order("subscribed_at", { ascending: false });

  const subIds = (subs ?? []).map((s: any) => s.id);
  const paidBySub = new Map<string, number>();
  if (subIds.length) {
    const { data: pays } = await supa
      .from("billing_history")
      .select("subscription_id, status")
      .in("subscription_id", subIds)
      .eq("status", "success");
    for (const p of pays ?? []) {
      paidBySub.set(p.subscription_id, (paidBySub.get(p.subscription_id) ?? 0) + 1);
    }
  }

  const out = (subs ?? []).map((s: any) => {
    const plan: any = planById.get(s.plan_id);
    return {
      id: s.subscription_pda ?? s.id,
      plan_id: plan?.plan_pda ?? null,
      plan_name: plan?.name ?? null,
      subscriber: s.subscriber_wallet,
      status: s.status,
      next_collection_at: s.next_collection_at,
      last_collection_at: s.last_collection_at,
      max_payments: s.max_payments ?? null,
      payments_made: paidBySub.get(s.id) ?? 0,
      subscribed_at: s.subscribed_at,
    };
  });

  return NextResponse.json({ data: out });
}
