"use client";
import Image from "next/image";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type WalletKind = "phantom" | "solflare";

type WalletProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: (...args: any[]) => void) => void;
};

const WALLET_KEY = "paylo-wallet";

export function getSelectedWallet(): WalletKind | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(WALLET_KEY);
  return v === "phantom" || v === "solflare" ? v : null;
}
function setSelectedWallet(kind: WalletKind) {
  if (typeof window !== "undefined") window.localStorage.setItem(WALLET_KEY, kind);
}
function clearSelectedWallet() {
  if (typeof window !== "undefined") window.localStorage.removeItem(WALLET_KEY);
}

// Resolve the injected provider object for a given wallet kind.
function providerFor(kind: WalletKind): WalletProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (kind === "phantom") {
    if (w.phantom?.solana?.isPhantom) return w.phantom.solana;
    if (w.solana?.isPhantom) return w.solana;
    return null;
  }
  // solflare
  if (w.solflare?.isSolflare) return w.solflare;
  return null;
}

// The currently-selected provider (based on localStorage choice), if available.
export function getProvider(): WalletProvider | null {
  const kind = getSelectedWallet();
  if (!kind) return null;
  return providerFor(kind);
}

function waitForProvider(maxMs = 3000): Promise<WalletProvider | null> {
  return new Promise((resolve) => {
    const p = getProvider();
    if (p) return resolve(p);
    const start = Date.now();
    const iv = setInterval(() => {
      const got = getProvider();
      if (got || Date.now() - start > maxMs) {
        clearInterval(iv);
        resolve(got);
      }
    }, 100);
  });
}

// Mobile deep links — open this site inside the chosen wallet's in-app browser.
function deepLink(kind: WalletKind) {
  const url = window.location.href;
  const ref = window.location.origin;
  if (kind === "phantom") {
    return `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`;
  }
  return `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`;
}

function isMobile() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

type WalletCtx = {
  address: string | null;
  connect: () => void;
  disconnect: () => Promise<void>;
};
type ThemeCtx = { theme: "light" | "dark"; toggle: () => void };

const WalletContext = createContext<WalletCtx>({ address: null, connect: () => {}, disconnect: async () => {} });
const ThemeContext = createContext<ThemeCtx>({ theme: "light", toggle: () => {} });

export function useWallet() { return useContext(WalletContext); }
export function useTheme() { return useContext(ThemeContext); }

export function Providers({
  children,
  initialTheme = "dark",
}: {
  children: React.ReactNode;
  initialTheme?: "light" | "dark";
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [bound, setBound] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Apply theme to <html> and persist to a cookie (server-readable, no flash).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.cookie = `paylo-theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      const p = getProvider();
      if (!p) return;
      if (p.publicKey) {
        setAddress(p.publicKey.toString());
      } else {
        p.connect({ onlyIfTrusted: true })
          .then((r) => setAddress(r.publicKey.toString()))
          .catch(() => {});
      }
    };

    waitForProvider().then((p) => {
      if (cancelled || !p) return;
      sync();
      if (!bound) {
        setBound(true);
        p.on("disconnect", () => setAddress(null));
        p.on("accountChanged", (pk: any) => setAddress(pk ? pk.toString() : null));
      }
    });

    const onPageShow = () => sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bound]);

  // Connect to a specific wallet kind (called after the user picks one).
  const connectTo = useCallback(async (kind: WalletKind) => {
    setSelectedWallet(kind);
    setPickerOpen(false);

    const direct = providerFor(kind);
    const p = direct ?? (await waitForProvider());

    if (!p) {
      // No injected provider for this wallet. On mobile, deep-link into the
      // wallet's in-app browser. On desktop, send them to install it.
      if (isMobile()) {
        window.location.href = deepLink(kind);
        return;
      }
      clearSelectedWallet();
      window.open(kind === "phantom" ? "https://phantom.app/" : "https://solflare.com/", "_blank");
      return;
    }

    try {
      const r = await p.connect();
      setAddress(r.publicKey.toString());
      if (!bound) {
        setBound(true);
        p.on("disconnect", () => setAddress(null));
        p.on("accountChanged", (pk: any) => setAddress(pk ? pk.toString() : null));
      }
    } catch {
      /* user cancelled */
    }
  }, [bound]);

  // Public connect(): if a wallet was already chosen, reconnect to it;
  // otherwise open the picker so the user selects Phantom or Solflare.
  const connect = useCallback(() => {
    const existing = getSelectedWallet();
    if (existing) {
      connectTo(existing);
    } else {
      setPickerOpen(true);
    }
  }, [connectTo]);

  const disconnect = useCallback(async () => {
    const p = getProvider();
    if (p) {
      try { await p.disconnect(); } catch { /* ignore */ }
    }
    clearSelectedWallet();
    setAddress(null);
  }, []);

  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <WalletContext.Provider value={{ address, connect, disconnect }}>
        {children}
        {pickerOpen && <WalletPicker onPick={connectTo} onClose={() => setPickerOpen(false)} />}
      </WalletContext.Provider>
    </ThemeContext.Provider>
  );
}

// Logo with graceful fallback: shows the brand PNG if present, otherwise a
// styled letter badge — so a missing image never looks broken.
function WalletLogo({ kind }: { kind: WalletKind }) {
  const [failed, setFailed] = useState(false);
  const meta = {
    phantom: { src: "/wallets/phantom.png", label: "P", bg: "#ab9ff2" },
    solflare: { src: "/wallets/solflare.png", label: "S", bg: "#fc7227" },
  }[kind];

  if (failed) {
    return (
      <span
        className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-sm font-bold text-white"
        style={{ background: meta.bg }}
      >
        {meta.label}
      </span>
    );
  }

  return (
    <Image
      src={meta.src}
      alt={kind === "phantom" ? "Phantom" : "Solflare"}
      width={40}
      height={40}
      className="h-10 w-10 flex-none rounded-xl"
      onError={() => setFailed(true)}
    />
  );
}

function WalletPicker({
  onPick,
  onClose,
}: {
  onPick: (kind: WalletKind) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold tracking-tight">Connect a wallet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Supported wallets for now</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--subtle)] hover:text-[var(--foreground)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-2.5">
          <WalletOption kind="phantom" name="Phantom" tagline="Popular Solana wallet" onPick={onPick} />
          <WalletOption kind="solflare" name="Solflare" tagline="Solana wallet & more" onPick={onPick} />
        </div>

        <p className="mt-5 text-center text-xs text-[var(--muted)]">
          We never hold your funds. You sign every payment yourself.
        </p>
      </div>
    </div>
  );
}

function WalletOption({
  kind,
  name,
  tagline,
  onPick,
}: {
  kind: WalletKind;
  name: string;
  tagline: string;
  onPick: (kind: WalletKind) => void;
}) {
  return (
    <button
      onClick={() => onPick(kind)}
      className="group flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-left transition hover:border-[var(--primary)] hover:shadow-sm"
    >
      <WalletLogo kind={kind} />
      <span className="flex-1">
        <span className="block font-medium">{name}</span>
        <span className="block text-xs text-[var(--muted)]">{tagline}</span>
      </span>
      <svg
        width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--primary)]"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}