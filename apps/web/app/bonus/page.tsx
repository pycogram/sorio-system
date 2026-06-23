"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../app-shell";
import { useWallet } from "../providers";

type Stats = {
  code: string;
  stats: {
    invitedTotal: number;
    confirmedCount: number;
    pendingCount: number;
    accruedBaseUnits: number;
    paidBaseUnits: number;
  };
  isHolder: boolean;
  payoutThresholdUsd: number;
};

const usd = (baseUnits: number) =>
  `$${(baseUnits / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })}`;

export default function BonusPage() {
  const { address } = useWallet();
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    setErr(null);
    fetch(`/api/referral-stats?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setErr(e?.message ?? "failed"))
      .finally(() => setLoading(false));
  }, [address]);

  const link = data
    ? `${typeof window !== "undefined" ? window.location.origin : "https://soriopay.com"}/?invite=${data.code}`
    : "";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - user can select manually */
    }
  };

  const accrued = data?.stats.accruedBaseUnits ?? 0;
  const threshold = (data?.payoutThresholdUsd ?? 1) * 1_000_000;
  const reachedMin = accrued >= threshold;

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight">Bonus</h1>
      <p className="mt-2 text-[var(--muted)] leading-relaxed">
        Invite people to Sorio and earn 0.4% of every payment they make.
      </p>

      {!address && (
        <p className="mt-8 text-[var(--muted)]">Connect your wallet to get your referral link.</p>
      )}

      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {err && <p className="mt-8 text-sm text-red-500">Error: {err}</p>}

      {data && (
        <div className="mt-8 space-y-8">
          {/* Referral link */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <p className="text-sm font-medium text-[var(--muted)]">Your referral link</p>
            <div className="mt-3 flex items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none"
              />
              <button
                onClick={copy}
                className="rounded-lg bg-[var(--btn)] px-4 py-2.5 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)]"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card label="People invited" value={data.stats.confirmedCount} sub={data.stats.pendingCount > 0 ? `${data.stats.pendingCount} pending` : undefined} />
            <Card label="Earned (unpaid)" value={usd(data.stats.accruedBaseUnits)} />
            <Card label="Paid out" value={usd(data.stats.paidBaseUnits)} />
          </div>

          {/* Holder / payout status */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <p className="text-sm font-medium">Payout status</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li className="flex items-center gap-2">
                <Dot ok={reachedMin} />
                {reachedMin
                  ? `You've reached the $${data.payoutThresholdUsd} minimum.`
                  : `Earn ${usd(threshold - accrued)} more to reach the $${data.payoutThresholdUsd} payout minimum.`}
              </li>
              <li className="flex items-center gap-2">
                <Dot ok={data.isHolder} />
                {data.isHolder
                  ? "You hold 20,000+ $SORIO - eligible for payout."
                  : "Hold 20,000 $SORIO to be eligible for payout."}
              </li>
            </ul>
            {reachedMin && data.isHolder && (
              <p className="mt-3 text-xs text-[var(--accent)]">
                You&apos;re eligible. Payouts are sent manually from the bonus wallet.
              </p>
            )}
          </div>

          {/* How it works */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <p className="text-sm font-medium">How it works</p>
            <ol className="mt-3 space-y-2 text-sm text-[var(--muted)] list-decimal list-inside">
              <li>Share your link. Anyone who joins through it becomes your referral.</li>
              <li>When they pay through Sorio (subscriptions or payroll), you earn 0.4% of each payment.</li>
              <li>Earnings accrue continuously, as long as they keep using Sorio.</li>
              <li>Once you&apos;ve earned ${data.payoutThresholdUsd}+ and hold 20,000 $SORIO, you&apos;re paid from the bonus wallet.</li>
            </ol>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block h-2 w-2 flex-none rounded-full"
      style={{ background: ok ? "var(--accent)" : "var(--muted)" }}
    />
  );
}