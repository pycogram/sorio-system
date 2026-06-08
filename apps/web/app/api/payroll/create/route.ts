import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export async function POST(req: Request) {
  try {
    const supabase = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const body = await req.json();
    const { employerWallet, name, periodSeconds, employees } = body;

    if (!employerWallet || !name || !periodSeconds || !Array.isArray(employees) || employees.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Create the payroll group
    const { data: payroll, error: pErr } = await supabase
      .from("payrolls")
      .insert({
        employer_wallet: employerWallet,
        name,
        period_seconds: periodSeconds,
        token_mint: DEVNET_USDC,
      })
      .select()
      .single();

    if (pErr) throw pErr;

    // 2. Insert the employees as payroll_items (status 'pending' until approved on-chain)
    const items = employees.map((e: { wallet: string; amount: number }) => ({
      payroll_id: payroll.id,
      employee_wallet: e.wallet,
      amount: e.amount,
      status: "pending",
    }));

    const { error: iErr } = await supabase.from("payroll_items").insert(items);
    if (iErr) throw iErr;

    return NextResponse.json({ payrollId: payroll.id });
  } catch (e: any) {
    console.error("payroll create failed:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}