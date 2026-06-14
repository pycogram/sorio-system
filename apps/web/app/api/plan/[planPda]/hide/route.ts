import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyAuth, AuthError } from "../../../../lib/verify-auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planPda: string }> }
) {
  const { planPda } = await params;
  const { wallet, timestamp, signature, hidden } = await req.json();

  if (!planPda) return NextResponse.json({ error: "planPda required" }, { status: 400 });
  if (typeof hidden !== "boolean") {
    return NextResponse.json({ error: "hidden (boolean) required" }, { status: 400 });
  }

  // Verify the caller controls `wallet` and signed THIS action.
  let verifiedWallet: string;
  try {
    verifiedWallet = verifyAuth({
      action: "plan-hide",
      wallet,
      timestamp,
      signature,
      params: { planPda, hidden },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const db = createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Ownership check uses the VERIFIED wallet.
  const { data: merchant } = await db
    .from("merchants")
    .select("id")
    .eq("destination_wallet", verifiedWallet)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const { data: plan } = await db
    .from("plans")
    .select("id, merchant_id")
    .eq("plan_pda", planPda)
    .maybeSingle();

  if (!plan || plan.merchant_id !== merchant.id) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const { error } = await db
    .from("plans")
    .update({ hidden })
    .eq("plan_pda", planPda);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hidden });
}