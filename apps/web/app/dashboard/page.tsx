"use client";
import Link from "next/link";

import useSWR from "swr";
import { AppShell } from "../app-shell";
import { useWallet } from "../providers";
import { fetcher } from "../lib/fetcher";

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export default function Dashboard() {
  const { address } = useWallet();

  const { data: scribe, isLoading: l1 } = useSWR(
    address ? `/api/dashboard?wallet=${address}` : null, fetcher
  );
  const { data: prData, isLoading: l2 } = useSWR(
    address ? `/api/payroll/list?wallet=${address}` : null, fetcher
  );
  const { data: empData, isLoading: l3 } = useSWR(
    address ? `/api/payroll/employee?wallet=${address}` : null, fetcher
  );

  const payrolls: any[] = prData?.payrolls ?? [];
  const received: any[] = empData?.items ?? [];
  const loading = l1 || l2 || l3;

  // ---- derived stats ----
  const revenue = scribe?.totalRevenue ?? 0;
  const activeSubscribers =
    scribe?.plans?.reduce(
      (n: number, p: any) => n + p.subscribers.filter((s: any) => s.status === "active").length,
      0
    ) ?? 0;
  const mySubsActive =
    scribe?.mySubscriptions?.filter((s: any) => s.status === "active").length ?? 0;

  const paidOut = payrolls.reduce(
    (sum, p) =>
      sum +
      p.payroll_items.reduce(
        (s: number, i: any) =>
          s +
          (i.payroll_history ?? [])
            .filter((h: any) => h.status === "success")
            .reduce((hs: number, h: any) => hs + h.amount, 0),
        0
      ),
    0
  );
  const totalReceived = received.reduce(
    (sum, i) =>
      sum +
      (i.payroll_history ?? [])
        .filter((h: any) => h.status === "success")
        .reduce((s: number, h: any) => s + h.amount, 0),
    0
  );
  const activePaychecks = received.filter((i) => i.status === "active").length;

  // recent activity: merge Scribe payments + payroll history, newest first
  const activity: { when: string; label: string; amount: number; dir: "in" | "out" }[] = [];
  (scribe?.recentPayments ?? []).forEach((p: any) =>
    activity.push({ when: p.attempted_at, label: "Subscription payment", amount: p.amount, dir: "in" })
  );
  payrolls.forEach((p) =>
    p.payroll_items.forEach((i: any) =>
      (i.payroll_history ?? [])
        .filter((h: any) => h.status === "success")
        .forEach((h: any) => activity.push({ when: h.paid_at, label: `Paid ${p.name}`, amount: h.amount, dir: "out" }))
    )
  );
  received.forEach((i) =>
    (i.payroll_history ?? [])
      .filter((h: any) => h.status === "success")
      .forEach((h: any) =>
        activity.push({ when: h.paid_at, label: `Paycheck from ${i.payrolls?.name ?? "payroll"}`, amount: h.amount, dir: "in" })
      )
  );
  activity.sort((a, b) => (a.when < b.when ? 1 : -1));
  const recent = activity.slice(0, 6);

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-2 text-[var(--muted)]">Your Sorio activity at a glance.</p>

      {!address && <p className="mt-8 text-[var(--muted)]">Connect your wallet to get started.</p>}
      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}

      {address && !loading && (
        <>
          {/* Stats */}
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Revenue (subscriptions)" value={usd(revenue)} accent />
            <Stat label="Paid out (payroll)" value={usd(paidOut)} />
            <Stat label="Active subscribers" value={String(activeSubscribers)} />
            <Stat label="Received (paychecks)" value={usd(totalReceived)} accent />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MiniStat label="Your subscriptions" value={String(mySubsActive)} />
            <MiniStat label="Plans" value={String(scribe?.plans?.length ?? 0)} />
            <MiniStat label="Payrolls" value={String(payrolls.length)} />
            <MiniStat label="Active paychecks" value={String(activePaychecks)} />
          </div>

          {/* Recent activity + quick actions */}
          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* activity */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
                {recent.length > 0 && (
                  <Link href="/history" className="text-sm text-[var(--primary)] hover:underline">
                    View all →
                  </Link>
                )}
              </div>
              {recent.length === 0 ? (
                <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
                    </svg>
                  </div>
                  <p className="mt-4 font-medium">No activity yet</p>
                  <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
                    Once you create a plan or run a payroll, your payments in and out will show up here.
                  </p>
                  <Link href="/create" className="mt-4 text-sm font-medium text-[var(--primary)] transition hover:underline">
                    Create your first plan →
                  </Link>
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
                  {recent.map((a, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-5 py-3 text-sm ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                            a.dir === "in" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--primary)]/15 text-[var(--primary)]"
                          }`}
                        >
                          {a.dir === "in" ? "↓" : "↑"}
                        </span>
                        <span>{a.label}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={a.dir === "in" ? "text-[var(--accent)]" : ""}>
                          {a.dir === "in" ? "+" : "−"}{usd(a.amount)}
                        </span>
                        <span className="w-14 text-right text-xs text-[var(--muted)]">{fmtDate(a.when)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* quick actions */}
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Quick actions</h2>
              <div className="mt-4 space-y-3">
                <Link href="/create" className="block rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]">
                  <p className="font-medium">Create a plan</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Start accepting subscriptions.</p>
                </Link>
                <Link href="/payroll/new" className="block rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]">
                  <p className="font-medium">New payroll</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Pay your team on a schedule.</p>
                </Link>
                <Link href="/plans" className="block rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]">
                  <p className="font-medium">Plans →</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Manage plans & subscribers.</p>
                </Link>
                <Link href="/payroll" className="block rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]">
                  <p className="font-medium">Payroll →</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Manage payrolls & paychecks.</p>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${accent ? "text-[var(--accent)]" : ""}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-3">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}