"use client";
import Link from "next/link";

import { useState } from "react";
import { Navbar } from "../../navbar";
import { useWallet } from "../../providers";
import { signRequest } from "../../lib/sign-request"; 

type Employee = { wallet: string; amount: string; times: string };

const PERIODS = [
  { label: "Hourly", seconds: 3600 },
  { label: "Daily", seconds: 86400 },
  { label: "Weekly", seconds: 604800 },
  { label: "Monthly", seconds: 2592000 },
  { label: "Yearly", seconds: 31536000 },
];

const FEE_PERCENT = 2;

export default function NewPayrollPage() {
  const { address } = useWallet();
  const [name, setName] = useState("");
  const [period, setPeriod] = useState(2592000);
  const [employees, setEmployees] = useState<Employee[]>([{ wallet: "", amount: "", times: "" }]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const updateEmployee = (i: number, field: keyof Employee, value: string) =>
    setEmployees((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  const addRow = () => setEmployees((prev) => [...prev, { wallet: "", amount: "", times: "" }]);
  const removeRow = (i: number) => setEmployees((prev) => prev.filter((_, idx) => idx !== i));

  const salaryTotal = employees.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const grandTotal = salaryTotal * (1 + FEE_PERCENT / 100);
  const periodLabel = PERIODS.find((p) => p.seconds === period)?.label.toLowerCase() ?? "";

  const valid =
    name.trim() &&
    employees.length > 0 &&
    employees.every((e) => e.wallet.trim().length > 30 && parseFloat(e.amount) > 0);

  // Clears the success banner the moment the employer starts a new payroll.
  const clearDone = () => { if (done) setDone(false); };

  async function handleSave() {
    if (!address || !valid) return;
    setSaving(true);
    try {
      const auth = await signRequest("payroll-create", { employerWallet: address, name: name.trim(), periodSeconds: String(period) });
      const r = await fetch("/api/payroll/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...auth,
          employerWallet: address,
          name: name.trim(),
          periodSeconds: period,
          employees: employees.map((e) => ({
            wallet: e.wallet.trim(),
            amount: Math.round(parseFloat(e.amount) * 1_000_000),
            maxPayments: parseInt(e.times) > 0 ? parseInt(e.times) : null,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setDone(true);
      // Reset the form so the employer can't accidentally recreate the same payroll.
      setName("");
      setPeriod(2592000);
      setEmployees([{ wallet: "", amount: "", times: "" }]);
    } catch (e: any) {
      if (e?.message === "USER_CANCELLED") return;
      alert("Failed: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-5xl px-8 py-14 mt-12 md:mt-0">
        <Link href="/payroll" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← Payroll</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">New payroll</h1>
        <p className="mt-2 text-[var(--muted)]">Name it, set a schedule, and add the people you pay.</p>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* LEFT — form (scrolls) */}
          <div className="space-y-6 lg:col-span-2">
            <div>
              <label className="text-sm font-medium">Payroll name</label>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); clearDone(); }}
                placeholder="Acme Corp - Staff"
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Pay schedule</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PERIODS.map((p) => (
                  <button
                    key={p.seconds}
                    onClick={() => { setPeriod(p.seconds); clearDone(); }}
                    className={`rounded-lg border px-4 py-2 text-sm transition ${
                      period === p.seconds
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] hover:border-[var(--foreground)]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Employees</label>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Set how many times each employee is paid. Leave “times” blank to pay forever.
              </p>

              {/* Column labels (align with the inputs below) */}
              <div className="mt-3 flex w-full gap-2 px-1">
                <span className="w-[60%] flex-1 text-xs font-medium text-[var(--muted)]">Wallet address</span>
                <span className="w-[20%] text-xs font-medium text-[var(--muted)]">Amount</span>
                <span className="w-[15%] text-xs font-medium text-[var(--muted)]">Times</span>
                {employees.length > 1 && <span className="w-[34px]" />}
              </div>

              <div className="mt-1 space-y-2">
                {employees.map((e, i) => (
                  <div key={i} className="flex w-[100%] gap-2">
                    <input
                      value={e.wallet}
                      onChange={(ev) => { updateEmployee(i, "wallet", ev.target.value); clearDone(); }}
                      placeholder="Employee wallet address"
                      className="w-[60%] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                    />
                    <input
                      value={e.amount}
                      onChange={(ev) => { updateEmployee(i, "amount", ev.target.value); clearDone(); }}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="w-[20%] rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                    />
                    <input
                      value={e.times ?? ""}
                      onChange={(ev) => { updateEmployee(i, "times", ev.target.value); clearDone(); }}
                      placeholder="∞"
                      inputMode="numeric"
                      title="Number of payments (blank = forever)"
                      className="w-[15%] rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                    />
                    {employees.length > 1 && (
                      <button
                        onClick={() => removeRow(i)}
                        className="w-fit rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--muted)] transition hover:border-red-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addRow}
                className="mt-3 rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition hover:border-[var(--primary)]"
              >
                + Add employee
              </button>
            </div>
          </div>

          {/* RIGHT — sticky summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              {done ? (
                <div className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <p className="mt-4 font-semibold text-[var(--accent)]">Payroll created</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Next, approve each employee on-chain to start paying them.
                  </p>
                  <Link href="/payroll" className="mt-5 inline-block w-full rounded-lg bg-[var(--btn)] px-4 py-3 text-sm font-medium text-[var(--btn-text)]">
                    Go to Payroll →
                  </Link>
                  <button
                    onClick={() => setDone(false)}
                    className="mt-3 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Create another payroll
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium">Summary</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Employees</span>
                      <span>{employees.filter((e) => e.wallet.trim() && parseFloat(e.amount) > 0).length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Salaries / {periodLabel}</span>
                      <span>${salaryTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Platform fee ({FEE_PERCENT}%)</span>
                      <span>${(grandTotal - salaryTotal).toFixed(2)}</span>
                    </div>
                    <div className="my-3 h-px bg-[var(--border)]" />
                    <div className="flex justify-between font-semibold">
                      <span>You pay / {periodLabel}</span>
                      <span>${grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    disabled={!address || !valid || saving}
                    onClick={handleSave}
                    className="mt-5 w-full rounded-lg bg-[var(--btn)] px-4 py-3 font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving…" : address ? "Create payroll" : "Connect wallet"}
                  </button>
                  <p className="mt-3 text-center text-xs text-[var(--muted)]">
                    Paid in USDC on Solana · cancel anytime
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}