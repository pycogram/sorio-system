import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  // 1. merchant
  const { data: merchant, error: mErr } = await db
    .from("merchants")
    .insert({
      wallet_address: "FPaUQV5MmDdXBTTH4pRo1C2zX7UvnC7kD1rc4VNwdFN2",
      destination_wallet: "FPaUQV5MmDdXBTTH4pRo1C2zX7UvnC7kD1rc4VNwdFN2",
      name: "Test Merchant",
    })
    .select()
    .single();
  if (mErr) throw mErr;

  // 2. plan (1 USDC, 1 hour)
  const { data: plan, error: pErr } = await db
    .from("plans")
    .insert({
      merchant_id: merchant.id,
      plan_pda: "TESTPLAN" + Date.now(),
      name: "Test Plan",
      amount: 1_000_000,
      token_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      period_seconds: 3600,
    })
    .select()
    .single();
  if (pErr) throw pErr;

  // 3. subscription, already DUE (next_collection_at in the past)
  const { data: sub, error: sErr } = await db
    .from("subscriptions")
    .insert({
      plan_id: plan.id,
      subscriber_wallet: "8oLxaC79GNu6sbY35RiG5gZdSKiDuhYt5siiDVjT1ern",
      subscription_pda: "TESTSUB" + Date.now(),
      next_collection_at: new Date(Date.now() - 60_000).toISOString(),
    })
    .select()
    .single();
  if (sErr) throw sErr;

  console.log("Seeded subscription:", sub.id, "due at", sub.next_collection_at);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});