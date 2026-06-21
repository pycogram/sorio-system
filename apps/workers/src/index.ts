import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import {
  makeClient,
  collectPayment,
  ensureMerchantAta,
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

// $SORIO holder fee discount (Token-2022 mint).
const SORIO_MINT = "A6VcXrUUYjNiR8RkHCRNu8zuxWUMnhMWoX11j6Bapump";
const SORIO_TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SORIO_THRESHOLD = 20000n * 1_000_000n; // 20,000 $SORIO (6 decimals)

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
      .select("id, subscriber_wallet, subscription_pda, max_payments, plans(amount, merchant_amount, period_seconds, plan_pda, token_mint, merchants(destination_wallet))")
      .eq("status", "active")
      .lte("next_collection_at", nowIso);

    if (error) {
      console.error("query failed:", error.message);
      return;
    }

    console.log(`cron ${event.cron}: ${due?.length ?? 0} due`);

    // Build the puller client once (collector key from env secret).
    const pullerBytes = new Uint8Array(JSON.parse(env.PULLER_SECRET));
    const { client, signer: puller } = await makeClient(pullerBytes, env.SOLANA_RPC_URL);

    // Ensure the platform fee wallet's USDC token account exists before any fee
    // pull. Idempotent (no-op if it already exists); self-heals if the fee
    // wallet ever changes. Mint comes from the first due subscription's plan.
    if (due && due.length > 0) {
      const firstMint = (due[0].plans as any)?.token_mint;
      if (firstMint) {
        try {
          await ensureMerchantAta(puller, address(env.PLATFORM_FEE_WALLET), address(firstMint));
          console.log("   fee wallet ATA ensured");
        } catch (e: any) {
          console.log("   ensure fee ATA (non-fatal):", e?.message ?? e);
        }
      }
    }

    if (!due || due.length === 0) {
      console.log("no subscriptions due");
    }

    for (const sub of due ?? []) {
      const plan: any = sub.plans;

      const destWallet = plan.merchants?.destination_wallet;

      if (!destWallet) {
        console.log(`   skip ${sub.id}: no merchant destination wallet`);
        continue;
      }

      // Payment-limit check: if this subscription has a max_payments cap,
      // count how many successful collections it already has. If it has
      // already reached the cap, mark it completed and skip.
      if (sub.max_payments != null) {
        const { count: successCount } = await db
          .from("billing_history")
          .select("id", { count: "exact", head: true })
          .eq("subscription_id", sub.id)
          .eq("status", "success");
        const already = successCount ?? 0;
        if (already >= sub.max_payments) {
          await db.from("subscriptions").update({ status: "completed" }).eq("id", sub.id);
          console.log(`   subscription ${sub.id}: limit ${sub.max_payments} already reached — completed, skipping`);
          continue;
        }
      }

      // Amounts: total = what the customer authorized; merchantAmount = what the
      // merchant receives; fee = the rest (goes to the platform fee wallet).
      const total = BigInt(plan.amount);
      const merchantAmount = plan.merchant_amount != null ? BigInt(plan.merchant_amount) : total;

      // $SORIO holder discount: subscriber holding >= threshold pays a 0.5% fee
      // (of merchant amount) instead of the baked-in 2%. Re-checked each cycle.
      // Puller can pull less than the authorized total, so we pull a smaller fee.
      let feeAmount = total - merchantAmount; // default: baked-in fee (2%)
      try {
        const [sorioAta] = await findAssociatedTokenPda({
          owner: address(sub.subscriber_wallet),
          mint: address(SORIO_MINT),
          tokenProgram: address(SORIO_TOKEN_2022),
        });
        const b = await client.rpc.getTokenAccountBalance(sorioAta).send();
        if (BigInt(b.value.amount) >= SORIO_THRESHOLD) {
          feeAmount = (merchantAmount * 50n) / 10000n; // 0.5%
          console.log(`   subscriber ${sub.id} is $SORIO holder -> discounted fee ${feeAmount}`);
        }
      } catch (e: any) {
        // not a holder / unreadable -> keep default fee
        console.log(`   $SORIO read failed for ${sub.id} (treating as non-holder):`, e?.message ?? e);
      }

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

      // Double-fee guard: if a previous attempt already pulled the fee for this
      // cycle but failed before the merchant pull, there will be a row with
      // fee_tx set and tx_signature null. Reuse that fee — do NOT pull it again.
      let feeSig: string | null = null;
      let feeAlreadyPulled = false;
      {
        const { data: pendingFee } = await db
          .from("billing_history")
          .select("fee_tx")
          .eq("subscription_id", sub.id)
          .not("fee_tx", "is", null)
          .is("tx_signature", null)
          .order("attempted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pendingFee?.fee_tx) {
          feeSig = pendingFee.fee_tx;
          feeAlreadyPulled = true;
          console.log(`   fee already pulled for ${sub.id} this cycle (${feeSig}) — skipping fee pull`);
        }
      }

      let ok = false;
      let sig: string | null = null;
      let reason: string | null = null;
      try {
        // Pull #1: FEE first (customer -> fee wallet) — unless already pulled.
        if (feeAmount > 0n && !feeAlreadyPulled) {
          const feeResult = await collectPayment(client, puller, {
            amount: feeAmount,
            delegator: address(sub.subscriber_wallet),
            mint: address(plan.token_mint),
            planPda: address(plan.plan_pda),
            receiverAta: feeAta,
          });
          feeSig = feeResult.signature;
          console.log("   *** FEE COLLECTED ***", feeSig);
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

      // Record the attempt. fee_tx is stored even on partial failure so the
      // retry guard above can see the fee was already pulled.
      const { error: histErr } = await db.from("billing_history").insert({
        subscription_id: sub.id,
        amount: plan.amount,
        status: ok ? "success" : "failed",
        tx_signature: sig,
        fee_tx: feeSig,
        failure_reason: reason,
      });
      if (histErr) console.log("   billing_history insert error:", histErr.message);

      // Auto-retire: after 3 consecutive failed attempts (no success in
      // between), pause the subscription so we stop retrying one that can't pay.
      // Resumable later by setting status back to 'active'.
      if (!ok) {
        const { data: recent } = await db
          .from("billing_history")
          .select("status")
          .eq("subscription_id", sub.id)
          .order("attempted_at", { ascending: false })
          .limit(3);
        const last3 = recent ?? [];
        const threeStraightFails =
          last3.length >= 3 && last3.every((r: any) => r.status === "failed");
        if (threeStraightFails) {
          await db.from("subscriptions").update({ status: "paused" }).eq("id", sub.id);
          console.log(`   subscription ${sub.id}: 3 consecutive failures — paused`);
        }
      }

      if (ok) {
        // If this successful pull reached the payment cap, complete the
        // subscription so it is never collected again. Otherwise advance.
        if (sub.max_payments != null) {
          const { count: successCount } = await db
            .from("billing_history")
            .select("id", { count: "exact", head: true })
            .eq("subscription_id", sub.id)
            .eq("status", "success");
          const paid = successCount ?? 0;
          if (paid >= sub.max_payments) {
            const { error: doneErr } = await db
              .from("subscriptions")
              .update({ status: "completed", last_collection_at: nowIso })
              .eq("id", sub.id);
            if (doneErr) console.log("   subscription complete error:", doneErr.message);
            else console.log(`   subscription ${sub.id}: reached ${sub.max_payments}/${sub.max_payments} payments — completed`);
            continue;
          }
        }

        const next = new Date(Date.now() + plan.period_seconds * 1000).toISOString();
        const { error: updErr } = await db
          .from("subscriptions")
          .update({ next_collection_at: next, last_collection_at: nowIso })
          .eq("id", sub.id);
        if (updErr) console.log("   subscription update error:", updErr.message);
        else console.log(`   advanced to ${next}`);
      }
    }

    const { data: payrolls, error: pErr } = await db
      .from("payrolls")
      .select("id, employer_wallet, period_seconds, token_mint, fee_percent, payroll_items(id, employee_wallet, amount, status, plan_pda, subscription_pda, next_payment_at, max_payments)")
      .order("created_at", { ascending: false });

    if (pErr) {
      console.error("payroll query failed:", pErr.message);
    } else {
      for (const pr of payrolls ?? []) {
        const employer = pr.employer_wallet;
        const mint = pr.token_mint;
        const FEE_PERCENT = Number((pr as any).fee_percent ?? 2);
        const items = (pr.payroll_items ?? []).filter(
          (i: any) =>
            i.status === "active" &&
            i.plan_pda &&
            (!i.next_payment_at || i.next_payment_at <= nowIso)
        );
        if (items.length === 0) continue;

        // Payment-limit pre-check: drop any item that has already reached its
        // cap (and mark it completed), so it is neither funded nor paid.
        const payableItems: any[] = [];
        for (const i of items) {
          if (i.max_payments != null) {
            const { count: successCount } = await db
              .from("payroll_history")
              .select("id", { count: "exact", head: true })
              .eq("payroll_item_id", i.id)
              .eq("status", "success");
            const already = successCount ?? 0;
            if (already >= i.max_payments) {
              await db.from("payroll_items").update({ status: "completed" }).eq("id", i.id);
              console.log(`   payroll_item ${i.id}: limit ${i.max_payments} already reached — completed, skipping`);
              continue;
            }
          }
          payableItems.push(i);
        }
        if (payableItems.length === 0) continue;

        // Ensure the fee wallet ATA for this payroll's mint too (idempotent).
        try {
          await ensureMerchantAta(puller, address(env.PLATFORM_FEE_WALLET), address(mint));
        } catch (e: any) {
          console.log(`   payroll ${pr.id} ensure fee ATA (non-fatal):`, e?.message ?? e);
        }

        // Compute total needed for this payroll run (all salaries + all fees).
        let totalNeeded = 0n;
        for (const i of payableItems) {
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
        for (const i of payableItems) {
          const salary = BigInt(i.amount);
          const fee = (salary * BigInt(Math.round(FEE_PERCENT * 100))) / 10000n;

          const [employeeAta] = await findAssociatedTokenPda({
            owner: address(i.employee_wallet),
            mint: address(mint),
            tokenProgram: TOKEN_PROGRAM,
          });

          // Double-fee guard: reuse a fee already pulled this cycle (a prior
          // partial failure leaves a row with fee_tx set and salary_tx null).
          let feeSig: string | null = null;
          let feeAlreadyPulled = false;
          {
            const { data: pendingFee } = await db
              .from("payroll_history")
              .select("fee_tx")
              .eq("payroll_item_id", i.id)
              .not("fee_tx", "is", null)
              .is("salary_tx", null)
              .order("paid_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (pendingFee?.fee_tx) {
              feeSig = pendingFee.fee_tx;
              feeAlreadyPulled = true;
              console.log(`   payroll ${i.id}: fee already pulled this cycle (${feeSig}) — skipping fee pull`);
            }
          }

          let ok = false;
          let sig: string | null = null;
          let reason: string | null = null;
          try {
            // Pull #1: FEE first (employer -> fee wallet) — unless already pulled.
            if (fee > 0n && !feeAlreadyPulled) {
              const feeRes = await collectPayment(client, puller, {
                amount: fee,
                delegator: address(employer),
                mint: address(mint),
                planPda: address(i.plan_pda),
                receiverAta: feeAta,
              });
              feeSig = feeRes.signature;
              console.log(`   payroll ${i.id} FEE collected`, feeSig);
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

          // Record payment in history (fee_tx stored even on partial failure).
          const { error: phErr } = await db.from("payroll_history").insert({
            payroll_item_id: i.id,
            amount: Number(salary),
            fee: Number(fee),
            status: ok ? "success" : "failed",
            salary_tx: sig,
            fee_tx: feeSig,
            failure_reason: reason,
          });
          if (phErr) console.log(`   payroll_history insert error:`, phErr.message);

          // Auto-retire: after 3 consecutive failed attempts (no success in
          // between), pause this payroll item so we stop retrying one that
          // can't pay. Resumable later by setting status back to 'active'.
          if (!ok) {
            const { data: recentP } = await db
              .from("payroll_history")
              .select("status")
              .eq("payroll_item_id", i.id)
              .order("paid_at", { ascending: false })
              .limit(3);
            const last3P = recentP ?? [];
            const threeStraightFailsP =
              last3P.length >= 3 && last3P.every((r: any) => r.status === "failed");
            if (threeStraightFailsP) {
              await db.from("payroll_items").update({ status: "paused" }).eq("id", i.id);
              console.log(`   payroll_item ${i.id}: 3 consecutive failures — paused`);
            }
          }

          // Advance schedule only on success — or complete if the cap is hit.
          if (ok) {
            if (i.max_payments != null) {
              const { count: successCount } = await db
                .from("payroll_history")
                .select("id", { count: "exact", head: true })
                .eq("payroll_item_id", i.id)
                .eq("status", "success");
              const paid = successCount ?? 0;
              if (paid >= i.max_payments) {
                const { error: doneErr } = await db
                  .from("payroll_items")
                  .update({ status: "completed", last_payment_at: nowIso })
                  .eq("id", i.id);
                if (doneErr) console.log(`   payroll_item complete error:`, doneErr.message);
                else console.log(`   payroll ${i.id}: reached ${i.max_payments}/${i.max_payments} payments — completed`);
                continue;
              }
            }

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