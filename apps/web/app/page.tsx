"use client";

import { Navbar } from "./navbar";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-3xl px-8 py-32 text-center">
        <h1 className="text-5xl font-semibold tracking-tight">
          Recurring payments on Solana
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-[var(--muted)]">
          Set your terms once, share a link, and get paid automatically every cycle —
          no card, no bank, paid in USDC. Cancel anytime.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="/create"
            className="rounded-lg bg-[var(--btn)] px-6 py-3 font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)]"
          >
            Create a plan
          </a>
          <a
            href="/dashboard"
            className="rounded-lg border border-[var(--border)] px-6 py-3 font-medium transition hover:border-[var(--foreground)]"
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}