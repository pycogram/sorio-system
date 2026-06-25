import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import { makeClient, sendUsdc, findAssociatedTokenPda, TOKEN_PROGRAM } from "../../../lib/solana-engine";
import { USDC_MINT_ADDRESS } from "../../../lib/config";
import { verifyAdmin } from "../verify-admin";
import { AuthError } from "../../../lib/verify-auth";

export const runtime = "nodejs";

const USDC_DECIMALS = 6;

// POST /api/admin/referral-payout
// Body: { requestId, action: "paid"|"rejected", wallet, timestamp, signature }
// Admin-gated.
//   "rejected" -> close the request, no money moves.
//   "paid"     -> SEND the inviter's CURRENT accrued USDC from the bonus wallet,
//                 confirm it landed, THEN reset accrued + record the tx.
export async function POST(req: NextRequest) {
  try {
    const { requestId, action, wallet, timestamp, signature } = await req.json();
    if (!requestId || (action !== "paid" && action !== "rejected")) {
      return NextResponse.json({ error: "Missing requestId or invalid action" }, { status: 400 });
    }

    try {
      verifyAdmin({
        action: "admin-referral-payout",
        wallet, timestamp, signature,
        params: { requestId, op: action },
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

    const { data: request, error: rErr } = await db
      .from("payout_requests")
      .select("id, inviter_wallet, status")
      .eq("id", requestId)
      .single();
    if (rErr || !request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (request.status !== "pending") {
      return NextResponse.json({ error: "Request already handled" }, { status: 400 });
    }

    if (action === "rejected") {
      await db.from("payout_requests").update({ status: "rejected" }).eq("id", requestId);
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // --- action === "paid": actually send USDC from the bonus wallet ---
    const inviter = request.inviter_wallet;

    // Current accrued balance (pay what's owed NOW, not the request-time amount).
    const { data: refs } = await db
      .from("referrals")
      .select("id, accrued_usd, total_paid_usd")
      .eq("inviter_wallet", inviter);
    const rows = refs ?? [];
    const totalAccrued = rows.reduce((s: number, r: any) => s + Number(r.accrued_usd ?? 0), 0);

    if (totalAccrued <= 0) {
      return NextResponse.json({ error: "Nothing accrued to pay" }, { status: 400 });
    }

    // Load the bonus wallet signer.
    if (!process.env.BONUS_WALLET_SECRET) {
      return NextResponse.json({ error: "Bonus wallet not configured" }, { status: 500 });
    }
    const bonusBytes = new Uint8Array(JSON.parse(process.env.BONUS_WALLET_SECRET));
    const { client, signer: bonus } = await makeClient(bonusBytes);

    // Pre-flight: does the bonus wallet hold enough USDC?
    try {
      const [bonusAta] = await findAssociatedTokenPda({
        owner: bonus.address,
        mint: address(USDC_MINT_ADDRESS),
        tokenProgram: TOKEN_PROGRAM,
      });
      const bal = await client.rpc.getTokenAccountBalance(bonusAta).send();
      if (BigInt(bal.value.amount) < BigInt(totalAccrued)) {
        return NextResponse.json(
          { error: "Bonus wallet has insufficient USDC for this payout" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json({ error: "Could not read bonus wallet balance" }, { status: 500 });
    }

    // Send the payout. Throws if it doesn't confirm on-chain.
    let paidTx: string;
    try {
      const res = await sendUsdc(
        bonus,
        address(inviter),
        address(USDC_MINT_ADDRESS),
        BigInt(totalAccrued),
        USDC_DECIMALS
      );
      paidTx = res.signature;
    } catch (e: any) {
      // Send failed / not confirmed -> do NOT reset anything; request stays pending.
      console.error("payout send failed:", e?.message ?? e);
      return NextResponse.json(
        { error: `Payout send failed: ${e?.message ?? e}. Nothing was reset; you can retry.` },
        { status: 500 }
      );
    }

    // Confirmed sent. NOW reset accrued + record (confirm-first ordering).
    const nowIso = new Date().toISOString();
    for (const r of rows) {
      const acc = Number(r.accrued_usd ?? 0);
      if (acc <= 0) continue;
      await db
        .from("referrals")
        .update({
          accrued_usd: 0,
          total_paid_usd: Number(r.total_paid_usd ?? 0) + acc,
          last_payout_at: nowIso,
        })
        .eq("id", r.id);
    }

    await db
      .from("payout_requests")
      .update({
        status: "paid",
        paid_at: nowIso,
        paid_amount_usd: totalAccrued,
        paid_tx: paidTx,
      })
      .eq("id", requestId);

    return NextResponse.json({ ok: true, status: "paid", paidAmount: totalAccrued, tx: paidTx });
  } catch (e: any) {
    console.error("admin payout failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}