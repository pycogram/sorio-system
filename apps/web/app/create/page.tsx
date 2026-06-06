"use client";

import { useState } from "react";
import { Navbar } from "../navbar";
import { useWallet } from "../providers";

export default function CreatePlanPage() {
  const { address } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("weekly");
  const [created, setCreated] = useState<null | { link: string }>(null);
  const [copied, setCopied] = useState(false);

  const periods: Record<string, string> = {
    weekly: "week",
    monthly: "month",
    yearly: "year",
  };

  async function handleCreate() {
    if (!name || !amount) return;
    if (!address) {
      setError("Connect your wallet first — that's where payments land.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/create-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount, period, destinationWallet: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create plan");
      setCreated({ link: `paylo.app/subscribe/${data.planPda}` });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* nav */}
      <Navbar />

      <div className="mx-auto max-w-5xl px-8 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Create a plan</h1>
        <p className="mt-2 text-[var(--muted)]">
          Set your terms once. Share the link. Get paid automatically every cycle.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-2">
          {/* form */}
          <div className="space-y-6">
            <Field label="Plan name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pro Membership"
                className="w-full rounded-lg border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--primary)] transition"
              />
            </Field>

            <Field label="Amount (USDC)">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="9.99"
                inputMode="decimal"
                className="w-full rounded-lg border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--primary)] transition"
              />
            </Field>

            <Field label="Billing period">
              <div className="flex gap-2">
                {Object.keys(periods).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`flex-1 rounded-lg border px-4 py-3 text-sm capitalize transition ${
                      period === p
                        ? "border-[var(--btn)] bg-[var(--btn)] text-[var(--btn-text)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <button
              onClick={handleCreate}
              disabled={!name || !amount || loading}
              className="w-full rounded-lg bg-[var(--btn)] px-4 py-3 font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Creating on-chain…" : "Create plan"}
            </button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          {/* preview */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--subtle)] p-8">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Customer sees
            </p>
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <p className="text-sm text-[var(--muted)]">{name || "Plan name"}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                ${amount || "0.00"}
                <span className="text-base font-normal text-[var(--muted)]">
                  {" "}
                  / {periods[period]}
                </span>
              </p>
              <div className="mt-5 w-full rounded-lg bg-[var(--btn)] py-2.5 text-center text-sm font-medium text-[var(--btn-text)] opacity-90 cursor-default select-none">
                Subscribe
              </div>
              <p className="mt-3 text-center text-xs text-[var(--muted)]">
                Approve once · Cancel anytime
              </p>
            </div>

            {created && (
              <div className="mt-6 rounded-xl border border-[var(--accent)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    Shareable link
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(created.link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium transition hover:border-[var(--foreground)]"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 break-all font-mono text-sm text-[var(--primary)]">
                  {created.link}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}