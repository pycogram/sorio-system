"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../navbar";
import { useWallet } from "../providers";

type Payment = {
  id: string;
  amount: number;
  status: string;
  tx_signature: string | null;
  attempted_at: string;
};
type Data = { merchant: { name: string } | null; recentPayments: Payment[] };

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function PaymentsPage() {
  const { address } = useWallet();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/dashboard?wallet=${address}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-4xl px-8 py-12">
        <a href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← Dashboard</a>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">All payments</h1>

        {!address && <p className="mt-6 text-[var(--muted)]">Connect your wallet to view payments.</p>}
        {address && loading && <p className="mt-6 text-[var(--muted)]">Loading…</p>}

        {address && data && (
          <div className="mt-8 overflow-hidden rounded-xl border border-[var(--border)]">
            {data.recentPayments.length === 0 && (
              <p className="p-6 text-sm text-[var(--muted)]">No payments yet.</p>
            )}
            {data.recentPayments.map((pay, i) => (
              <div
                key={pay.id}
                className={`flex items-center justify-between px-6 py-4 text-sm ${
                  i > 0 ? "border-t border-[var(--border)]" : ""
                }`}
              >
                <span className="w-28 text-[var(--muted)]">{fmtDate(pay.attempted_at)}</span>
                <span className="w-20 text-right">{usd(pay.amount)}</span>
                <span
                  className={`w-20 text-center ${
                    pay.status === "success" ? "text-green-600" : "text-[var(--muted)]"
                  }`}
                >
                  {pay.status}
                </span>
                {pay.tx_signature ? (
                  <a
                    href={`https://explorer.solana.com/tx/${pay.tx_signature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-12 text-right text-[var(--primary)] hover:underline"
                  >
                    view
                  </a>
                ) : (
                  <span className="w-12 text-right text-[var(--muted)]">—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}