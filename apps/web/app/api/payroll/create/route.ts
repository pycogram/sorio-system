import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import { makeClient, findAssociatedTokenPda } from "../../../lib/solana-engine";
import {
  USDC_MINT_ADDRESS,
  SORIO_MINT_ADDRESS,
  TOKEN_2022_PROGRAM,
  SORIO_FEE_DISCOUNT_THRESHOLD,
  FEE_PERCENT_STANDARD,
  FEE_PERCENT_HOLDER,
} from "../../../lib/config";

export const runtime = "nodejs";
const TOKEN_MINT = USDC_MINT_ADDRESS;

// Read an employer's $SORIO balance (base units). Returns 0n if the token
// account doesn't exist or can't be read (treated as "not a holder").
// $SORIO is Token-2022, so we derive the ATA under that program.
async function readSorioBalance(client: any, owner: string): Promise<bigint> {
  try {
    const [ata] = await findAssociatedTokenPda({
      owner: address(owner),
      mint: address(SORIO_MINT_ADDRESS),
      tokenProgram: address(TOKEN_2022_PROGRAM),
    });
    const bal = await client.rpc.getTokenAccountBalance(ata).send();
    return BigInt(bal.value.amount);
  } catch {
    return 0n;
  }
}

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

    // --- $SORIO holder fee discount (decided once, at creation) ---
    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client } = await makeClient(pullerBytes);
    const sorioBalance = await readSorioBalance(client, employerWallet);
    const isHolder = sorioBalance >= SORIO_FEE_DISCOUNT_THRESHOLD;
    const feePercent = isHolder ? FEE_PERCENT_HOLDER : FEE_PERCENT_STANDARD;
    console.log(
      `payroll create: employer ${employerWallet} $SORIO=${sorioBalance} holder=${isHolder} fee=${feePercent}%`
    );

    // 1. Create the payroll group (store the locked fee rate)
    const { data: payroll, error: pErr } = await supabase
      .from("payrolls")
      .insert({
        employer_wallet: employerWallet,
        name,
        period_seconds: periodSeconds,
        token_mint: TOKEN_MINT,
        fee_percent: feePercent,
      })
      .select()
      .single();

    if (pErr) throw pErr;

    // 2. Insert the employees as payroll_items (pending until approved on-chain)
    const items = employees.map((e: { wallet: string; amount: number; maxPayments?: number | null }) => ({
      payroll_id: payroll.id,
      employee_wallet: e.wallet,
      amount: e.amount,
      status: "pending",
      max_payments:
        typeof e.maxPayments === "number" && e.maxPayments > 0 ? e.maxPayments : null,
    }));

    const { error: iErr } = await supabase.from("payroll_items").insert(items);
    if (iErr) throw iErr;

    return NextResponse.json({ payrollId: payroll.id, feePercent });
  } catch (e: any) {
    console.error("payroll create failed:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}