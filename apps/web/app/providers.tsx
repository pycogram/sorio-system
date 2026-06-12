"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: (...args: any[]) => void) => void;
};

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  if (w.phantom?.solana?.isPhantom) return w.phantom.solana;
  if (w.solana?.isPhantom) return w.solana;
  return null;
}

function waitForProvider(maxMs = 3000): Promise<PhantomProvider | null> {
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

type WalletCtx = {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};
type ThemeCtx = { theme: "light" | "dark"; toggle: () => void };

const WalletContext = createContext<WalletCtx>({ address: null, connect: async () => {}, disconnect: async () => {} });
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

    // Re-sync when the page is restored (browser back / bfcache) or refocused.
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

const connect = useCallback(async () => {
    const p = (await waitForProvider()) ?? getProvider();

    if (!p) {
      // No injected provider. On a mobile browser, deep-link into Phantom's
      // in-app browser loaded with this site (where the wallet works).
      const isMobile =
        typeof navigator !== "undefined" &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobile) {
        const url = window.location.href;
        const ref = window.location.origin;
        // Phantom universal link: opens this URL inside Phantom's browser.
        window.location.href =
          `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`;
        return;
      }

      // Desktop without the extension: send them to install Phantom.
      window.open("https://phantom.app/", "_blank");
      return;
    }

    try {
      const r = await p.connect();
      setAddress(r.publicKey.toString());
    } catch {
      /* user cancelled */
    }
  }, []);

  const disconnect = useCallback(async () => {
    const p = getProvider();
    if (p) await p.disconnect();
    setAddress(null);
  }, []);

  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <WalletContext.Provider value={{ address, connect, disconnect }}>
        {children}
      </WalletContext.Provider>
    </ThemeContext.Provider>
  );
}