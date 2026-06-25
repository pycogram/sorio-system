import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import { makeClient, findAssociatedTokenPda } from "../../../lib/solana-engine";
import {
  SORIO_MINT_ADDRESS,
  TOKEN_2022_PROGRAM,
  SORIO_FEE_DISCOUNT_THRESHOLD,
} from "../../../lib/config";
import { verifyAdmin } from "../verify-admin";
import { AuthError } from "../../../lib/verify-auth";

export const runtime = "nodejs";

// GET /api/admin/referral-payout-list?wallet=..&timestamp=..&signature=..
// Admin-gated. Lists pending payout requests with the inviter's CURRENT accrued
// balance and live holder status (the fraud gate — pay only current holders).
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet") ?? undefined;
    const timestampRaw = req.nextUrl.searchParams.get("timestamp");
    const signature = req.nextUrl.searchParams.get("signature") ?? undefined;
    const timestamp = timestampRaw ? Number(timestampRaw) : undefined;

    try {
      verifyAdmin({ action: "admin-referral-payout-list", wallet, timestamp, signature, params: {} });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: requests } = await db
      .from("payout_requests")
      .select("id, inviter_wallet, amount_usd, requested_at")
      .eq("status", "pending")
      .order("requested_at", { ascending: true });

    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client } = await makeClient(pullerBytes);

    const out = [];
    for (const r of requests ?? []) {
      // Current accrued balance (may differ from request-time amount).
      const { data: refs } = await db
        .from("referrals")
        .select("accrued_usd")
        .eq("inviter_wallet", r.inviter_wallet);
      const currentAccrued = (refs ?? []).reduce((s: number, x: any) => s + Number(x.accrued_usd ?? 0), 0);

      // Live holder check.
      let isHolder = false;
      try {
        const [ata] = await findAssociatedTokenPda({
          owner: address(r.inviter_wallet),
          mint: address(SORIO_MINT_ADDRESS),
          tokenProgram: address(TOKEN_2022_PROGRAM),
        });
        const bal = await client.rpc.getTokenAccountBalance(ata).send();
        isHolder = BigInt(bal.value.amount) >= SORIO_FEE_DISCOUNT_THRESHOLD;
      } catch {
        isHolder = false;
      }

      out.push({
        id: r.id,
        inviterWallet: r.inviter_wallet,
        requestedAmount: r.amount_usd,
        currentAccrued,
        isHolder,
        requestedAt: r.requested_at,
      });
    }

    return NextResponse.json({ requests: out });
  } catch (e: any) {
    console.error("admin payout list failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}