import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyAuth, AuthError } from "../../../../lib/verify-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { wallet, timestamp, signature, hidden } = body;

    // Verify the caller actually controls `wallet` and signed THIS action.
    let verifiedWallet: string;
    try {
      verifiedWallet = verifyAuth({
        action: "payroll-hide",
        wallet,
        timestamp,
        signature,
        params: { payrollId: id, hidden: !!hidden },
      });
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Ownership check now uses the VERIFIED wallet, not a claimed one.
    const { data: payroll } = await db
      .from("payrolls")
      .select("id, employer_wallet")
      .eq("id", id)
      .maybeSingle();

    if (!payroll || payroll.employer_wallet !== verifiedWallet) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    const { error } = await db
      .from("payrolls")
      .update({ hidden: !!hidden })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("payroll hide failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}