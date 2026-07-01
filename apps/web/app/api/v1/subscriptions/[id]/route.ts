import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyApiKey, ApiKeyError } from "../../../../lib/verify-api-key";

export const runtime = "nodejs";

function db() {
  return createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET /api/v1/subscriptions/[id]
// id = the subscription_pda (on-chain address). Same value returned by the
// hosted checkout callback and GET /v1/subscriptions.
// Only returns the subscription if it belongs to one of the key's plans.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let wallet: string;
  try {
    wallet = await verifyApiKey(req);
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  const supa = db();

  // Resolve merchant for this API key.
  const { data: merchant } = await supa
    .from("merchants")
    .select("id")
    .eq("destination_wallet", wallet)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  // Fetch the subscription by pda.
  const { data: sub } = await supa
    .from("subscriptions")
    .select("id, subscription_pda, plan_id, subscriber_wallet, status, next_collection_at, last_collection_at, max_payments, subscribed_at")
    .eq("subscription_pda", id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  // Confirm this subscription's plan belongs to the authenticated merchant.
  // Prevents one merchant from looking up another's subscribers.
  const { data: plan } = await supa
    .from("plans")
    .select("id, plan_pda, name")
    .eq("id", sub.plan_id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  // Count successful payments for this subscription.
  const { count: paymentsMade } = await supa
    .from("billing_history")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", sub.id)
    .eq("status", "success");

  return NextResponse.json({
    data: {
      id: sub.subscription_pda ?? sub.id,
      plan_id: plan.plan_pda,
      plan_name: plan.name,
      subscriber: sub.subscriber_wallet,
      status: sub.status,
      next_collection_at: sub.next_collection_at,
      last_collection_at: sub.last_collection_at,
      max_payments: sub.max_payments ?? null,
      payments_made: paymentsMade ?? 0,
      subscribed_at: sub.subscribed_at,
    },
  });
}
