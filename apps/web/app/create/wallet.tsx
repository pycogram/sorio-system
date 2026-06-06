"use client";
import { useEffect, useState, useCallback } from "react";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: (...args: any[]) => void) => void;
};

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const anyWin = window as any;
  if (anyWin.phantom?.solana?.isPhantom) return anyWin.phantom.solana;
  if (anyWin.solana?.isPhantom) return anyWin.solana;
  return null;
}

// shared across all useWallet() consumers
let sharedAddress: string | null = null;
const listeners = new Set<(a: string | null) => void>();
function setShared(a: string | null) {
  sharedAddress = a;
  listeners.forEach((fn) => fn(a));
}

let providerListenersBound = false;
// Try to get the provider, retrying briefly since Phantom may inject after load.
function waitForProvider(maxMs = 3000): Promise<PhantomProvider | null> {
  return new Promise((resolve) => {
    const existing = getProvider();
    if (existing) return resolve(existing);
    const start = Date.now();
    const iv = setInterval(() => {
      const p = getProvider();
      if (p || Date.now() - start > maxMs) {
        clearInterval(iv);
        resolve(p);
      }
    }, 100);
  });
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(sharedAddress);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    listeners.add(setAddress);
    // Synchronously check if Phantom is already connected (handles back-navigation).
    const immediate = getProvider();
    if (immediate?.publicKey) {
      setShared(immediate.publicKey.toString());
    } else {
      setAddress(sharedAddress);
    }

    let cancelled = false;
    waitForProvider().then((p) => {
      if (cancelled || !p) return;
      setAvailable(true);

      // Bind provider events once.
      if (!providerListenersBound) {
        providerListenersBound = true;
        p.on("disconnect", () => setShared(null));
        p.on("accountChanged", (pk: any) => setShared(pk ? pk.toString() : null));
      }

      // If Phantom already has a public key (still connected from before), use it.
      if (p.publicKey) {
        setShared(p.publicKey.toString());
        return;
      }
      // Otherwise try a silent reconnect.
      if (sharedAddress === null) {
        p.connect({ onlyIfTrusted: true })
          .then((r) => setShared(r.publicKey.toString()))
          .catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      listeners.delete(setAddress);
    };
  }, []);

  const connect = useCallback(async () => {
    const p = (await waitForProvider()) ?? getProvider();
    if (!p) {
      window.open("https://phantom.app/", "_blank");
      return;
    }
    try {
      const r = await p.connect();
      setShared(r.publicKey.toString());
    } catch {
      console.log("connect cancelled");
    }
  }, []);

  const disconnect = useCallback(async () => {
    const p = getProvider();
    if (p) await p.disconnect();
    setShared(null);
  }, []);

  return { address, available, connect, disconnect };
}

export function ConnectButton() {
  const { address, connect, disconnect } = useWallet();
  const short = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null;
  return (
    <button
      onClick={address ? disconnect : connect}
      className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-sm font-medium transition hover:border-[var(--foreground)]"
    >
      {short ?? "Connect Wallet"}
    </button>
  );
}