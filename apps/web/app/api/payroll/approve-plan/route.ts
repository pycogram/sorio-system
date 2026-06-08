import { NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";
import { createClient as createDb } from "@supabase/supabase-js";
import { makeClient, createPlan, ensureMerchantAta } from "../../../../../../packages/solana/src/index";

export const runtime = "nodejs";
const USDC_MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

export async function POST(req: NextRequest) {
  try {
    const { itemId } = await req.json();
    if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Load the payroll_item + its payroll (for the schedule).
    const { data: item, error: iErr } = await db
      .from("payroll_items")
      .select("id, employee_wallet, amount, status, plan_pda, payrolls(period_seconds)")
      .eq("id", itemId)
      .single();
    if (iErr) throw iErr;
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

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

    // amount stored = the employee's SALARY (micro-USDC). Employer bears 2% fee.
    const salary = BigInt(item.amount);
    const feePercent = Number(process.env.PLATFORM_FEE_PERCENT ?? "2");
    const total = salary + (salary * BigInt(Math.round(feePercent * 100))) / 10000n;

    // On-chain plan amount = the TOTAL the employer authorizes (salary + fee).
    const periodSeconds = (item.payrolls as any)?.period_seconds ?? 2592000;
    const periodHours = Math.max(1, Math.round(periodSeconds / 3600));
    const planId = BigInt(Date.now());

    const { planPda, planBump } = await createPlan(client, platform, {
      planId,
      mint: USDC_MINT,
      amount: total,
      periodHours,
    });

    // Ensure the employee's USDC account exists so pay-outs can land.
    try {
      await ensureMerchantAta(platform, address(item.employee_wallet), USDC_MINT);
    } catch (e: any) {
      console.error("ensureMerchantAta (employee) failed (non-fatal):", e?.message ?? e);
    }

    // Save plan info onto the payroll_item (still 'pending' until employer signs).
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