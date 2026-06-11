import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { address } from "@solana/kit";
import { createClient as createDb } from "@supabase/supabase-js";
import { makeClient, createPlan, ensureMerchantAta } from "@paylo/solana";

export const runtime = "nodejs";

const USDC_MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const periodHoursMap: Record<string, number> = {
  weekly: 168,
  monthly: 720,
  yearly: 8760,
};

export async function POST(req: NextRequest) {
  try {
    const { name, amount, period, destinationWallet } = await req.json();

    if (!name || !amount || !destinationWallet) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client, signer: platform } = await makeClient(pullerBytes);

    // amount: USDC has 6 decimals. `amount` is what the MERCHANT wants to receive.
    const merchantAmount = BigInt(Math.round(parseFloat(amount) * 1_000_000));

    // Platform fee (default 2%) baked into the customer-facing total.
    const feePercent = Number(process.env.PLATFORM_FEE_PERCENT ?? "2");
    const total = merchantAmount + (merchantAmount * BigInt(Math.round(feePercent * 100))) / 10000n;
    
    // The on-chain plan (what the customer authorizes) is the TOTAL.
    const amountBaseUnits = total;
    const periodHours = periodHoursMap[period] ?? 720;
    const planId = BigInt(Date.now());

    const { planPda, planBump } = await createPlan(client, platform, {
      planId,
      mint: USDC_MINT,
      amount: amountBaseUnits,
      periodHours,
    });

    // Ensure the merchant's USDC account exists so collections can land there.
    try {
      await ensureMerchantAta(platform, address(destinationWallet), USDC_MINT);
    } catch (e: any) {
      console.error("ensureMerchantAta failed (non-fatal):", e?.message ?? e);
    }

    // Insert into Supabase
    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // reuse-or-create merchant keyed by destination wallet
    let merchantId: string;
    const { data: existing } = await db
      .from("merchants")
      .select("id")
      .eq("wallet_address", destinationWallet)
      .maybeSingle();

    if (existing) {
      merchantId = existing.id;
    } else {
      const { data: m, error } = await db
        .from("merchants")
        .insert({
          wallet_address: destinationWallet,
          destination_wallet: destinationWallet,
          name: "Merchant",
        })
        .select("id")
        .single();
      if (error) throw error;
      merchantId = m.id;
    }

    const { error: pErr } = await db.from("plans").insert({
      merchant_id: merchantId,
      plan_pda: planPda,
      name,
      amount: Number(amountBaseUnits),
      merchant_amount: Number(merchantAmount),
      token_mint: USDC_MINT,
      period_seconds: periodHours * 3600,
      plan_id_raw: planId.toString(),
      plan_bump: planBump,
    });
    
    if (pErr) throw pErr;

    return NextResponse.json({ planPda });
  } catch (e: any) {
    console.error("create-plan failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}