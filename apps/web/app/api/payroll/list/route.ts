import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const supabase = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

    const { data: payrolls, error } = await supabase
      .from("payrolls")
      .select("id, name, period_seconds, token_mint, created_at, hidden, payroll_items(id, employee_wallet, amount, status, plan_pda, subscription_pda, next_payment_at, last_payment_at, payroll_history(amount, fee, status, salary_tx, paid_at))")
      .eq("employer_wallet", wallet)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ payrolls: payrolls ?? [] });
  } catch (e: any) {
    console.error("payroll list failed:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}