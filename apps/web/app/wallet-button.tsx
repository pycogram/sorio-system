"use client";

import { useState, useRef, useEffect } from "react";
import { useWallet } from "./providers";

// Self-contained wallet control: the connected button + dropdown (copy / switch
// / disconnect), or a "Connect Wallet" button when disconnected. Uses useWallet
// internally, so it can be dropped anywhere (navbar, developer page, etc.).
export function WalletButton() {
  const { address, connecting, connect, switchWallet, disconnect } = useWallet();
  const short = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  if (!address) {
    return (
      <button
        onClick={() => connect()}
        disabled={connecting}
        className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm font-medium transition hover:border-[var(--foreground)] disabled:opacity-60"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm font-medium transition hover:border-[var(--foreground)]"
      >
        {short}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition ${menuOpen ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute left-0 md:right-0 mt-2 w-52 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl z-50">
          <button
            onClick={() => {
              navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-[var(--subtle)]"
          >
            <span className="font-mono text-[var(--muted)]">{short}</span>
            <span className="text-xs text-[var(--muted)]">{copied ? "Copied!" : "Copy"}</span>
          </button>
          <div className="border-t border-[var(--border)]" />
          <button
            onClick={() => {
              setMenuOpen(false);
              switchWallet();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition hover:bg-[var(--subtle)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            Switch wallet
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              disconnect();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-500 transition hover:bg-[var(--subtle)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}