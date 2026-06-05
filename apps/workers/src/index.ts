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
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const nowIso = new Date().toISOString();

    const { data: due, error } = await db
      .from("subscriptions")
      .select("id, subscriber_wallet, subscription_pda, plans(amount, period_seconds, plan_pda, token_mint)")
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

    // Collector's receiving USDC account.
    const [receiverAta] = await findAssociatedTokenPda({
      owner: puller.address,
      mint: address(due[0].plans.token_mint),
      tokenProgram: TOKEN_PROGRAM,
    });

    for (const sub of due) {
      const plan: any = sub.plans;
      console.log(`\n-- subscription ${sub.id}, amount ${plan.amount}`);

      let ok = false;
      let sig: string | null = null;
      let reason: string | null = null;

      try {
        const result = await collectPayment(client, puller, {
          amount: BigInt(plan.amount),
          delegator: address(sub.subscriber_wallet),
          mint: address(plan.token_mint),
          planPda: address(plan.plan_pda),
          receiverAta,
        });
        ok = true;
        sig = result.signature;
        console.log("   *** COLLECTED ***", sig);

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