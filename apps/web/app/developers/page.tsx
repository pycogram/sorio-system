"use client";

import { useState, useEffect, useCallback } from "react";
import { Navbar } from "../navbar";
import { useWallet } from "../providers";
import { signRequest } from "../lib/sign-request";
import Link from "next/link";

type KeyRow = {
  id: string;
  name: string | null;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "-";

export default function DevelopersPage() {
  const { address, connect } = useWallet();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null); // shown once
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setErr(null);
    try {
      const auth = await signRequest("api-keys-list", {});
      const qs = new URLSearchParams({ wallet: auth.wallet, timestamp: String(auth.timestamp), signature: auth.signature });
      const r = await fetch(`/api/keys?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "failed");
      setKeys(d.keys ?? []);
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") setErr(e?.message ?? "failed");
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Load keys once a wallet is connected.
  useEffect(() => { if (address) loadKeys(); }, [address, loadKeys]);

  async function createKey() {
    setCreating(true);
    setErr(null);
    setNewKey(null);
    try {
      const auth = await signRequest("api-keys-create", { name: name.trim() });
      const r = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), ...auth }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "failed");
      setNewKey(d.key);     // the raw key - shown ONCE
      setName("");
      await loadKeys();
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") setErr(e?.message ?? "failed");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this key? Any integration using it will stop working immediately.")) return;
    setBusyId(id);
    try {
      const auth = await signRequest("api-keys-revoke", { id });
      const r = await fetch("/api/keys/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...auth }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "failed");
      await loadKeys();
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") alert("Revoke failed: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  const activeKeys = keys.filter((k) => !k.revoked_at);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

      <div className="mx-auto max-w-3xl px-6 py-14 mt-12 md:mt-0">
                {/* Back link */}
        <Link href="/" className="inline-flex mb-6 items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Back to home
        </Link>

        <h1 className="text-3xl font-semibold tracking-tight">Sorio API</h1>
        <p className="mt-2 text-[var(--muted)] leading-relaxed">
          Read your plans and subscriptions programmatically. Generate an API key, then call the
          endpoints below from your own server.
        </p>

        {/* ── API KEYS ── */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Your API keys</h2>

          {!address ? (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
              <p className="text-sm text-[var(--muted)]">Connect your wallet to create and manage API keys.</p>
              <button
                onClick={connect}
                className="mt-4 rounded-lg bg-[var(--btn)] px-4 py-2.5 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)]"
              >
                Connect wallet
              </button>
            </div>
          ) : (
            <>
              {/* Create */}
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                <label className="text-sm font-medium">Create a new key</label>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Key name (e.g. billing app)"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    onClick={createKey}
                    disabled={creating}
                    className="rounded-lg bg-[var(--btn)] px-4 py-2.5 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)] disabled:opacity-40"
                  >
                    {creating ? "Creating…" : "Create key"}
                  </button>
                </div>

                {/* Newly created key - shown ONCE */}
                {newKey && (
                  <div className="mt-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/5 p-4">
                    <p className="text-xs font-medium text-[var(--accent)]">
                      Save this key now - you won&apos;t be able to see it again.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 break-all rounded bg-[var(--background)] px-3 py-2 text-xs">{newKey}</code>
                      <button
                        onClick={copyKey}
                        className="flex-none rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium transition hover:border-[var(--primary)]"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {err && <p className="mt-3 text-sm text-red-500">Error: {err}</p>}

              {/* List */}
              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
                {loading ? (
                  <p className="p-4 text-sm text-[var(--muted)]">Loading…</p>
                ) : activeKeys.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--muted)]">No active keys yet.</p>
                ) : (
                  activeKeys.map((k) => (
                    <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4 last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{k.name || "Unnamed key"}</p>
                        <p className="text-xs text-[var(--muted)]">
                          <code>{k.key_prefix}••••••••</code> · created {fmtDate(k.created_at)} · last used {fmtDate(k.last_used_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => revokeKey(k.id)}
                        disabled={busyId === k.id}
                        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-500/10 disabled:opacity-40"
                      >
                        {busyId === k.id ? "…" : "Revoke"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        {/* ── API REFERENCE ── */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">API reference</h2>

          <div className="mt-4 space-y-6 text-sm leading-relaxed">
            <div>
              <p className="font-medium">Base URL</p>
              <code className="mt-1 block rounded bg-[var(--card)] px-3 py-2 text-xs">https://soriopay.com/api/v1</code>
            </div>

            <div>
              <p className="font-medium">Authentication</p>
              <p className="mt-1 text-[var(--muted)]">Send your key in the Authorization header on every request:</p>
              <code className="mt-2 block rounded bg-[var(--card)] px-3 py-2 text-xs">Authorization: Bearer sk_live_your_key_here</code>
              <p className="mt-2 text-[var(--muted)]">Keep your key secret. Never expose it in client-side code or commit it to a repo.</p>
            </div>

            <Endpoint
              method="GET"
              path="/v1/plans"
              desc="List the plans you've created."
              example={`curl https://soriopay.com/api/v1/plans \\
  -H "Authorization: Bearer sk_live_..."`}
              response={`{
  "data": [
    {
      "id": "8r5o2jo5...",          // on-chain plan address
      "name": "Pro Plan",
      "amount": 448800,             // total charged (USDC base units, 6 dp)
      "merchant_amount": 440000,    // your cut after fee
      "period_seconds": 3600,
      "active": true,
      "hidden": false
    }
  ]
}`}
            />

            <Endpoint
              method="GET"
              path="/v1/subscriptions"
              desc="List subscriptions to your plans."
              example={`curl https://soriopay.com/api/v1/subscriptions \\
  -H "Authorization: Bearer sk_live_..."`}
              response={`{
  "data": [
    {
      "id": "A7foa2Vk...",          // on-chain subscription address
      "plan_id": "8r5o2jo5...",
      "plan_name": "Pro Plan",
      "subscriber": "EFWqU3k4...",
      "status": "active",
      "next_collection_at": "2026-06-24T18:53:09Z",
      "max_payments": 12,
      "payments_made": 3,
      "subscribed_at": "2026-06-24T17:52:49Z"
    }
  ]
}`}
            />

            <p className="text-xs text-[var(--muted)]">
              The API is read-only for now. Amounts are in USDC base units (divide by 1,000,000 for dollars).
              Errors return an HTTP error status with <code>{`{ "error": "..." }`}</code>.
            </p>
          </div>

          <Link href="/" className="inline-flex mt-6 items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Back to home
        </Link>

        </section>
      </div>
    </main>
  );
}

function Endpoint({ method, path, desc, example, response }: {
  method: string; path: string; desc: string; example: string; response: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">{method}</span>
        <code className="text-sm font-medium">{path}</code>
      </div>
      <p className="mt-2 text-[var(--muted)]">{desc}</p>
      <p className="mt-3 text-xs font-medium text-[var(--muted)]">Request</p>
      <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{example}</code></pre>
      <p className="mt-3 text-xs font-medium text-[var(--muted)]">Response</p>
      <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{response}</code></pre>
    </div>
  );
}