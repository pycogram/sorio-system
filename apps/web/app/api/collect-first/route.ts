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

export const runtime = "nodejs";

// Charge the FIRST payment immediately after a customer subscribes, instead of
// waiting for the hourly worker. Best-effort: if anything fails, we return a
// soft error and the worker will collect on its next run. This route mirrors
// the worker's subscription-collection logic for a single subscription.
export async function POST(req: NextRequest) {
  try {
    const { subscriptionId } = await req.json();
    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
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
    const feeAmount = total - merchantAmount;

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

    let ok = false;
    let sig: string | null = null;
    let reason: string | null = null;
    try {
      // Pull #1: FEE first (customer -> fee wallet).
      if (feeAmount > 0n) {
        const feeRes = await collectPayment(client, puller, {
          amount: feeAmount,
          delegator: address(sub.subscriber_wallet),
          mint,
          planPda: address(plan.plan_pda),
          receiverAta: feeAta,
        });
        console.log("collect-first FEE:", feeRes.signature);
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

    // Record the attempt.
    await db.from("billing_history").insert({
      subscription_id: sub.id,
      amount: plan.amount,
      status: ok ? "success" : "failed",
      tx_signature: sig,
      failure_reason: reason,
    });

    if (!ok) {
      // Soft failure — worker will retry. Leave next_collection_at as-is (now).
      return NextResponse.json({ collected: false, reason });
    }

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