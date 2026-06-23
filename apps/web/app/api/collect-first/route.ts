import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import {
  makeClient,
  collectPayment,
  ensureMerchantAta,
  findAssociatedTokenPda,
  TOKEN_PROGRAM,
} from "../../lib/solana-engine";
import { verifyAuth, AuthError } from "../../lib/verify-auth";
import { accrueReferral } from "../../lib/referral-accrue";
import {
  SORIO_MINT_ADDRESS,
  TOKEN_2022_PROGRAM,
  SORIO_FEE_DISCOUNT_THRESHOLD,
} from "../../lib/config";

export const runtime = "nodejs";

// Charge the FIRST payment immediately after a customer subscribes, instead of
// waiting for the hourly worker. Best-effort: if anything fails, we return a
// soft error and the worker will collect on its next run. This route mirrors
// the worker's subscription-collection logic for a single subscription.
export async function POST(req: NextRequest) {
  try {
    const { subscriptionId, wallet, timestamp, signature } = await req.json();
    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
    }

    // Verify the caller controls `wallet` and signed THIS subscription's charge.
    let verifiedWallet: string;
    try {
      verifiedWallet = verifyAuth({
        action: "subscribe-collect",
        wallet,
        timestamp,
        signature,
        params: { subscriptionId },
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

    // Load the subscription + its plan + merchant destination.
    const { data: sub, error: sErr } = await db
      .from("subscriptions")
      .select("id, subscriber_wallet, status, max_payments, plans(amount, merchant_amount, period_seconds, plan_pda, token_mint, merchants(destination_wallet))")
      .eq("id", subscriptionId)
      .single();
    if (sErr || !sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    // Ownership: the verified wallet must be the subscriber.
    if ((sub as any).subscriber_wallet !== verifiedWallet) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    // Only collect for active subscriptions.
    if (sub.status !== "active") {
      return NextResponse.json({ collected: false, reason: "not active" });
    }

    const plan: any = sub.plans;
    const destWallet = plan?.merchants?.destination_wallet;
    if (!destWallet) {
      return NextResponse.json({ collected: false, reason: "no merchant destination" });
    }

    // Guard against double-charging: if a successful payment already exists for
    // this subscription, don't collect again here (the worker handles the rest).
    const { count: existingSuccess } = await db
      .from("billing_history")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.id)
      .eq("status", "success");
    if ((existingSuccess ?? 0) > 0) {
      return NextResponse.json({ collected: false, reason: "already charged" });
    }

    // Build the puller client (collector key from env).
    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client, signer: puller } = await makeClient(pullerBytes);

    const mint = address(plan.token_mint);
    const feeWallet = address(process.env.PLATFORM_FEE_WALLET!);

    // Ensure the fee wallet's token account exists (idempotent).
    try {
      await ensureMerchantAta(puller, feeWallet, mint);
    } catch (e: any) {
      console.log("collect-first: ensure fee ATA (non-fatal):", e?.message ?? e);
    }

    // Amounts.
    const total = BigInt(plan.amount);
    const merchantAmount = plan.merchant_amount != null ? BigInt(plan.merchant_amount) : total;

    // $SORIO holder discount: if the SUBSCRIBER holds >= threshold, charge a
    // 0.5% fee (of merchant amount) instead of the baked-in 2%. The puller can
    // pull less than the authorized total, so we just pull a smaller fee.
    let feeAmount = total - merchantAmount; // default: baked-in fee (2%)
    try {
      const [sorioAta] = await findAssociatedTokenPda({
        owner: address(sub.subscriber_wallet),
        mint: address(SORIO_MINT_ADDRESS),
        tokenProgram: address(TOKEN_2022_PROGRAM),
      });
      const b = await client.rpc.getTokenAccountBalance(sorioAta).send();
      if (BigInt(b.value.amount) >= SORIO_FEE_DISCOUNT_THRESHOLD) {
        feeAmount = (merchantAmount * 50n) / 10000n; // 0.5% = 50/10000
        console.log("collect-first: subscriber is $SORIO holder -> discounted fee", feeAmount.toString());
      }
    } catch {
      // no $SORIO account / unreadable -> not a holder, keep default fee
    }

    const [merchantAta] = await findAssociatedTokenPda({
      owner: address(destWallet),
      mint,
      tokenProgram: TOKEN_PROGRAM,
    });
    const [feeAta] = await findAssociatedTokenPda({
      owner: feeWallet,
      mint,
      tokenProgram: TOKEN_PROGRAM,
    });

    // Double-fee guard: reuse a fee already pulled this cycle (a prior partial
    // failure leaves a row with fee_tx set and tx_signature null).
    let feeSig: string | null = null;
    let feeAlreadyPulled = false;
    {
      const { data: pendingFee } = await db
        .from("billing_history")
        .select("fee_tx")
        .eq("subscription_id", sub.id)
        .not("fee_tx", "is", null)
        .is("tx_signature", null)
        .order("attempted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingFee?.fee_tx) {
        feeSig = pendingFee.fee_tx;
        feeAlreadyPulled = true;
        console.log("collect-first: fee already pulled this cycle, skipping fee pull", feeSig);
      }
    }

    let ok = false;
    let sig: string | null = null;
    let reason: string | null = null;
    try {
      // Pull #1: FEE first (customer -> fee wallet) — unless already pulled.
      if (feeAmount > 0n && !feeAlreadyPulled) {
        const feeRes = await collectPayment(client, puller, {
          amount: feeAmount,
          delegator: address(sub.subscriber_wallet),
          mint,
          planPda: address(plan.plan_pda),
          receiverAta: feeAta,
        });
        feeSig = feeRes.signature;
        console.log("collect-first FEE:", feeSig);
      }
      // Pull #2: merchant's share (customer -> merchant).
      const res = await collectPayment(client, puller, {
        amount: merchantAmount,
        delegator: address(sub.subscriber_wallet),
        mint,
        planPda: address(plan.plan_pda),
        receiverAta: merchantAta,
      });
      sig = res.signature;
      ok = true;
      console.log("collect-first MERCHANT:", sig);
    } catch (e: any) {
      reason = e?.message ?? String(e);
      console.log("collect-first failed:", reason);
    }

    // Record the attempt (fee_tx stored even on partial failure for the guard).
    await db.from("billing_history").insert({
      subscription_id: sub.id,
      amount: plan.amount,
      status: ok ? "success" : "failed",
      tx_signature: sig,
      fee_tx: feeSig,
      failure_reason: reason,
    });

    if (!ok) {
      // Soft failure — worker will retry. Leave next_collection_at as-is (now).
      return NextResponse.json({ collected: false, reason });
    }

    // Referral accrual: if the subscriber was referred, accrue 0.4% of the
    // merchant amount to their inviter. Non-fatal (helper swallows errors).
    await accrueReferral(db, sub.subscriber_wallet, merchantAmount);

    // Success: advance, or complete if the cap is already reached.
    const nowIso = new Date().toISOString();
    if (sub.max_payments != null && sub.max_payments <= 1) {
      await db
        .from("subscriptions")
        .update({ status: "completed", last_collection_at: nowIso })
        .eq("id", sub.id);
      return NextResponse.json({ collected: true, signature: sig, completed: true });
    }

    const next = new Date(Date.now() + plan.period_seconds * 1000).toISOString();
    await db
      .from("subscriptions")
      .update({ next_collection_at: next, last_collection_at: nowIso })
      .eq("id", sub.id);

    return NextResponse.json({ collected: true, signature: sig });
  } catch (e: any) {
    console.error("collect-first error:", e?.message ?? e);
    // Soft error — never block the subscribe flow.
    return NextResponse.json({ collected: false, reason: e?.message ?? "error" }, { status: 200 });
  }
}