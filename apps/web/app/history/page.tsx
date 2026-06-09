"use client";

import { useState } from "react";
import useSWR from "swr";
import { AppShell } from "../app-shell";
import { useWallet } from "../providers";
import { fetcher } from "../lib/fetcher";

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

type Row = {
  when: string;
  label: string;
  amount: number;
  dir: "in" | "out";
  tx: string | null;
  status: string;
};

export default function HistoryPage() {
  const { address } = useWallet();
  const [visible, setVisible] = useState(10);

  const { data: scribe, isLoading: l1 } = useSWR(
    address ? `/api/dashboard?wallet=${address}` : null, fetcher
  );
  const { data: pr, isLoading: l2 } = useSWR(
    address ? `/api/payroll/list?wallet=${address}` : null, fetcher
  );
  const { data: emp, isLoading: l3 } = useSWR(
    address ? `/api/payroll/employee?wallet=${address}` : null, fetcher
  );
  const loading = l1 || l2 || l3;

  const rows: Row[] = (() => {
    const out: Row[] = [];

    // Subscriptions you received (merchant)
    (scribe?.recentPayments ?? []).forEach((p: any) =>
      out.push({
        when: p.attempted_at,
        label: "Subscription payment",
        amount: p.amount,
        dir: "in",
        tx: p.tx_signature ?? null,
        status: p.status,
      })
    );

    // Payroll you paid out (employer)
    (pr?.payrolls ?? []).forEach((p: any) =>
      (p.payroll_items ?? []).forEach((i: any) =>
        (i.payroll_history ?? []).forEach((h: any) =>
          out.push({
            when: h.paid_at,
            label: `Paid ${p.name}`,
            amount: h.amount,
            dir: "out",
            tx: h.salary_tx ?? null,
            status: h.status,
          })
        )
      )
    );

    // Paychecks you received (employee)
    (emp?.items ?? []).forEach((i: any) =>
      (i.payroll_history ?? []).forEach((h: any) =>
        out.push({
          when: h.paid_at,
          label: `Paycheck from ${i.payrolls?.name ?? "payroll"}`,
          amount: h.amount,
          dir: "in",
          tx: h.salary_tx ?? null,
          status: h.status,
        })
      )
    );

    out.sort((a, b) => (a.when < b.when ? 1 : -1));
    return out;
  })();

  const totalIn = rows.filter((r) => r.dir === "in" && r.status === "success").reduce((s, r) => s + r.amount, 0);
  const totalOut = rows.filter((r) => r.dir === "out" && r.status === "success").reduce((s, r) => s + r.amount, 0);

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">All payments in and out of your wallet.</p>

      {!address && <p className="mt-8 text-[var(--muted)]">Connect your wallet to view your history.</p>}
      {address && loading && rows.length === 0 && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {address && !loading && rows.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">No payment history yet.</p>
      )}

      {address && rows.length > 0 && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Total in" value={usd(totalIn)} accent />
            <Stat label="Total out" value={usd(totalOut)} />
            <Stat label="Transactions" value={String(rows.length)} />
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border border-[var(--border)]">
            {rows.slice(0, visible).map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-3 text-sm ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                      r.dir === "in" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--primary)]/15 text-[var(--primary)]"
                    }`}
                  >
                    {r.dir === "in" ? "↓" : "↑"}
                  </span>
                  <div className="flex flex-col">
                    <span>{r.label}</span>
                    {r.status !== "success" && (
                      <span className="text-xs text-[var(--muted)] capitalize">{r.status}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={r.dir === "in" ? "text-[var(--accent)]" : ""}>
                    {r.dir === "in" ? "+" : "−"}
                    {usd(r.amount)}
                  </span>
                  <span className="w-24 text-right text-xs text-[var(--muted)]">{fmtDate(r.when)}</span>
                  {r.tx ? (
                    <a
                      href={`https://explorer.solana.com/tx/${r.tx}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-10 text-right text-xs text-[var(--primary)] hover:underline"
                    >
                      view
                    </a>
                  ) : (
                    <span className="w-10 text-right text-xs text-[var(--muted)]">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {visible < rows.length && (
            <button
              onClick={() => setVisible((v) => v + 10)}
              className="mt-4 text-sm text-[var(--primary)] hover:underline"
            >
              View more ({rows.length - visible} left)
            </button>
          )}
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${accent ? "text-[var(--accent)]" : ""}`}>{value}</p>
    </div>
  );
}