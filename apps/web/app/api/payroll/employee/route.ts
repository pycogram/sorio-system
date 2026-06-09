import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Find payroll_items where this wallet is the employee, with the parent payroll info.
    const { data, error } = await db
      .from("payroll_items")
      .select("id, amount, status, next_payment_at, last_payment_at, payrolls(name, employer_wallet, period_seconds), payroll_history(amount, status, salary_tx, paid_at)")
      .eq("employee_wallet", wallet)
      .neq("status", "removed")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    console.error("payroll employee fetch failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}