"use client";
import Link from "next/link";

import { useState } from "react";
import { useWallet } from "../providers";
import { runApproveEmployee } from "./approve-action";
import { runCancel } from "../subscribe/[planPda]/cancel-action";
import useSWR from "swr";
import { fetcher } from "../lib/fetcher";
import { signRequest } from "../lib/sign-request";

type HistoryRow = { amount: number; fee: number; status: string; salary_tx: string | null; paid_at: string };
type Item = {
  id: string;
  employee_wallet: string;
  amount: number;
  status: string;
  plan_pda: string | null;
  subscription_pda: string | null;
  next_payment_at: string | null;
  last_payment_at: string | null;
  max_payments: number | null;
  payroll_history: HistoryRow[];
};
type Payroll = {
  id: string;
  name: string;
  period_seconds: number;
  hidden: boolean;
  start_mode: "pay_now" | "date" | null;
  start_date: string | null;
  payroll_items: Item[];
};

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 3600 ? "hour" : s === 86400 ? "day" : s === 604800 ? "week" : s === 2592000 ? "month" : `${s / 3600}h`;

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

// Has any successful payment been made on this payroll? If so, the start
// setting is locked.
function payrollHasPaid(p: Payroll): boolean {
  return p.payroll_items.some((i) => (i.payroll_history ?? []).some((h) => h.status === "success"));
}

export function PayrollsOwned() {
  const { address } = useWallet();
  const [approving, setApproving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [visible, setVisible] = useState(5);

  const { data, isLoading: loading, mutate } = useSWR(
    address ? `/api/payroll/list?wallet=${address}` : null,
    fetcher
  );
  const payrolls: Payroll[] | null = data ? data.payrolls ?? [] : null;

  async function refresh() {
    await mutate();
  }

  async function handleApprove(item: Item, p: Payroll) {
    if (!p.start_mode) return; // guarded by UI, but double-check
    setApproving(item.id);
    try {
      await runApproveEmployee({
        itemId: item.id,
        startMode: p.start_mode,
        startDate: p.start_date,
      });
      await refresh();
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (e?.code === 4001 || /reject/i.test(msg) || msg === "USER_CANCELLED") return;
      console.error("approve failed:", e);
      alert("Approve failed: " + msg);
    } finally {
      setApproving(null);
    }
  }

  async function handleRemove(item: Item) {
    if (!item.plan_pda || !item.subscription_pda) return;
    if (!confirm("Remove this employee? This revokes their payment authorization on-chain.")) return;
    setRemoving(item.id);
    try {
      await runCancel({ planPda: item.plan_pda, subscriptionPda: item.subscription_pda });
      const auth = await signRequest("payroll-remove", { itemId: item.id });
      await fetch("/api/payroll/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, itemId: item.id }),
      });
      await refresh();
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") {
        console.error("remove failed:", e);
        alert("Remove failed: " + (e?.message ?? e));
      }
    } finally {
      setRemoving(null);
    }
  }

  async function toggleHidden(p: Payroll) {
    if (!address) return;
    setHidingId(p.id);
    try {
      const auth = await signRequest("payroll-hide", { payrollId: p.id, hidden: !p.hidden });
      const res = await fetch(`/api/payroll/${p.id}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, hidden: !p.hidden }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to update payroll");
      }
      await refresh();
    } catch (e: any) {
      if (e?.message === "USER_CANCELLED") return;
      alert(e?.message ?? "Could not update payroll visibility.");
    } finally {
      setHidingId(null);
    }
  }

  const visiblePayrolls = payrolls?.filter((p) => !p.hidden) ?? [];
  const hiddenPayrolls = payrolls?.filter((p) => p.hidden) ?? [];
  const shownPayrolls = showHidden ? [...visiblePayrolls, ...hiddenPayrolls] : visiblePayrolls;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <Link href="/payroll/new" className="rounded-lg bg-[var(--btn)] px-4 py-2 text-sm font-medium text-[var(--btn-text)]">
          + New payroll
        </Link>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">Payrolls paying out from your wallet.</p>

      {!address && <p className="mt-8 text-[var(--muted)]">Connect your wallet to view your payrolls.</p>}
      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {address && payrolls && payrolls.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">No payrolls yet. Create your first one.</p>
      )}

      {address && payrolls && payrolls.length > 0 && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Paid out"
              value={usd(
                payrolls.reduce(
                  (sum, p) =>
                    sum +
                    p.payroll_items.reduce(
                      (s, i) =>
                        s + (i.payroll_history ?? []).filter((h) => h.status === "success").reduce((hs, h) => hs + h.amount, 0),
                      0
                    ),
                  0
                )
              )}
            />
            <Stat label="Payrolls" value={String(visiblePayrolls.length)} />
            <Stat label="Employees" value={String(payrolls.reduce((n, p) => n + p.payroll_items.length, 0))} />
            <Stat
              label="Active"
              value={String(payrolls.reduce((n, p) => n + p.payroll_items.filter((i) => i.status === "active").length, 0))}
            />
          </div>

          {visiblePayrolls.length === 0 && !showHidden && hiddenPayrolls.length > 0 && (
            <p className="mt-8 text-sm text-[var(--muted)]">
              All your payrolls are hidden. Use “Show hidden payrolls” below to bring them back.
            </p>
          )}

          <div className="mt-8 space-y-5">
            {shownPayrolls.slice(0, visible).map((p) => {
              const period = periodLabel(p.period_seconds);
              const total = p.payroll_items.reduce((s, i) => s + i.amount, 0);
              const removedCount = p.payroll_items.filter((i) => i.status === "removed").length;
              const hiding = hidingId === p.id;
              const locked = payrollHasPaid(p);
              const needsChoice = !p.start_mode;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 ${p.hidden ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold">{p.name}</p>
                        {p.hidden && (
                          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--muted)]">
                        {p.payroll_items.length} {p.payroll_items.length === 1 ? "employee" : "employees"} · {usd(total)} / {period}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleHidden(p)}
                      disabled={hiding}
                      className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--primary)] disabled:opacity-50"
                    >
                      {hiding ? "…" : p.hidden ? "Unhide" : "Hide"}
                    </button>
                  </div>

                  {/* Start-setting panel */}
                  <StartSetting payroll={p} locked={locked} onSaved={refresh} walletAddr={address!} />

                  <div className="mt-4 space-y-2">
                    {p.payroll_items
                      .filter((i) => (showRemoved ? true : i.status !== "removed"))
                      .map((i) => {
                        const paidCount = (i.payroll_history ?? []).filter((h) => h.status === "success").length;
                        const lastPaid = (i.payroll_history ?? [])
                          .filter((h) => h.status === "success")
                          .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))[0];
                        return (
                          <div key={i.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm">
                            <div className="flex flex-col">
                              <span className="font-mono text-[var(--muted)]">{short(i.employee_wallet)}</span>
                              {i.max_payments != null ? (
                                <span className="mt-0.5 text-xs text-[var(--muted)]">
                                  {paidCount} of {i.max_payments} payments
                                  {paidCount >= i.max_payments ? " · complete" : ` · ${i.max_payments - paidCount} left`}
                                </span>
                              ) : (
                                paidCount > 0 && (
                                  <span className="mt-0.5 text-xs text-[var(--muted)]">
                                    {paidCount} paid · last {fmtDate(lastPaid?.paid_at ?? null)}
                                  </span>
                                )
                              )}
                            </div>
                            <span>{usd(i.amount)} / {period}</span>
                            {i.status === "active" ? (
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-[var(--accent)]">active</span>
                                <button
                                  onClick={() => handleRemove(i)}
                                  disabled={removing === i.id}
                                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-red-400 hover:text-red-500 disabled:opacity-50"
                                >
                                  {removing === i.id ? "Removing…" : "Remove"}
                                </button>
                              </div>
                            ) : i.status === "removed" ? (
                              <span className="text-xs text-[var(--muted)]">removed</span>
                            ) : i.status === "completed" ? (
                              <span className="text-xs text-[var(--muted)]">completed</span>
                            ) : (
                              <button
                                onClick={() => handleApprove(i, p)}
                                disabled={approving === i.id || needsChoice}
                                title={needsChoice ? "Choose when payments start first" : ""}
                                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {approving === i.id ? "Approving…" : "Approve"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {needsChoice && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                      Approve is locked until you choose when payments start.
                    </p>
                  )}

                  {removedCount > 0 && (
                    <button
                      onClick={() => setShowRemoved((v) => !v)}
                      className="mt-3 text-xs text-[var(--primary)] hover:underline"
                    >
                      {showRemoved ? "Hide removed" : `Show removed (${removedCount})`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {visible < shownPayrolls.length && (
            <button
              onClick={() => setVisible((v) => v + 10)}
              className="mt-4 text-sm text-[var(--primary)] hover:underline"
            >
              View more ({shownPayrolls.length - visible} left)
            </button>
          )}

          {hiddenPayrolls.length > 0 && (
            <button
              onClick={() => {
                setShowHidden((v) => !v);
                setVisible(5);
              }}
              className="mt-6 block text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              {showHidden ? "Hide hidden payrolls" : `Show hidden payrolls (${hiddenPayrolls.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function StartSetting({
  payroll,
  locked,
  onSaved,
  walletAddr,
}: {
  payroll: Payroll;
  locked: boolean;
  onSaved: () => void;
  walletAddr: string;
}) {
  const [mode, setMode] = useState<"pay_now" | "date">(payroll.start_mode ?? "pay_now");
  const [date, setDate] = useState(payroll.start_date ? payroll.start_date.split("T")[0] : "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!payroll.start_mode);
  const today = new Date().toISOString().split("T")[0];

  const fmtNice = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

  const summary =
    payroll.start_mode === "date" && payroll.start_date
      ? `${locked ? "started" : "starts"} ${fmtNice(payroll.start_date)}`
      : locked
        ? "paid on approval"
        : "pays on approval";

  // ---- State 3: locked (a payment has been made) ----
  if (locked) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--subtle)] px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <CalIcon />
          <span className="text-[var(--muted)]">First payment:</span>
          <span className="font-medium">{summary}</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <LockIcon /> Locked
        </span>
      </div>
    );
  }

  // ---- State 2: set, still editable (summary + Edit) ----
  if (payroll.start_mode && !editing) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <CalIcon />
          <span className="text-[var(--muted)]">First payment:</span>
          <span className="font-medium">{summary}</span>
        </span>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <EditIcon /> Edit
        </button>
      </div>
    );
  }

  // ---- State 1: chooser (not set yet, or editing) ----
  const canSave = mode === "pay_now" || (mode === "date" && !!date);

  async function save() {
    setSaving(true);
    try {
      const startDate = mode === "date" ? date : null;
      const auth = await signRequest("payroll-start", { payrollId: payroll.id, mode, startDate });
      const res = await fetch(`/api/payroll/${payroll.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, mode, startDate }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to save");
      }
      setEditing(false);
      await onSaved();
    } catch (e: any) {
      if (e?.message === "USER_CANCELLED") return;
      alert(e?.message ?? "Could not save start setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--subtle)] p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <CalIcon />
        <span className="text-sm font-medium">When do payments start?</span>
        {!payroll.start_mode && (
          <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] text-red-500">Required</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMode("pay_now")}
          className={`rounded-lg border px-3.5 py-1.5 text-sm transition ${
            mode === "pay_now"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--foreground)]"
          }`}
        >
          Pay now
        </button>
        <button
          onClick={() => setMode("date")}
          className={`rounded-lg border px-3.5 py-1.5 text-sm transition ${
            mode === "date"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--foreground)]"
          }`}
        >
          Start on date
        </button>
        {mode === "date" && (
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {payroll.start_mode && (
            <button
              onClick={() => {
                setMode(payroll.start_mode ?? "pay_now");
                setDate(payroll.start_date ? payroll.start_date.split("T")[0] : "");
                setEditing(false);
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition hover:border-[var(--foreground)]"
            >
              Cancel
            </button>
          )}
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="rounded-lg bg-[var(--btn)] px-4 py-1.5 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <p className="mt-2.5 text-xs text-[var(--muted)]">
        Set this before approving anyone. You can change it until the first payment is made.
      </p>
    </div>
  );
}

function CalIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)]">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
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