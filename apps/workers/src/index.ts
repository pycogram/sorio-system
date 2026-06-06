import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import {
  makeClient,
  collectPayment,
  findAssociatedTokenPda,
  TOKEN_PROGRAM,
} from "../../../packages/solana/src/index.js";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PULLER_SECRET: string;
  SOLANA_RPC_URL: string;
  PLATFORM_FEE_WALLET: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const nowIso = new Date().toISOString();

    const { data: due, error } = await db
      .from("subscriptions")
      .select("id, subscriber_wallet, subscription_pda, plans(amount, merchant_amount, period_seconds, plan_pda, token_mint, merchants(destination_wallet))")
      .eq("status", "active")
      .lte("next_collection_at", nowIso);

    if (error) {
      console.error("query failed:", error.message);
      return;
    }

    console.log(`cron ${event.cron}: ${due?.length ?? 0} due`);
    if (!due || due.length === 0) {
      console.log("nothing to collect");
      return;
    }

    // Build the puller client once (collector key from env secret).
    const pullerBytes = new Uint8Array(JSON.parse(env.PULLER_SECRET));
    const { client, signer: puller } = await makeClient(pullerBytes);

    for (const sub of due) {
      const plan: any = sub.plans;
      
      const destWallet = plan.merchants?.destination_wallet;
      
      if (!destWallet) {
        console.log(`   skip ${sub.id}: no merchant destination wallet`);
        continue;
      }

      // Amounts: total = what the customer authorized; merchantAmount = what the
      // merchant receives; fee = the rest (goes to the platform fee wallet).
      const total = BigInt(plan.amount);
      const merchantAmount = plan.merchant_amount != null ? BigInt(plan.merchant_amount) : total;
      const feeAmount = total - merchantAmount;

      const [merchantAta] = await findAssociatedTokenPda({
        owner: address(destWallet),
        mint: address(plan.token_mint),
        tokenProgram: TOKEN_PROGRAM,
      });
      const [feeAta] = await findAssociatedTokenPda({
        owner: address(env.PLATFORM_FEE_WALLET),
        mint: address(plan.token_mint),
        tokenProgram: TOKEN_PROGRAM,
      });

      console.log(`\n-- subscription ${sub.id}, total ${total} (merchant ${merchantAmount}, fee ${feeAmount})`);

      let ok = false;
      let sig: string | null = null;
      let reason: string | null = null;
      try {
        // Pull #1: merchant's share, direct customer -> merchant.
        const result = await collectPayment(client, puller, {
          amount: merchantAmount,
          delegator: address(sub.subscriber_wallet),
          mint: address(plan.token_mint),
          planPda: address(plan.plan_pda),
          receiverAta: merchantAta,
        });
        sig = result.signature;
        console.log("   *** COLLECTED (merchant) ***", sig);

        // Pull #2: platform fee, direct customer -> fee wallet (same period).
        if (feeAmount > 0n) {
          const feeResult = await collectPayment(client, puller, {
            amount: feeAmount,
            delegator: address(sub.subscriber_wallet),
            mint: address(plan.token_mint),
            planPda: address(plan.plan_pda),
            receiverAta: feeAta,
          });
          console.log("   *** FEE COLLECTED ***", feeResult.signature);
        }

        ok = true;
      } catch (e: any) {
        reason = e?.message ?? String(e);
        console.log("   collection failed:", reason);
      }

      await db.from("billing_history").insert({
        subscription_id: sub.id,
        amount: plan.amount,
        status: ok ? "success" : "failed",
        tx_signature: sig,
        failure_reason: reason,
      });

      if (ok) {
        const next = new Date(Date.now() + plan.period_seconds * 1000).toISOString();
        await db
          .from("subscriptions")
          .update({ next_collection_at: next, last_collection_at: nowIso })
          .eq("id", sub.id);
        console.log(`   advanced to ${next}`);
      }
    }

    console.log("\ncron done");
  },
} satisfies ExportedHandler<Env>;