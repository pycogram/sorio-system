import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyAuth, AuthError } from "../../../lib/verify-auth";

export async function POST(req: Request) {
  try {
    const { itemId, subscriptionPda, startDate, wallet, timestamp, signature } = await req.json();
    if (!itemId || !subscriptionPda) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Verify the flow signature (signed once at the start of the approve flow).
    let verifiedWallet: string;
    try {
      verifiedWallet = verifyAuth({
        action: "payroll-approve",
        wallet,
        timestamp,
        signature,
        params: { itemId },
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
    const { data: item } = await db
      .from("payroll_items")
      .select("id, payrolls(employer_wallet)")
      .eq("id", itemId)
      .maybeSingle();

    const ownerWallet = (item as any)?.payrolls?.employer_wallet ?? null;
    if (!item || ownerWallet !== verifiedWallet) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

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