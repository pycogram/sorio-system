import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import { verifyApiKey, ApiKeyError } from "../../../lib/verify-api-key";
import { makeClient, createPlan, ensureMerchantAta } from "../../../lib/solana-engine";
import { USDC_MINT_ADDRESS } from "../../../lib/config";

export const runtime = "nodejs";

function db() {
  return createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET /api/v1/plans
// Auth: Authorization: Bearer sk_live_xxx
// Returns the plans owned by the key's merchant wallet.
export async function GET(req: Request) {
  let wallet: string;
  try {
    wallet = await verifyApiKey(req);
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supa = db();

  const { data: merchant } = await supa
    .from("merchants")
    .select("id, name")
    .eq("destination_wallet", wallet)
    .maybeSingle();

  if (!merchant) {
    return NextResponse.json({ data: [] });
  }

  const { data: plans } = await supa
    .from("plans")
    .select("id, plan_pda, name, amount, merchant_amount, period_seconds, active, hidden")
    .eq("merchant_id", merchant.id)
    .order("id", { ascending: false });

  const out = (plans ?? []).map((p: any) => ({
    id: p.plan_pda,
    name: p.name,
    amount: Number(p.amount),
    merchant_amount: Number(p.merchant_amount ?? p.amount),
    period_seconds: Number(p.period_seconds),
    active: p.active ?? true,
    hidden: p.hidden ?? false,
  }));

  return NextResponse.json({ data: out });
}

const VALID_PERIODS: Record<string, number> = {
  hourly: 1,
  daily: 24,
  weekly: 168,
  monthly: 720,
  yearly: 8760,
};

// POST /api/v1/plans
// Auth: Authorization: Bearer sk_live_xxx
// Body: { name, amount, period }
// Creates a plan on-chain and records it in the DB. Returns the new plan.
export async function POST(req: Request) {
  let wallet: string;
  try {
    wallet = await verifyApiKey(req);
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });

    const { name, amount, period } = body;

    // --- Input validation ---
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: "name must be 100 characters or fewer." }, { status: 400 });
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "amount must be a positive number (e.g. 9.99)." }, { status: 400 });
    }
    if (amountNum > 1_000_000) {
      return NextResponse.json({ error: "amount cannot exceed $1,000,000." }, { status: 400 });
    }

    if (!period || !VALID_PERIODS[period]) {
      return NextResponse.json({
        error: `period must be one of: ${Object.keys(VALID_PERIODS).join(", ")}.`,
      }, { status: 400 });
    }

    // --- Compute amounts ---
    // amount is what the merchant wants to receive. We add the platform fee on top
    // so the customer pays a slightly higher total (same logic as the UI flow).
    const merchantAmount = BigInt(Math.round(amountNum * 1_000_000));
    const feePercent = Number(process.env.PLATFORM_FEE_PERCENT ?? "2");
    const total = merchantAmount + (merchantAmount * BigInt(Math.round(feePercent * 100))) / 10000n;
    const periodHours = VALID_PERIODS[period];
    const planId = BigInt(Date.now());
    const USDC_MINT = address(USDC_MINT_ADDRESS);

    // --- Create on-chain ---
    // The platform puller keypair signs plan creation (merchant wallet not needed).
    const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
    const { client, signer: platform } = await makeClient(pullerBytes);

    const { planPda, planBump } = await createPlan(client, platform, {
      planId,
      mint: USDC_MINT,
      amount: total,
      periodHours,
    });

    // Ensure the merchant's USDC token account exists so collections can land there.
    try {
      await ensureMerchantAta(platform, address(wallet), USDC_MINT);
    } catch (e: any) {
      console.error("ensureMerchantAta failed (non-fatal):", e?.message ?? e);
    }

    // --- Write to DB ---
    const supa = db();

    // Reuse or create the merchant record for this wallet.
    let merchantId: string;
    const { data: existing } = await supa
      .from("merchants")
      .select("id")
      .eq("destination_wallet", wallet)
      .maybeSingle();

    if (existing) {
      merchantId = existing.id;
    } else {
      const { data: m, error: mErr } = await supa
        .from("merchants")
        .insert({ wallet_address: wallet, destination_wallet: wallet, name: "Merchant" })
        .select("id")
        .single();
      if (mErr) throw mErr;
      merchantId = m.id;
    }

    const { error: pErr } = await supa.from("plans").insert({
      merchant_id: merchantId,
      plan_pda: planPda,
      name: name.trim(),
      amount: Number(total),
      merchant_amount: Number(merchantAmount),
      token_mint: USDC_MINT,
      period_seconds: periodHours * 3600,
      plan_id_raw: planId.toString(),
      plan_bump: planBump,
    });
    if (pErr) throw pErr;

    return NextResponse.json({
      data: {
        id: planPda,
        name: name.trim(),
        amount: Number(total),
        merchant_amount: Number(merchantAmount),
        period_seconds: periodHours * 3600,
        active: true,
        subscribe_url: `https://soriopay.com/subscribe/${planPda}`,
      },
    }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/v1/plans failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Failed to create plan." }, { status: 500 });
  }
}
