"use client";

import { useState } from "react";
import { Navbar } from "../navbar";
import { useWallet } from "../providers";
import { PayrollList } from "../payroll/payroll-list";
import { SubscriptionsList } from "./subscriptions-list";

type Section = "overview" | "subscriptions" | "payroll" | "api";

const icons: Record<Section, React.ReactNode> = {
  overview: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
  ),
  subscriptions: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
  ),
  payroll: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  api: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
  ),
};

const NAV: { id: Section; label: string; soon?: boolean }[] = [
  { id: "overview", label: "Overview" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "payroll", label: "Payroll" },
  { id: "api", label: "API", soon: true },
];

export default function Dashboard() {
  const { address } = useWallet();
  const [section, setSection] = useState<Section>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);

  const selectSection = (id: Section) => {
    setSection(id);
    setMobileOpen(false);
  };

  // Reusable nav list. `collapsed` = icons only (tablet rail).
  const NavList = ({ collapsed }: { collapsed?: boolean }) => (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => (
        <button
          key={n.id}
          onClick={() => !n.soon && selectSection(n.id)}
          disabled={n.soon}
          title={n.label}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
            collapsed ? "justify-center" : ""
          } ${
            section === n.id
              ? "bg-[var(--primary)] text-white"
              : n.soon
              ? "text-[var(--muted)] opacity-50 cursor-not-allowed"
              : "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--foreground)]"
          }`}
        >
          <span className="flex-none">{icons[n.id]}</span>
          {!collapsed && (
            <span className="whitespace-nowrap">
              {n.label}
              {n.soon && <span className="ml-1.5 text-[10px]">soon</span>}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      
      <Navbar onMenuClick={() => setMobileOpen(true)} />

      {/* Mobile overlay menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-[var(--background)] p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-semibold">Menu</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded-lg border border-[var(--border)] p-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <NavList />
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex gap-8">
          {/* Desktop: full sidebar (lg+). Tablet: icon rail (md). Mobile: hidden. */}
          <aside className="hidden md:block md:border-r md:border-[var(--border)] md:pr-4">
            {/* full labels on lg+, icons-only on md */}
            <div className="hidden lg:block w-44"><NavList /></div>
            <div className="block lg:hidden"><NavList collapsed /></div>
          </aside>

          {/* Main panel */}
          <section className="min-w-0 flex-1">
            {!address && <p className="text-[var(--muted)]">Connect your wallet to view your dashboard.</p>}
            {address && section === "overview" && <OverviewPanel />}
            {address && section === "subscriptions" && <SubscriptionsList />}
            {address && section === "payroll" && <PayrollList />}
          </section>
        </div>
      </div>
    </main>
  );
}

function OverviewPanel() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-2 text-[var(--muted)]">Your Paylo activity at a glance.</p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <a href="/create" className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--primary)]">
          <p className="font-medium">Subscriptions</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Create plans and get paid on repeat.</p>
        </a>
        <a href="/payroll" className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--primary)]">
          <p className="font-medium">Payroll</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Pay your team on a schedule.</p>
        </a>
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-4 text-[var(--muted)]">Coming into this panel next…</p>
    </div>
  );
}