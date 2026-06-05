import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { address } from "@solana/kit";
import { createClient } from "@supabase/supabase-js";
import {
  makeClient,
  createPlan,
  initAuthority,
  subscribe,
} from "../../packages/solana/src/index.js";

const KEYS = join(homedir(), "Desktop/paylo/.keys");
const USDC_MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function loadKey(f: string): Uint8Array {
  return new Uint8Array(JSON.parse(readFileSync(join(KEYS, f), "utf8")));
}

async function main() {
  const { client: merchantClient, signer: collector } = await makeClient(loadKey("collector.json"));
  const { client: customerClient, signer: customer } = await makeClient(loadKey("customer.json"));

  const planId = BigInt(Date.now());

  console.log("Creating plan on-chain...");
  const { planPda, planBump } = await createPlan(merchantClient, collector, {
    planId,
    mint: USDC_MINT,
    amount: 1_000_000n,
    periodHours: 1,
  });
  console.log("  plan:", planPda);

  console.log("Init authority...");
  try {
    await initAuthority(customerClient, customer, USDC_MINT);
  } catch (e: any) {
    console.log("  (note:", e?.message, ")");
  }

  console.log("Subscribing on-chain...");
  const { subscriptionPda } = await subscribe(customerClient, customer, {
    merchant: collector.address,
    mint: USDC_MINT,
    planId,
    planPda,
    planBump,
  });
  console.log("  subscription:", subscriptionPda);

  console.log("Inserting matching rows into Supabase...");

  // Reuse merchant if it already exists, else create.
  let merchantId: string;
  const { data: existing } = await db
    .from("merchants")
    .select("id")
    .eq("wallet_address", collector.address)
    .maybeSingle();

  if (existing) {
    merchantId = existing.id;
  } else {
    const { data: m, error } = await db
      .from("merchants")
      .insert({
        wallet_address: collector.address,
        destination_wallet: collector.address,
        name: "Real Test Merchant",
      })
      .select("id")
      .single();
    if (error) throw error;
    merchantId = m.id;
  }

  const { data: plan, error: pErr } = await db
    .from("plans")
    .insert({
      merchant_id: merchantId,
      plan_pda: planPda,
      name: "Real Test Plan",
      amount: 1_000_000,
      token_mint: USDC_MINT,
      period_seconds: 3600,
    })
    .select("id")
    .single();
  if (pErr) throw pErr;

  const { data: sub, error: sErr } = await db
    .from("subscriptions")
    .insert({
      plan_id: plan.id,
      subscriber_wallet: customer.address,
      subscription_pda: subscriptionPda,
      next_collection_at: new Date(Date.now() - 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (sErr) throw sErr;

  console.log("\nSeeded REAL subscription:", sub.id);
  console.log("plan_pda:", planPda);
  console.log("subscription_pda:", subscriptionPda);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});