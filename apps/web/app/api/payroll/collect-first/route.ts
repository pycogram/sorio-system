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
import { verifyAuth, AuthError } from "../../../lib/verify-auth";
import { accrueReferral } from "../../../lib/referral-accrue";

export const runtime = "nodejs";

// Pay the FIRST salary immediately when an employer chooses "Pay now" on
// approval. Best-effort and idempotent.
export async function POST(req: NextRequest) {
  try {
    const { itemId, wallet, timestamp, signature } = await req.json();
    if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

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

    const { data: item, error: iErr } = await db
      .from("payroll_items")
      .select("id, employee_wallet, amount, status, plan_pda, max_payments, payrolls(employer_wallet, period_seconds, token_mint, fee_percent)")
      .eq("id", itemId)
      .single();
    if (iErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const pr: any = item.payrolls;
    const employer = pr?.employer_wallet;

    // Ownership check uses the VERIFIED wallet.
    if (employer !== verifiedWallet) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    if (item.status !== "active" || !item.plan_pda) {
      return NextResponse.json({ paid: false, reason: "not active" });
    }

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

    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client, signer: puller } = await makeClient(pullerBytes);

    try {
      await ensureMerchantAta(puller, feeWallet, mint);
    } catch (e: any) {
      console.log("payroll collect-first: ensure fee ATA (non-fatal):", e?.message ?? e);
    }

    const salary = BigInt(item.amount);
    // Use the rate locked on the payroll at creation ($SORIO holder discount).
    const feePercent = Number(pr?.fee_percent ?? 2);
    const fee = (salary * BigInt(Math.round(feePercent * 100))) / 10000n;
    const totalNeeded = salary + fee;

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

    // Double-fee guard: reuse a fee already pulled this cycle (a prior partial
    // failure leaves a row with fee_tx set and salary_tx null).
    let feeSig: string | null = null;
    let feeAlreadyPulled = false;
    {
      const { data: pendingFee } = await db
        .from("payroll_history")
        .select("fee_tx")
        .eq("payroll_item_id", item.id)
        .not("fee_tx", "is", null)
        .is("salary_tx", null)
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingFee?.fee_tx) {
        feeSig = pendingFee.fee_tx;
        feeAlreadyPulled = true;
        console.log("payroll collect-first: fee already pulled this cycle, skipping", feeSig);
      }
    }

    let ok = false;
    let sig: string | null = null;
    let reason: string | null = null;
    try {
      if (fee > 0n && !feeAlreadyPulled) {
        const feeRes = await collectPayment(client, puller, {
          amount: fee,
          delegator: address(employer),
          mint,
          planPda: address(item.plan_pda),
          receiverAta: feeAta,
        });
        feeSig = feeRes.signature;
        console.log("payroll collect-first FEE:", feeSig);
      }
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

    await db.from("payroll_history").insert({
      payroll_item_id: item.id,
      amount: Number(salary),
      fee: Number(fee),
      status: ok ? "success" : "failed",
      salary_tx: sig,
      fee_tx: feeSig,
      failure_reason: reason,
    });

    if (!ok) {
      return NextResponse.json({ paid: false, reason });
    }

    // Referral accrual: if the employer was referred, accrue 0.4% of the salary
    // to their inviter. Non-fatal. (Employer is the payer/invitee for payroll.)
    await accrueReferral(db, employer, salary);

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