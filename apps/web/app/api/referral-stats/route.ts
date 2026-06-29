import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import { makeClient, findAssociatedTokenPda } from "../../lib/solana-engine";
import {
  SORIO_MINT_ADDRESS,
  TOKEN_2022_PROGRAM,
  SORIO_FEE_DISCOUNT_THRESHOLD,
} from "../../lib/config";
import { getOrCreateInviteCode } from "../../lib/invite-code";

export const runtime = "nodejs";

// GET /api/referral-stats?wallet=<addr>
// Returns the user's invite code, referral stats, and whether they currently
// hold enough $SORIO to be paid out. Public read keyed by wallet (no secrets);
// the data is the user's own referral summary.
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // The user's invite code (create on first visit).
    const code = await getOrCreateInviteCode(db, wallet);

    // Their referrals (as inviter).
    const { data: refs } = await db
      .from("referrals")
      .select("status, accrued_usd, total_paid_usd")
      .eq("inviter_wallet", wallet);

    const list = refs ?? [];
    const invitedTotal = list.length;
    const confirmedCount = list.filter((r: any) => r.status === "confirmed").length;
    const pendingCount = list.filter((r: any) => r.status === "pending").length;
    const accruedBaseUnits = list.reduce((s: number, r: any) => s + Number(r.accrued_usd ?? 0), 0);
    const paidBaseUnits = list.reduce((s: number, r: any) => s + Number(r.total_paid_usd ?? 0), 0);

    // Holder status: do they currently hold >= 20k $SORIO (needed for payout)?
    let isHolder = false;
    try {
      const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
      const { client } = await makeClient(pullerBytes);
      const [ata] = await findAssociatedTokenPda({
        owner: address(wallet),
        mint: address(SORIO_MINT_ADDRESS),
        tokenProgram: address(TOKEN_2022_PROGRAM),
      });
      const bal = await client.rpc.getTokenAccountBalance(ata).send();
      isHolder = BigInt(bal.value.amount) >= SORIO_FEE_DISCOUNT_THRESHOLD;
    } catch {
      isHolder = false;
    }

    const { data: pendingPayout } = await db
      .from("payout_requests")
      .select("id")
      .eq("inviter_wallet", wallet)
      .eq("status", "pending")
      .maybeSingle();

    return NextResponse.json({
      code,
      stats: {
        invitedTotal,
        confirmedCount,
        pendingCount,
        accruedBaseUnits,   // owed, not yet paid (USDC base units)
        paidBaseUnits,      // already paid out
      },
      isHolder,
      payoutThresholdUsd: 1, // min $1 to pay out
      hasPendingPayout: !!pendingPayout,
    });
  } catch (e: any) {
    console.error("referral-stats failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}