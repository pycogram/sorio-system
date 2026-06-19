import { NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";
import { createClient as createDb } from "@supabase/supabase-js";
import { makeClient, createPlan, ensureMerchantAta } from "../../../lib/solana-engine";
import { USDC_MINT_ADDRESS } from "../../../lib/config";
import { verifyAuth, AuthError } from "../../../lib/verify-auth";

export const runtime = "nodejs";

const USDC_MINT = address(USDC_MINT_ADDRESS);

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

    // Load the payroll_item + its payroll (for the schedule + owner check).
    const { data: item, error: iErr } = await db
      .from("payroll_items")
      .select("id, employee_wallet, amount, status, plan_pda, payrolls(period_seconds, employer_wallet, fee_percent)")
      .eq("id", itemId)
      .single();
    if (iErr) throw iErr;
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // Ownership check uses the VERIFIED wallet.
    const ownerWallet = (item.payrolls as any)?.employer_wallet ?? null;
    if (ownerWallet !== verifiedWallet) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    // If a plan already exists for this item, reuse it (idempotent).
    if (item.plan_pda) {
      const { data: meta } = await db
        .from("payroll_items")
        .select("plan_pda, plan_id_raw, plan_bump")
        .eq("id", itemId)
        .single();
      return NextResponse.json({
        planPda: meta?.plan_pda,
        planId: meta?.plan_id_raw,
        planBump: meta?.plan_bump,
      });
    }

    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client, signer: platform } = await makeClient(pullerBytes);

    const salary = BigInt(item.amount);
    // Use the rate locked on the payroll at creation ($SORIO holder discount).
    const feePercent = Number((item.payrolls as any)?.fee_percent ?? 2);
    const total = salary + (salary * BigInt(Math.round(feePercent * 100))) / 10000n;

    const periodSeconds = (item.payrolls as any)?.period_seconds ?? 2592000;
    const periodHours = Math.max(1, Math.round(periodSeconds / 3600));
    const planId = BigInt(Date.now());

    const { planPda, planBump } = await createPlan(client, platform, {
      planId,
      mint: USDC_MINT,
      amount: total,
      periodHours,
    });

    try {
      await ensureMerchantAta(platform, address(item.employee_wallet), USDC_MINT);
    } catch (e: any) {
      console.error("ensureMerchantAta (employee) failed (non-fatal):", e?.message ?? e);
    }

    const { error: uErr } = await db
      .from("payroll_items")
      .update({
        plan_pda: planPda,
        plan_id_raw: planId.toString(),
        plan_bump: planBump,
      })
      .eq("id", itemId);
    if (uErr) throw uErr;

    return NextResponse.json({ planPda, planId: planId.toString(), planBump });
  } catch (e: any) {
    console.error("payroll approve-plan failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}