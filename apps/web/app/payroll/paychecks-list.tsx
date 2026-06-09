"use client";

import { useState } from "react";
import useSWR from "swr";
import { useWallet } from "../providers";
import { fetcher } from "../lib/fetcher";

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 86400 ? "day" : s === 604800 ? "week" : s === 2592000 ? "month" : `${s / 3600}h`;
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export function PaychecksList() {
  const { address } = useWallet();
  const [visible, setVisible] = useState(5);

  const { data, isLoading: loading } = useSWR(
    address ? `/api/payroll/employee?wallet=${address}` : null,
    fetcher
  );
  const received: any[] | null = data ? data.items ?? [] : null;

  const totalReceived =
    received?.reduce(
      (sum, i) =>
        sum + (i.payroll_history ?? []).filter((h: any) => h.status === "success").reduce((s: number, h: any) => s + h.amount, 0),
      0
    ) ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Paychecks</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Payrolls paying into your wallet.</p>

      {!address && <p className="mt-8 text-[var(--muted)]">Connect your wallet to see payments you receive.</p>}
      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {address && received && received.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">No one is paying you through Paylo yet.</p>
      )}

      {address && received && received.length > 0 && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Paychecks" value={String(received.length)} />
            <Stat label="Active" value={String(received.filter((i) => i.status === "active").length)} />
            <Stat label="Total received" value={usd(totalReceived)} />
          </div>

          <div className="mt-8 space-y-3">
            {received.slice(0, visible).map((i: any) => {
              const pr = i.payrolls;
              const period = pr ? periodLabel(pr.period_seconds) : "";
              const paidCount = (i.payroll_history ?? []).filter((h: any) => h.status === "success").length;
              return (
                <div key={i.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{pr?.name ?? "Payroll"}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        From {pr ? short(pr.employer_wallet) : "—"} · {usd(i.amount)} / {period}
                      </p>
                    </div>
                    <div className="text-right">
                      {i.status === "active" ? (
                        <span className="text-xs text-[var(--accent)]">active ✓</span>
                      ) : (
                        <span className="text-xs text-[var(--muted)] capitalize">{i.status}</span>
                      )}
                      {i.status === "active" && (
                        <p className="mt-1 text-xs text-[var(--muted)]">next {fmtDate(i.next_payment_at)}</p>
                      )}
                    </div>
                  </div>
                  {paidCount > 0 && (
                    <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                      {paidCount} payment{paidCount > 1 ? "s" : ""} received · last {fmtDate(i.last_payment_at)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {visible < received.length && (
            <button
              onClick={() => setVisible((v) => v + 10)}
              className="mt-4 text-sm text-[var(--primary)] hover:underline"
            >
              View more ({received.length - visible} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}