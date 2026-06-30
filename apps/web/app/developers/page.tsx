"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "../providers";
import { signRequest } from "../lib/sign-request";
import { WalletButton } from "../wallet-button";
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
  const { address } = useWallet();
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Top bar: back link + wallet */}
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Back to home
          </Link>
          <WalletButton />
        </div>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Sorio API</h1>
        <p className="mt-2 text-[var(--muted)] leading-relaxed">
          Read your plans and subscriptions programmatically. Generate an API key, then call the
          endpoints below from your own server.
        </p>

        {/* ── API KEYS ── */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Your API keys</h2>

          {!address ? (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
              <p className="text-sm text-[var(--muted)]">Connect your wallet (top right) to create and manage API keys.</p>
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
              method="POST"
              path="/v1/plans"
              desc="Create a new subscription plan on-chain. Returns the plan address and a shareable subscribe link."
              body={`{
  "name":   "Pro Plan",  // string, required, max 100 chars
  "amount": "9.99",      // USDC you receive per cycle — fee is added on top
  "period": "monthly"    // hourly | daily | weekly | monthly | yearly
}`}
              example={`curl -X POST https://soriopay.com/api/v1/plans \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Pro Plan", "amount": "9.99", "period": "monthly" }'`}
              response={`{
  "data": {
    "id": "E9Sc8p63...",            // on-chain plan address
    "name": "Pro Plan",
    "amount": 10189800,              // total charged to subscriber (USDC base units)
    "merchant_amount": 9990000,      // your cut after fee
    "period_seconds": 2592000,
    "active": true,
    "subscribe_url": "https://soriopay.com/subscribe/E9Sc8p63..."
  }
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
              Amounts are in USDC base units (divide by 1,000,000 for dollars).
              Errors return an HTTP error status with <code>{`{ "error": "..." }`}</code>.
            </p>
          </div>
        </section>

        {/* ── WEBHOOKS ── */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Webhooks</h2>
          <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
            Instead of polling <code>GET /v1/subscriptions</code> to find out when a payment is collected,
            register a webhook endpoint and Sorio will call you. Every time the cron worker
            successfully pulls a subscription payment, your server receives an HTTP POST with the details.
          </p>

          <div className="mt-6 space-y-4 text-sm">

            {/* Register */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="flex items-center gap-2">
                <span className="rounded px-2 py-0.5 text-xs font-semibold bg-[var(--primary)]/10 text-[var(--primary)]">POST</span>
                <code className="text-sm font-medium">/v1/webhooks</code>
              </div>
              <p className="mt-2 text-[var(--muted)]">Register a webhook endpoint. Replaces any existing webhook for your wallet. The <code>secret</code> is returned once — save it immediately.</p>
              <p className="mt-3 text-xs font-medium text-[var(--muted)]">Body</p>
              <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{`{ "url": "https://yourapp.com/webhook" }`}</code></pre>
              <p className="mt-3 text-xs font-medium text-[var(--muted)]">Example</p>
              <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{`curl -X POST https://soriopay.com/api/v1/webhooks \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "url": "https://yourapp.com/webhook" }'`}</code></pre>
              <p className="mt-3 text-xs font-medium text-[var(--muted)]">Response</p>
              <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{`{
  "data": {
    "id": "3b1a9f...",
    "url": "https://yourapp.com/webhook",
    "secret": "a3f8c2...",   // 64-char hex — store this, shown once
    "active": true,
    "created_at": "2026-06-30T12:00:00Z"
  }
}`}</code></pre>
            </div>

            {/* List + Delete */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="rounded px-2 py-0.5 text-xs font-semibold bg-[var(--accent)]/10 text-[var(--accent)]">GET</span>
                  <code className="text-sm font-medium">/v1/webhooks</code>
                  <span className="text-xs text-[var(--muted)]">— list your active webhook (secret not returned)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded px-2 py-0.5 text-xs font-semibold bg-red-500/10 text-red-500">DELETE</span>
                  <code className="text-sm font-medium">/v1/webhooks/{"{id}"}</code>
                  <span className="text-xs text-[var(--muted)]">— deactivate a webhook</span>
                </div>
              </div>
            </div>

            {/* Event payload */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <p className="font-medium">Event: <code>payment.collected</code></p>
              <p className="mt-2 text-[var(--muted)]">Fired after every successful subscription payment collection.</p>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{`{
  "event": "payment.collected",
  "data": {
    "subscription": "A7foa2Vk...",  // subscription delegation address
    "plan":         "E9Sc8p63...",  // plan address
    "subscriber":   "EFWqU3k4...",  // payer wallet
    "amount":       9990000,        // your cut (USDC base units)
    "fee":          199800,         // platform fee
    "tx":           "5jK7...",      // on-chain transaction signature
    "collected_at": "2026-06-30T12:00:00Z"
  }
}`}</code></pre>
            </div>

            {/* Signature verification */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <p className="font-medium">Verifying the signature</p>
              <p className="mt-2 text-[var(--muted)]">
                Every request includes an <code>X-Sorio-Signature</code> header.
                It's an HMAC-SHA256 of the raw request body, signed with your webhook secret.
                Always verify it before acting on the payload — anyone can POST to your endpoint.
              </p>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{`// Node.js / Express example
const crypto = require("crypto");

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig  = req.headers["x-sorio-signature"];          // "sha256=abc123..."
  const hmac = "sha256=" + crypto
    .createHmac("sha256", process.env.SORIO_WEBHOOK_SECRET)
    .update(req.body)   // raw Buffer — do NOT parse JSON first
    .digest("hex");

  if (sig !== hmac) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(req.body);
  if (event.event === "payment.collected") {
    // provision the subscriber, send a receipt, etc.
    const { subscription, subscriber, amount } = event.data;
    console.log(\`\${subscriber} paid \${amount / 1e6} USDC\`);
  }

  res.sendStatus(200);  // always respond quickly — Sorio does not retry
});`}</code></pre>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Parse JSON <em>after</em> verifying — the HMAC is computed over the raw bytes,
                not the parsed object. Sorio fires and forgets: if your server is down, the event is lost.
                Design your endpoint to be idempotent.
              </p>
            </div>

          </div>
        </section>

        {/* ── HOSTED CHECKOUT ── */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Hosted checkout</h2>
          <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
            Subscribing requires the customer's Solana wallet. Instead of building wallet integration yourself,
            redirect your customer to Sorio's hosted checkout page — they connect their wallet and sign on-chain there,
            then land back on your site with the result.
          </p>

          <div className="mt-6 space-y-4 text-sm">

            {/* Step 1 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <p className="font-medium">Step 1 — Build the checkout URL</p>
              <p className="mt-2 text-[var(--muted)]">
                Take the <code>subscribe_url</code> from <code>POST /v1/plans</code> and append your <code>redirect_uri</code>:
              </p>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{`https://soriopay.com/subscribe/{plan_id}?redirect_uri=https://yourapp.com/callback`}</code></pre>
              <p className="mt-3 text-xs text-[var(--muted)]">
                <code>redirect_uri</code> must be an <code>http://</code> or <code>https://</code> URL.
                Any other scheme is rejected and no redirect will happen.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <p className="font-medium">Step 2 — Redirect your customer</p>
              <p className="mt-2 text-[var(--muted)]">
                Send your customer to that URL however you like — an anchor tag, a server redirect, a button.
                They'll land on a Sorio-hosted page that shows the plan name, amount, billing period, and fee breakdown.
                They connect their Solana wallet, optionally set a payment limit, then click Subscribe.
                The on-chain signing happens entirely on the Sorio page — you don't need to handle any wallet code.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <p className="font-medium">Step 3 — Receive the callback</p>
              <p className="mt-2 text-[var(--muted)]">
                After a successful subscription, Sorio redirects the customer back to your <code>redirect_uri</code>
                with three query parameters appended:
              </p>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{`https://yourapp.com/callback
  ?subscription=A7foa2Vk...   // on-chain subscription address
  &plan=E9Sc8p63...           // the plan ID
  &status=active`}</code></pre>
              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border)] text-xs">
                <div className="grid grid-cols-[auto_1fr] divide-y divide-[var(--border)]">
                  {[
                    ["subscription", "The on-chain subscription delegation address. Unique per customer per plan."],
                    ["plan", "The plan ID — same as the id returned by POST /v1/plans."],
                    ["status", "Always active at the time of redirect. The subscription is live on-chain."],
                  ].map(([param, desc]) => (
                    <div key={param} className="contents">
                      <div className="bg-[var(--background)] px-3 py-2 font-mono font-medium">{param}</div>
                      <div className="px-3 py-2 text-[var(--muted)]">{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                If the customer cancels or closes the tab, no redirect happens. Design your flow to handle
                cases where the customer never returns.
              </p>
            </div>

            {/* Step 4 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <p className="font-medium">Step 4 — Verify before provisioning</p>
              <p className="mt-2 text-[var(--muted)]">
                The callback parameters are informational — treat them as a hint, not proof.
                Before granting your customer access to anything, confirm the subscription is real
                by calling <code>GET /api/v1/subscriptions</code> from your server and finding the
                matching <code>id</code> with <code>status: "active"</code>.
              </p>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{`// On your server after receiving the callback:
const res = await fetch("https://soriopay.com/api/v1/subscriptions", {
  headers: { Authorization: "Bearer sk_live_..." },
});
const { data } = await res.json();
const sub = data.find(s => s.id === subscriptionFromCallback);
if (sub?.status === "active") {
  // safe to provision
}`}</code></pre>
            </div>

          </div>
        </section>

        <Link href="/" className="inline-flex mt-10 items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Back to home
          </Link>
      </div>
    </div>
  );
}

function Endpoint({ method, path, desc, body, example, response }: {
  method: string; path: string; desc: string; body?: string; example: string; response: string;
}) {
  const isWrite = method !== "GET";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${isWrite ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "bg-[var(--accent)]/10 text-[var(--accent)]"}`}>{method}</span>
        <code className="text-sm font-medium">{path}</code>
      </div>
      <p className="mt-2 text-[var(--muted)]">{desc}</p>
      {body && (
        <>
          <p className="mt-3 text-xs font-medium text-[var(--muted)]">Body</p>
          <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{body}</code></pre>
        </>
      )}
      <p className="mt-3 text-xs font-medium text-[var(--muted)]">Request</p>
      <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{example}</code></pre>
      <p className="mt-3 text-xs font-medium text-[var(--muted)]">Response</p>
      <pre className="mt-1 overflow-x-auto rounded bg-[var(--background)] px-3 py-2 text-xs"><code>{response}</code></pre>
    </div>
  );
}