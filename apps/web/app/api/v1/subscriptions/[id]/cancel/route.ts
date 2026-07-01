import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyApiKey, ApiKeyError } from "../../../../../lib/verify-api-key";

export const runtime = "nodejs";

function db() {
  return createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// POST /api/v1/subscriptions/[id]/cancel
// Cancels an active subscription. The worker will no longer collect payments for it.
// The on-chain delegation still exists until the subscriber revokes it themselves.
// Returns 409 if the subscription is not currently active.
export async function POST(
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

  const { data: merchant } = await supa
    .from("merchants")
    .select("id")
    .eq("destination_wallet", wallet)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  const { data: sub } = await supa
    .from("subscriptions")
    .select("id, subscription_pda, plan_id, subscriber_wallet, status")
    .eq("subscription_pda", id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  // Ensure this subscription belongs to the authenticated merchant's plan.
  const { data: plan } = await supa
    .from("plans")
    .select("id, plan_pda, name")
    .eq("id", sub.plan_id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  if (sub.status !== "active") {
    return NextResponse.json(
      { error: `Cannot cancel a subscription with status "${sub.status}".` },
      { status: 409 }
    );
  }

  const { error } = await supa
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("id", sub.id);

  if (error) throw error;

  return NextResponse.json({
    data: {
      id: sub.subscription_pda ?? sub.id,
      plan_id: plan.plan_pda,
      plan_name: plan.name,
      subscriber: sub.subscriber_wallet,
      status: "cancelled",
    },
  });
}
