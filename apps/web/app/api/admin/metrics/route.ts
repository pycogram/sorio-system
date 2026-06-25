import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { address } from "@solana/kit";
import { makeClient, findAssociatedTokenPda, TOKEN_PROGRAM } from "../../../lib/solana-engine";
import { USDC_MINT_ADDRESS } from "../../../lib/config";
import { verifyAdmin } from "../verify-admin";
import { AuthError } from "../../../lib/verify-auth";

export const runtime = "nodejs";

async function countBy(db: any, table: string, status: string): Promise<number> {
  const { count } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

// GET /api/admin/metrics?wallet=..&timestamp=..&signature=..
// Admin-gated dashboard metrics. Real money numbers come from on-chain reads.
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet") ?? undefined;
    const timestampRaw = req.nextUrl.searchParams.get("timestamp");
    const signature = req.nextUrl.searchParams.get("signature") ?? undefined;
    const timestamp = timestampRaw ? Number(timestampRaw) : undefined;

    try {
      verifyAdmin({ action: "admin-metrics", wallet, timestamp, signature, params: {} });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // --- DB counts ---
    const subscriptions = {
      active: await countBy(db, "subscriptions", "active"),
      paused: await countBy(db, "subscriptions", "paused"),
      cancelled: await countBy(db, "subscriptions", "cancelled"),
      completed: await countBy(db, "subscriptions", "completed"),
    };

    const payrollItems = {
      active: await countBy(db, "payroll_items", "active"),
      paused: await countBy(db, "payroll_items", "paused"),
      pending: await countBy(db, "payroll_items", "pending"),
      completed: await countBy(db, "payroll_items", "completed"),
    };
    const { count: payrollCount } = await db
      .from("payrolls")
      .select("id", { count: "exact", head: true });

    const transactions = {
      subscription: {
        success: await countBy(db, "billing_history", "success"),
        failed: await countBy(db, "billing_history", "failed"),
      },
      payroll: {
        success: await countBy(db, "payroll_history", "success"),
        failed: await countBy(db, "payroll_history", "failed"),
      },
    };

    // --- Total volume (sum of successful payment amounts) ---
    // Payroll: exact (salary amounts). Subscriptions: approx (plan total stored
    // in billing_history; for $SORIO holders the actual pull was a bit less).
    let subVolume = 0;
    {
      const { data } = await db
        .from("billing_history")
        .select("amount")
        .eq("status", "success");
      subVolume = (data ?? []).reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0);
    }
    let payVolume = 0;
    {
      const { data } = await db
        .from("payroll_history")
        .select("amount, fee")
        .eq("status", "success");
      // volume = salary + fee (the full amount moved)
      payVolume = (data ?? []).reduce(
        (sum: number, r: any) => sum + Number(r.amount ?? 0) + Number(r.fee ?? 0),
        0
      );
    }
    const totalVolumeBaseUnits = subVolume + payVolume; // USDC base units (6 dp)

    // --- Success rate (attempt-level, both tables combined) ---
    const totalSuccess =
      transactions.subscription.success + transactions.payroll.success;
    const totalFailed =
      transactions.subscription.failed + transactions.payroll.failed;
    const totalAttempts = totalSuccess + totalFailed;
    const successRate =
      totalAttempts > 0 ? Math.round((totalSuccess / totalAttempts) * 1000) / 10 : null; // %

    // --- MRR-style: active recurring revenue, normalized to MONTHLY ---
    // Each active subscription contributes (merchant_amount per cycle) scaled to
    // a 30-day month. Periods vary (hourly/daily/monthly), so normalize.
    let mrrBaseUnits = 0;
    {
      const { data: activeSubs } = await db
        .from("subscriptions")
        .select("plans(merchant_amount, amount, period_seconds)")
        .eq("status", "active");
      const MONTH_SECONDS = 2592000;
      for (const sub of activeSubs ?? []) {
        const plan: any = (sub as any).plans;
        if (!plan) continue;
        const perCycle = Number(plan.merchant_amount ?? plan.amount ?? 0);
        const period = Number(plan.period_seconds ?? MONTH_SECONDS);
        if (period > 0) {
          mrrBaseUnits += perCycle * (MONTH_SECONDS / period);
        }
      }
      mrrBaseUnits = Math.round(mrrBaseUnits);
    }

    // --- On-chain money reads (the real numbers) ---
    let feeWalletUsdc: string | null = null;
    let collectorSol: string | null = null;
    try {
      const pullerBytes = new Uint8Array(JSON.parse(process.env.PLATFORM_PULLER_SECRET!));
      const { client, signer: puller } = await makeClient(pullerBytes);

      // Revenue: USDC currently held in the fee wallet.
      try {
        const feeWallet = address(process.env.PLATFORM_FEE_WALLET!);
        const [feeAta] = await findAssociatedTokenPda({
          owner: feeWallet,
          mint: address(USDC_MINT_ADDRESS),
          tokenProgram: TOKEN_PROGRAM,
        });
        const bal = await client.rpc.getTokenAccountBalance(feeAta).send();
        feeWalletUsdc = bal.value.uiAmountString ?? null;
      } catch {
        feeWalletUsdc = null; // no account / unreadable
      }

      // Expenses indicator: SOL remaining in the collector (= puller) wallet.
      // No separate env var — the collector IS the puller, so use its address.
      try {
        const bal = await client.rpc.getBalance(puller.address).send();
        collectorSol = (Number(bal.value) / 1_000_000_000).toFixed(4); // lamports -> SOL
      } catch {
        collectorSol = null;
      }
    } catch {
      // chain reads unavailable -> leave nulls, DB stats still returned
    }

    // --- Bonus / referral payout operation ---
    // DB: total paid out, total still owed (accrued), pending request count.
    let bonusPaidOut = 0;
    {
      const { data } = await db
        .from("payout_requests")
        .select("paid_amount_usd")
        .eq("status", "paid");
      bonusPaidOut = (data ?? []).reduce((s: number, r: any) => s + Number(r.paid_amount_usd ?? 0), 0);
    }
    let bonusPendingAccrued = 0;
    {
      const { data } = await db.from("referrals").select("accrued_usd");
      bonusPendingAccrued = (data ?? []).reduce((s: number, r: any) => s + Number(r.accrued_usd ?? 0), 0);
    }
    const { count: bonusPendingRequests } = await db
      .from("payout_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    // On-chain: bonus wallet USDC + SOL (the float you pay out from).
    let bonusWalletUsdc: string | null = null;
    let bonusWalletSol: string | null = null;
    try {
      if (process.env.BONUS_WALLET_SECRET) {
        const bonusBytes = new Uint8Array(JSON.parse(process.env.BONUS_WALLET_SECRET));
        const { client: bonusClient, signer: bonus } = await makeClient(bonusBytes);
        try {
          const [bonusAta] = await findAssociatedTokenPda({
            owner: bonus.address,
            mint: address(USDC_MINT_ADDRESS),
            tokenProgram: TOKEN_PROGRAM,
          });
          const bal = await bonusClient.rpc.getTokenAccountBalance(bonusAta).send();
          bonusWalletUsdc = bal.value.uiAmountString ?? null;
        } catch {
          bonusWalletUsdc = null;
        }
        try {
          const bal = await bonusClient.rpc.getBalance(bonus.address).send();
          bonusWalletSol = (Number(bal.value) / 1_000_000_000).toFixed(4);
        } catch {
          bonusWalletSol = null;
        }
      }
    } catch {
      // bonus reads unavailable -> leave nulls
    }

    return NextResponse.json({
      subscriptions,
      payroll: { items: payrollItems, payrolls: payrollCount ?? 0 },
      transactions,
      money: {
        feeWalletUsdc,      // revenue: USDC currently in fee wallet
        collectorSol,       // expenses indicator: SOL remaining (runway)
      },
      volume: {
        totalBaseUnits: totalVolumeBaseUnits, // USDC base units (divide by 1e6)
        note: "Approx: payroll exact, subscriptions use stored plan total.",
      },
      health: {
        successRatePct: successRate,          // attempt-level success %
        totalSuccess,
        totalFailed,
      },
      recurring: {
        monthlyBaseUnits: mrrBaseUnits,       // active subs normalized to monthly
      },
      bonus: {
        walletUsdc: bonusWalletUsdc,          // bonus wallet USDC (pay-out float)
        walletSol: bonusWalletSol,            // bonus wallet SOL (gas runway)
        paidOutBaseUnits: bonusPaidOut,       // lifetime referral payouts sent
        pendingAccruedBaseUnits: bonusPendingAccrued, // owed to referrers, unpaid
        pendingRequests: bonusPendingRequests ?? 0,   // payout requests waiting
      },
    });
  } catch (e: any) {
    console.error("admin metrics failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}