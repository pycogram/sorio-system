import { NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";
import { makeClient, findAssociatedTokenPda } from "../../lib/solana-engine";
import {
  SORIO_MINT_ADDRESS,
  TOKEN_2022_PROGRAM,
  SORIO_FEE_DISCOUNT_THRESHOLD,
} from "../../lib/config";

export const runtime = "nodejs";

// GET /api/sorio-balance?wallet=<addr>
// Returns whether the wallet holds enough $SORIO to qualify for the fee
// discount, plus the raw balance. Read-only; safe to call from the client.
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    }

    // Read-only client (puller key) just to query chain balance.
    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client } = await makeClient(pullerBytes);

    let balance = 0n;
    try {
      const [sorioAta] = await findAssociatedTokenPda({
        owner: address(wallet),
        mint: address(SORIO_MINT_ADDRESS),
        tokenProgram: address(TOKEN_2022_PROGRAM),
      });
      const b = await client.rpc.getTokenAccountBalance(sorioAta).send();
      balance = BigInt(b.value.amount);
    } catch {
      balance = 0n; // no $SORIO account / unreadable -> not a holder
    }

    const isHolder = balance >= SORIO_FEE_DISCOUNT_THRESHOLD;

    return NextResponse.json({
      isHolder,
      balance: balance.toString(),
    });
  } catch (e: any) {
    console.error("sorio-balance failed:", e?.message ?? e);
    // On error, treat as non-holder (safe default) rather than blocking the page.
    return NextResponse.json({ isHolder: false, balance: "0" });
  }
}