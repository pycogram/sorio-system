import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import {
  makeClient,
  collectPayment,
  ensureMerchantAta,
  findAssociatedTokenPda,
  TOKEN_PROGRAM,
} from "../../../lib/solana-engine";

export const runtime = "nodejs";

const FEE_PERCENT = 2;

// Pay the FIRST salary immediately when an employer chooses "Pay now" on
// approval. Best-effort and idempotent: if a successful payment already exists
// for this item, it won't pay again. Mirrors the worker's payroll logic for a
// single payroll_item.
export async function POST(req: NextRequest) {
  try {
    const { itemId, wallet } = await req.json();
    if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Load the item + its payroll (period, mint, employer).
    const { data: item, error: iErr } = await db
      .from("payroll_items")
      .select("id, employee_wallet, amount, status, plan_pda, max_payments, payrolls(employer_wallet, period_seconds, token_mint)")
      .eq("id", itemId)
      .single();
    if (iErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const pr: any = item.payrolls;
    const employer = pr?.employer_wallet;

    // Ownership check.
    if (wallet && employer && wallet !== employer) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    if (item.status !== "active" || !item.plan_pda) {
      return NextResponse.json({ paid: false, reason: "not active" });
    }

    // Idempotency: don't pay if a successful payment already exists.
    const { count: existingSuccess } = await db
      .from("payroll_history")
      .select("id", { count: "exact", head: true })
      .eq("payroll_item_id", item.id)
      .eq("status", "success");
    if ((existingSuccess ?? 0) > 0) {
      return NextResponse.json({ paid: false, reason: "already paid" });
    }

    const mint = address(pr.token_mint);
    const feeWallet = address(process.env.PLATFORM_FEE_WALLET!);

    // Build the puller client (collector key from env).
    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client, signer: puller } = await makeClient(pullerBytes);

    // Ensure the fee wallet token account exists (idempotent).
    try {
      await ensureMerchantAta(puller, feeWallet, mint);
    } catch (e: any) {
      console.log("payroll collect-first: ensure fee ATA (non-fatal):", e?.message ?? e);
    }

    const salary = BigInt(item.amount);
    const fee = (salary * BigInt(Math.round(FEE_PERCENT * 100))) / 10000n;
    const totalNeeded = salary + fee;

    // Check the employer's USDC balance covers salary + fee.
    const [employerAta] = await findAssociatedTokenPda({
      owner: address(employer),
      mint,
      tokenProgram: TOKEN_PROGRAM,
    });
    let balance = 0n;
    try {
      const bal = await client.rpc.getTokenAccountBalance(employerAta).send();
      balance = BigInt(bal.value.amount);
    } catch {
      return NextResponse.json({ paid: false, reason: "cannot read employer balance" });
    }
    if (balance < totalNeeded) {
      return NextResponse.json({ paid: false, reason: "insufficient funds" });
    }

    const [feeAta] = await findAssociatedTokenPda({
      owner: feeWallet,
      mint,
      tokenProgram: TOKEN_PROGRAM,
    });
    const [employeeAta] = await findAssociatedTokenPda({
      owner: address(item.employee_wallet),
      mint,
      tokenProgram: TOKEN_PROGRAM,
    });

    let ok = false;
    let sig: string | null = null;
    let reason: string | null = null;
    try {
      // Pull #1: FEE first (employer -> fee wallet).
      if (fee > 0n) {
        const feeRes = await collectPayment(client, puller, {
          amount: fee,
          delegator: address(employer),
          mint,
          planPda: address(item.plan_pda),
          receiverAta: feeAta,
        });
        console.log("payroll collect-first FEE:", feeRes.signature);
      }
      // Pull #2: SALARY (employer -> employee).
      const salRes = await collectPayment(client, puller, {
        amount: salary,
        delegator: address(employer),
        mint,
        planPda: address(item.plan_pda),
        receiverAta: employeeAta,
      });
      sig = salRes.signature;
      ok = true;
      console.log("payroll collect-first SALARY:", sig);
    } catch (e: any) {
      reason = e?.message ?? String(e);
      console.log("payroll collect-first failed:", reason);
    }

    // Record the attempt.
    await db.from("payroll_history").insert({
      payroll_item_id: item.id,
      amount: Number(salary),
      fee: Number(fee),
      status: ok ? "success" : "failed",
      salary_tx: sig,
      fee_tx: null,
      failure_reason: reason,
    });

    if (!ok) {
      return NextResponse.json({ paid: false, reason });
    }

    // Success: advance, or complete if the cap is reached.
    const nowIso = new Date().toISOString();
    if (item.max_payments != null && item.max_payments <= 1) {
      await db
        .from("payroll_items")
        .update({ status: "completed", last_payment_at: nowIso })
        .eq("id", item.id);
      return NextResponse.json({ paid: true, signature: sig, completed: true });
    }

    const next = new Date(Date.now() + pr.period_seconds * 1000).toISOString();
    await db
      .from("payroll_items")
      .update({ next_payment_at: next, last_payment_at: nowIso })
      .eq("id", item.id);

    return NextResponse.json({ paid: true, signature: sig });
  } catch (e: any) {
    console.error("payroll collect-first error:", e?.message ?? e);
    return NextResponse.json({ paid: false, reason: e?.message ?? "error" }, { status: 200 });
  }
}