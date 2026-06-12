"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useWallet, useTheme } from "./providers";
export function Navbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { address, connect, disconnect } = useWallet();
  const { theme, toggle } = useTheme();
  const [connecting, setConnecting] = useState(false);
  const short = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null;

  async function handleClick() {
    if (address) {
      await disconnect();
      return;
    }
    setConnecting(true);
    try {
      await connect();
    } finally {
      setConnecting(false);
    }
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-[var(--background)] px-4 md:px-8 py-5 border-b border-[var(--border)] md:static md:z-auto">
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src="/z-paylo-logo.png" alt="Paylo" width={28} height={28} className="rounded-lg" />
        <span className="text-lg font-semibold tracking-tight">Paylo</span>
      </Link>
      <div className="flex items-center gap-4">
        <button
          onClick={handleClick}
          disabled={connecting}
          className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm font-medium transition hover:border-[var(--foreground)] disabled:opacity-60"
        >
          {connecting ? "Connecting…" : short ?? "Connect Wallet"}
        </button>
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="rounded-lg border border-[var(--border)] p-2 transition hover:border-[var(--primary)]"
        >
          {theme === "light" ? (
            // moon
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            // sun
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            className="rounded-lg border border-[var(--border)] p-2 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </nav>
  );
}