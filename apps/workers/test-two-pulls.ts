import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import {
  makeClient,
  collectPayment,
  findAssociatedTokenPda,
  TOKEN_PROGRAM,
} from "../../packages/solana/src/index";

const FEE_WALLET = "5cpWkW6GVi4YJM2CBzRbrEkNNVv2ADqFuz21Kqr1nNDL";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function main() {
  const db = createDb(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Newest subscription that has never been collected.
  const { data: subs } = await db
    .from("subscriptions")
    .select("id, subscriber_wallet, subscription_pda, last_collection_at, plans(plan_pda, token_mint, merchants(destination_wallet))")
    .is("last_collection_at", null)
    .order("subscribed_at", { ascending: false })
    .limit(1);

  if (!subs || subs.length === 0) {
    console.log("No never-collected subscription found. Create a fresh plan + subscribe first.");
    return;
  }
  const sub: any = subs[0];
  const plan: any = sub.plans;
  const merchantWallet = plan.merchants?.destination_wallet;
  console.log("Testing subscription:", sub.id);
  console.log("  subscriber:", sub.subscriber_wallet);
  console.log("  merchant:", merchantWallet);

  const pullerBytes = new Uint8Array(JSON.parse(process.env.PULLER_SECRET!));
  const { client, signer: puller } = await makeClient(pullerBytes);

  const [merchantAta] = await findAssociatedTokenPda({
    owner: address(merchantWallet), mint: address(USDC), tokenProgram: TOKEN_PROGRAM,
  });
  const [feeAta] = await findAssociatedTokenPda({
    owner: address(FEE_WALLET), mint: address(USDC), tokenProgram: TOKEN_PROGRAM,
  });

  // PULL #1 — to merchant
  try {
    const r1 = await collectPayment(client, puller, {
      amount: 100000n,
      delegator: address(sub.subscriber_wallet),
      mint: address(USDC),
      planPda: address(plan.plan_pda),
      receiverAta: merchantAta,
    });
    console.log("PULL #1 OK (merchant):", r1.signature);
  } catch (e: any) {
    console.log("PULL #1 FAILED:", e?.message ?? e);
    return;
  }

  // PULL #2 — to fee wallet, same period
  try {
    const r2 = await collectPayment(client, puller, {
      amount: 20000n,
      delegator: address(sub.subscriber_wallet),
      mint: address(USDC),
      planPda: address(plan.plan_pda),
      receiverAta: feeAta,
    });
    console.log("PULL #2 OK (fee wallet):", r2.signature);
    console.log(">>> TWO PULLS PER PERIOD: WORKS <<<");
  } catch (e: any) {
    console.log("PULL #2 FAILED:", e?.message ?? e);
    console.log(">>> TWO PULLS BLOCKED — use Approach 1 (pull-then-forward) <<<");
  }
}

main();