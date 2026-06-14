import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyAuth, AuthError } from "../../../lib/verify-auth";

export async function POST(req: Request) {
  try {
    const { itemId, wallet, timestamp, signature } = await req.json();
    if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

    // Verify the caller controls `wallet` and signed THIS action.
    let verifiedWallet: string;
    try {
      verifiedWallet = verifyAuth({
        action: "payroll-remove",
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

    const { error } = await db
      .from("payroll_items")
      .update({ status: "removed" })
      .eq("id", itemId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("payroll remove failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}