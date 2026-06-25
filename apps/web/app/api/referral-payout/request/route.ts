import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import { makeClient, findAssociatedTokenPda } from "../../../lib/solana-engine";
import {
  SORIO_MINT_ADDRESS,
  TOKEN_2022_PROGRAM,
  SORIO_FEE_DISCOUNT_THRESHOLD,
} from "../../../lib/config";
import { verifyAuth, AuthError } from "../../../lib/verify-auth";

export const runtime = "nodejs";

const MIN_PAYOUT_BASE = 1_000_000; // $1 in USDC base units

// POST /api/referral-payout/request
// Body: { wallet, timestamp, signature }
// The inviter requests a payout. Verifies signature, that they have >= $1
// accrued and currently hold >= 20k $SORIO, then creates a pending request
// (one at a time).
export async function POST(req: NextRequest) {
  try {
    const { wallet, timestamp, signature } = await req.json();

    let inviter: string;
    try {
      inviter = verifyAuth({
        action: "referral-payout-request",
        wallet, timestamp, signature,
        params: {},
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

    // Sum the inviter's accrued balance across their referrals.
    const { data: refs } = await db
      .from("referrals")
      .select("accrued_usd")
      .eq("inviter_wallet", inviter);
    const accrued = (refs ?? []).reduce((s: number, r: any) => s + Number(r.accrued_usd ?? 0), 0);

    if (accrued < MIN_PAYOUT_BASE) {
      return NextResponse.json({ error: "Minimum payout is $1." }, { status: 400 });
    }

    // Must currently hold >= 20k $SORIO.
    let isHolder = false;
    try {
      const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
      const { client } = await makeClient(pullerBytes);
      const [ata] = await findAssociatedTokenPda({
        owner: address(inviter),
        mint: address(SORIO_MINT_ADDRESS),
        tokenProgram: address(TOKEN_2022_PROGRAM),
      });
      const bal = await client.rpc.getTokenAccountBalance(ata).send();
      isHolder = BigInt(bal.value.amount) >= SORIO_FEE_DISCOUNT_THRESHOLD;
    } catch {
      isHolder = false;
    }
    if (!isHolder) {
      return NextResponse.json({ error: "You must hold 20,000 $SORIO to request a payout." }, { status: 400 });
    }

    // Already a pending request?
    const { data: existing } = await db
      .from("payout_requests")
      .select("id")
      .eq("inviter_wallet", inviter)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "You already have a pending payout request." }, { status: 400 });
    }

    const { error } = await db.from("payout_requests").insert({
      inviter_wallet: inviter,
      amount_usd: accrued,
      status: "pending",
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, requested: accrued });
  } catch (e: any) {
    console.error("payout request failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}