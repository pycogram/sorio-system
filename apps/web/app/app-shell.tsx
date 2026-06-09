"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./navbar";
import Link from "next/link";

type NavItem = { label: string; href: string; soon?: boolean; match: (p: string) => boolean };

const icons: Record<string, React.ReactNode> = {
  Overview: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
  ),
  Subscriptions: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
  ),
  Payroll: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  Plans: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>
  ),
  Paychecks: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
  ),
  History: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg>
  ),
  API: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
  ),
};

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", match: (p) => p === "/dashboard" },
  { label: "Plans", href: "/plans", match: (p) => p.startsWith("/plans") },
  { label: "Subscriptions", href: "/subscriptions", match: (p) => p === "/subscriptions" || p.startsWith("/subscriptions/") },
  { label: "Payroll", href: "/payroll", match: (p) => p.startsWith("/payroll") },
  { label: "Paychecks", href: "/paychecks", match: (p) => p.startsWith("/paychecks") },
  { label: "History", href: "/history", match: (p) => p.startsWith("/history") },
  { label: "API", href: "#", soon: true, match: () => false },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavList = ({ collapsed }: { collapsed?: boolean }) => (
    <nav className="flex flex-col gap-2.5">
      {NAV.map((n) => {
        const active = n.match(pathname);
        const content = (
          <>
            <span className="flex-none">{icons[n.label]}</span>
            {!collapsed && (
              <span className="whitespace-nowrap">
                {n.label}
                {n.soon && <span className="ml-1.5 text-[10px]">soon</span>}
              </span>
            )}
          </>
        );
        const cls = `flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm transition ${
          collapsed ? "justify-center" : ""
        } ${
          active
            ? "border-[var(--primary)] bg-[var(--card)] text-[var(--foreground)]"
            : n.soon
            ? "border-transparent text-[var(--muted)] opacity-50 cursor-not-allowed"
            : "border-transparent text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"
        }`;
        return n.soon ? (
          <span key={n.label} title={n.label} className={cls}>{content}</span>
        ) : (
          <Link key={n.label} href={n.href} title={n.label} className={cls} onClick={() => setMobileOpen(false)}>
            {content}
          </Link>
        );
      })}
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
          <aside className="hidden md:block md:border-r md:border-[var(--border)] md:pr-4">
            <div className="hidden lg:block w-44"><NavList /></div>
            <div className="block lg:hidden"><NavList collapsed /></div>
          </aside>
          <section className="min-w-0 flex-1">{children}</section>
        </div>
      </div>
    </main>
  );
}