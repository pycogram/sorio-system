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

// GET /api/v1/plans
// Auth: Authorization: Bearer sk_live_xxx
// Returns the plans owned by the key's merchant wallet.
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
    .select("id, name")
    .eq("destination_wallet", wallet)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json({ data: [] });
  }

  const { data: plans } = await supa
    .from("plans")
    .select("id, plan_pda, name, amount, merchant_amount, period_seconds, active, hidden")
    .eq("merchant_id", merchant.id)
    .order("id", { ascending: false });

  const out = (plans ?? []).map((p: any) => ({
    id: p.plan_pda,
    name: p.name,
    amount: Number(p.amount),
    merchant_amount: Number(p.merchant_amount ?? p.amount),
    period_seconds: Number(p.period_seconds),
    active: p.active ?? true,
    hidden: p.hidden ?? false,
  }));

  return NextResponse.json({ data: out });
}
