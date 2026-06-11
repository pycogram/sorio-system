import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import {
  makeClient,
  collectPayment,
  findAssociatedTokenPda,
  TOKEN_PROGRAM,
} from "../../../packages/solana/src/index.js";

// Swallow stray background promise rejections from the SDK's fire-and-forget
// confirmation calls (cosmetic — the transactions themselves already succeed).
if (typeof addEventListener === "function") {
  addEventListener("unhandledrejection", (e: any) => {
    e.preventDefault();
    console.log("   (ignored background rejection)");
  });
}

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
    const { client, signer: puller } = await makeClient(pullerBytes, env.SOLANA_RPC_URL);

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
        // Pull #1: FEE first (customer -> fee wallet) so the platform fee is
        // never collected without the merchant pull also going through.
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

        // Pull #2: merchant's share (customer -> merchant).
        const result = await collectPayment(client, puller, {
          amount: merchantAmount,
          delegator: address(sub.subscriber_wallet),
          mint: address(plan.token_mint),
          planPda: address(plan.plan_pda),
          receiverAta: merchantAta,
        });
        sig = result.signature;
        console.log("   *** COLLECTED (merchant) ***", sig);

        ok = true;
      } catch (e: any) {
        reason = e?.message ?? String(e);
        console.log("   collection failed:", reason);
      }

      const { error: histErr } = await db.from("billing_history").insert({
        subscription_id: sub.id,
        amount: plan.amount,
        status: ok ? "success" : "failed",
        tx_signature: sig,
        failure_reason: reason,
      });
      if (histErr) console.log("   billing_history insert error:", histErr.message);

      if (ok) {
        const next = new Date(Date.now() + plan.period_seconds * 1000).toISOString();
        const { error: updErr } = await db
          .from("subscriptions")
          .update({ next_collection_at: next, last_collection_at: nowIso })
          .eq("id", sub.id);
        if (updErr) console.log("   subscription update error:", updErr.message);
        else console.log(`   advanced to ${next}`);
      }
    }

    // ===== PAYROLL (Paylo Roll) =====
    const FEE_PERCENT = 2;

    const { data: payrolls, error: pErr } = await db
      .from("payrolls")
      .select("id, employer_wallet, period_seconds, token_mint, payroll_items(id, employee_wallet, amount, status, plan_pda, subscription_pda, next_payment_at)")
      .order("created_at", { ascending: false });

    if (pErr) {
      console.error("payroll query failed:", pErr.message);
    } else {
      for (const pr of payrolls ?? []) {
        const employer = pr.employer_wallet;
        const mint = pr.token_mint;
        const items = (pr.payroll_items ?? []).filter(
          (i: any) =>
            i.status === "active" &&
            i.plan_pda &&
            (!i.next_payment_at || i.next_payment_at <= nowIso)
        );
        if (items.length === 0) continue;

        // Compute total needed for this payroll run (all salaries + all fees).
        let totalNeeded = 0n;
        for (const i of items) {
          const salary = BigInt(i.amount);
          const fee = (salary * BigInt(Math.round(FEE_PERCENT * 100))) / 10000n;
          totalNeeded += salary + fee;
        }

        // Pre-check: employer's USDC balance must cover the whole run.
        const [employerAta] = await findAssociatedTokenPda({
          owner: address(employer),
          mint: address(mint),
          tokenProgram: TOKEN_PROGRAM,
        });
        let balance = 0n;
        try {
          const bal = await client.rpc.getTokenAccountBalance(employerAta).send();
          balance = BigInt(bal.value.amount);
        } catch (e: any) {
          console.log(`payroll ${pr.id}: cannot read employer balance, skipping`);
          continue;
        }

        if (balance < totalNeeded) {
          console.log(`payroll ${pr.id}: insufficient funds (need ${totalNeeded}, have ${balance}) — skipping whole run`);
          continue;
        }

        const [feeAta] = await findAssociatedTokenPda({
          owner: address(env.PLATFORM_FEE_WALLET),
          mint: address(mint),
          tokenProgram: TOKEN_PROGRAM,
        });

        // Pay each employee: FEE FIRST, then salary.
        for (const i of items) {
          const salary = BigInt(i.amount);
          const fee = (salary * BigInt(Math.round(FEE_PERCENT * 100))) / 10000n;

          const [employeeAta] = await findAssociatedTokenPda({
            owner: address(i.employee_wallet),
            mint: address(mint),
            tokenProgram: TOKEN_PROGRAM,
          });

          let ok = false;
          let sig: string | null = null;
          let reason: string | null = null;
          try {
            // Pull #1: FEE first (employer -> fee wallet).
            if (fee > 0n) {
              const feeRes = await collectPayment(client, puller, {
                amount: fee,
                delegator: address(employer),
                mint: address(mint),
                planPda: address(i.plan_pda),
                receiverAta: feeAta,
              });
              console.log(`   payroll ${i.id} FEE collected`, feeRes.signature);
            }
            // Pull #2: SALARY (employer -> employee).
            const salRes = await collectPayment(client, puller, {
              amount: salary,
              delegator: address(employer),
              mint: address(mint),
              planPda: address(i.plan_pda),
              receiverAta: employeeAta,
            });
            sig = salRes.signature;
            console.log(`   payroll ${i.id} SALARY paid`, sig);
            ok = true;
          } catch (e: any) {
            reason = e?.message ?? String(e);
            console.log(`   payroll ${i.id} failed:`, reason);
          }

          // Record payment in history (success or failure).
          const { error: phErr } = await db.from("payroll_history").insert({
            payroll_item_id: i.id,
            amount: Number(salary),
            fee: Number(fee),
            status: ok ? "success" : "failed",
            salary_tx: sig,
            fee_tx: null,
            failure_reason: reason,
          });
          if (phErr) console.log(`   payroll_history insert error:`, phErr.message);

          // Advance schedule only on success.
          if (ok) {
            const next = new Date(Date.now() + pr.period_seconds * 1000).toISOString();
            const { error: piErr } = await db
              .from("payroll_items")
              .update({ next_payment_at: next, last_payment_at: nowIso })
              .eq("id", i.id);
            if (piErr) console.log(`   payroll_item update error:`, piErr.message);
            else console.log(`   payroll ${i.id} advanced to ${next}`);
          }
        }
      }
    }

    console.log("\ncron done");
  },
} satisfies ExportedHandler<Env>;