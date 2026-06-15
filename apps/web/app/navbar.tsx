"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useWallet, useTheme } from "./providers";

export function Navbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { address, connect, switchWallet, disconnect } = useWallet();
  const { theme, toggle } = useTheme();
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

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-[var(--background)] px-4 md:px-8 py-5 border-b border-[var(--border)] md:static md:z-auto">
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image src="/z-sorio-tbg-logo.png" alt="Sorio" width={28} height={28} className="rounded-lg" />
        <span className="text-lg font-semibold tracking-tight">Sorio</span>
      </Link>
      <div className="flex items-center gap-4">
        {address ? (
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
              <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
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
        ) : (
          <button
            onClick={() => connect()}
            className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm font-medium transition hover:border-[var(--foreground)]"
          >
            Connect Wallet
          </button>
        )}

        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="rounded-lg border border-[var(--border)] p-2 transition hover:border-[var(--primary)]"
        >
          {theme === "light" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
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