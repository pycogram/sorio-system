"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./providers";

/* Reveal-on-scroll: adds .is-visible when the element enters the viewport. */
function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: any;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

export default function Home() {
  const { theme, toggle } = useTheme();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Atmospheric glow */}
      <div
        aria-hidden
        className="glow-drift pointer-events-none absolute inset-x-0 top-0 z-0 h-[600px]"
        style={{
          background:
            "radial-gradient(60% 80% at 50% 0%, color-mix(in srgb, var(--primary) 28%, transparent) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(70% 50% at 50% 0%, #000 0%, transparent 80%)",
        }}
      />

      {/* Woven-bars brand motif (echoes the logo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-20 z-0 hidden opacity-[0.07] lg:block"
        style={{ transform: "rotate(45deg)" }}
      >
        <svg width="520" height="520" viewBox="0 0 520 520" fill="none">
          {Array.from({ length: 7 }).map((_, row) =>
            Array.from({ length: 7 }).map((_, col) => {
              if ((row + col) % 2 === 1) return null;
              return (
                <rect
                  key={`${row}-${col}`}
                  x={col * 72}
                  y={row * 72}
                  width={54}
                  height={16}
                  rx={6}
                  fill="var(--primary)"
                />
              );
            })
          )}
        </svg>
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <Image src="/z-paylo-logo.png" alt="Paylo" width={30} height={30} className="rounded-lg" />
          <span className="text-lg font-semibold tracking-tight">Paylo</span>
        </div>
        <div className="flex items-center gap-3">
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
          <a href="/dashboard" className="rounded-lg bg-[var(--btn)] px-4 py-2 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)]">
            Launch app
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-8 pt-16 pb-24">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
          {/* Left: copy */}
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Live on Solana Mainnet
            </div>
            <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Approve once.<br />Paid on <span className="text-[var(--primary)]">repeat.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-[var(--muted)]">
              Recurring payments and payroll in USDC. Approve once on-chain, then let every
              cycle run itself - whether you're collecting or paying. Cancel anytime.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="/create" className="rounded-lg bg-[var(--btn)] px-6 py-3 font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)]">
                Create a plan
              </a>
              <a href="/dashboard" className="rounded-lg border border-[var(--border)] px-6 py-3 font-medium transition hover:border-[var(--foreground)]">
                Open dashboard
              </a>
            </div>
            <p className="mt-6 text-sm text-[var(--muted)]">
              Non-custodial · No cards · No banks
            </p>
          </Reveal>

          {/* Right: product mockup */}
          <Reveal delay={150} className="relative">
            <div
              aria-hidden
              className="absolute -inset-6 z-0 rounded-3xl opacity-60 blur-2xl"
              style={{ background: "color-mix(in srgb, var(--primary) 25%, transparent)" }}
            />
            <div className="relative z-10 rotate-[-1.5deg] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Pro Membership</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">
                $9.99<span className="text-base font-normal text-[var(--muted)]"> / month</span>
              </p>
              <div className="my-5 h-px bg-[var(--border)]" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted)]">Subscription</span><span>$9.80</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-[var(--muted)]">Service fee</span><span>$0.19</span>
              </div>
              <div className="my-3 h-px bg-[var(--border)]" />
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Total</span><span>$9.99</span>
              </div>
              <div className="mt-5 w-full rounded-lg bg-[var(--btn)] py-2.5 text-center text-sm font-medium text-[var(--btn-text)]">
                Subscribe
              </div>
              <p className="mt-3 text-center text-xs text-[var(--muted)]">Approve once · Cancel anytime</p>
            </div>
            {/* floating mini stat card */}
            <div className="absolute -bottom-6 -left-6 z-20 rotate-[2deg] rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4 shadow-xl">
              <p className="text-xs text-[var(--muted)]">Collected today</p>
              <p className="mt-1 text-xl font-semibold text-[var(--accent)]">+ $1,240.00</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Feature strip */}
      <section className="relative z-10 border-y border-[var(--border)] bg-[var(--subtle)]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-8 py-14 sm:grid-cols-3">
          <Reveal delay={0}><Feature title="Non-custodial" body="Funds move straight from payer to recipient on-chain. Paylo never holds your money." /></Reveal>
          <Reveal delay={100}><Feature title="You stay in control" body="The approved amount is a hard on-chain ceiling. Paylo can never take more, cancel anytime." /></Reveal>
          <Reveal delay={200}><Feature title="Approve once" body="No re-signing every cycle. One wallet approval authorizes the recurring payment. Done." /></Reveal>
        </div>
      </section>

      {/* Three products */}
      <section className="relative z-10 mx-auto max-w-6xl px-8 py-24">
        <Reveal>
          <h2 className="text-center text-4xl font-semibold tracking-tight">One engine. Three products.</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[var(--muted)]">
            The same recurring-payment rail, built for different jobs.
          </p>
        </Reveal>
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Reveal delay={0}><ProductCard name="Paylo Scribe" tag="Live" tagLive body="Subscriptions for merchants. Create plans, share a link, get paid automatically. Customers subscribe and cancel anytime." /></Reveal>
          <Reveal delay={100}><ProductCard name="Paylo Roll" tag="Live" tagLive body="Payroll on the same rail. Pay employees and contractors on a recurring schedule, in stablecoins, on-chain." /></Reveal>
          <Reveal delay={200}><ProductCard name="Paylo API" tag="Coming soon" body="Infrastructure for builders. Integrate Paylo's recurring-payment rail directly into your own product." /></Reveal>
        </div>
      </section>

      {/* Two sides, one flow */}
      <section className="relative z-10 border-t border-[var(--border)] bg-[var(--subtle)]">
        <div className="mx-auto max-w-6xl px-8 py-24">
          <Reveal>
            <h2 className="text-center text-4xl font-semibold tracking-tight">Two sides, one flow.</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[var(--muted)]">
              Every Paylo product connects two people: one sets the terms, the other approves once.
              After that, payment moves on its own each cycle.
            </p>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal delay={0}>
              <RelationshipFlow
                label="Subscriptions"
                left="Merchant"
                leftSub="Creates a plan"
                right="Customer"
                rightSub="Subscribes once"
                topLabel="Shares plan link"
                flowLabel="Pays each cycle"
                flowDir="rightToLeft"
                footnote="Customer approves once on-chain, then pays automatically. Cancels anytime."
              />
            </Reveal>
            <Reveal delay={150}>
              <RelationshipFlow
                label="Payroll"
                left="Employer"
                leftSub="Sets up payroll"
                right="Employee"
                rightSub="Approves once"
                topLabel="Adds employee"
                flowLabel="Paid each cycle"
                flowDir="leftToRight"
                footnote="Employer authorizes once on-chain, then salary pays out automatically each period."
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* AI agents */}
      <section className="relative z-10 overflow-hidden border-t border-[var(--border)]">
        {/* accent glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-50"
          style={{
            background:
              "radial-gradient(50% 70% at 80% 50%, color-mix(in srgb, var(--primary) 18%, transparent) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-6xl px-8 py-24">
          <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
            {/* Left: visual */}
            <Reveal className="relative order-2 lg:order-1">
              <div
                aria-hidden
                className="absolute -inset-6 z-0 rounded-3xl opacity-50 blur-2xl"
                style={{ background: "color-mix(in srgb, var(--primary) 22%, transparent)" }}
              />
              <div className="relative z-10 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-7 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: "color-mix(in srgb, var(--primary) 16%, transparent)" }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
                      <line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold">Agent wallet</p>
                    <p className="text-xs text-[var(--muted)]">Authorized · bounded</p>
                  </div>
                </div>
                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Monthly budget</span>
                    <span className="font-medium">$50.00 max</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div className="h-full rounded-full" style={{ width: "36%", background: "var(--primary)" }} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Spent this cycle</span>
                    <span className="font-medium">$18.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Hard ceiling</span>
                    <span className="font-medium text-[var(--accent)]">Cannot exceed</span>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Right: copy */}
            <Reveal delay={150} className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                For AI agents
              </div>
              <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-tight">
                Give your AI agent<br />a wallet it can&apos;t abuse.
              </h2>
              <p className="mt-5 max-w-md text-[var(--muted)]">
                Paylo&apos;s delegation model is built for autonomous payments. Authorize an agent to pay
                for subscriptions, APIs, or services on a recurring basis within a hard, on-chain
                spending limit it can never exceed. Revoke anytime.
              </p>
              <div className="mt-8 space-y-3">
                <TrustRow text="Set a budget the agent physically cannot overspend" />
                <TrustRow text="Recurring, autonomous payments, no human in the loop each cycle" />
                <TrustRow text="Full transparency: every payment is on-chain and revocable" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 border-t border-[var(--border)] bg-[var(--subtle)]">
        <div className="mx-auto max-w-6xl px-8 py-24">
          <Reveal>
            <h2 className="text-center text-4xl font-semibold tracking-tight">How it works</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[var(--muted)]">
              From zero to recurring revenue in three steps.
            </p>
          </Reveal>

          <div className="relative mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* connecting line (desktop) */}
            <div
              aria-hidden
              className="absolute left-0 right-0 top-7 hidden h-px md:block"
              style={{ background: "linear-gradient(90deg, transparent, var(--border), var(--border), transparent)" }}
            />
            <Reveal delay={0}><StepCard n="1" title="1. Create" body="Connect your wallet and set your plan: amount, billing period, and where payments land. Get a shareable link." /></Reveal>
            <Reveal delay={100}><StepCard n="2" title="2. Subscribe" body="Your customer opens the link and approves once. They see exactly what they'll pay, broken down, before signing." /></Reveal>
            <Reveal delay={200}><StepCard n="3" title="3. Collect" body="Payments are pulled automatically each cycle, straight to you, on-chain, with no manual invoicing." /></Reveal>
          </div>

          <Reveal delay={250} className="mt-16 text-center">
            <a href="/create" className="rounded-lg bg-[var(--btn)] px-7 py-3 font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)]">
              Get started
            </a>
          </Reveal>
        </div>
      </section>

      {/* Gallery */}
      <section className="relative z-10 border-t border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-8 py-24">
          <Reveal>
            <h2 className="text-center text-4xl font-semibold tracking-tight">See Paylo in action</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[var(--muted)]">
              From creating a plan to autonomous agent payments.
            </p>
          </Reveal>
          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Reveal delay={0}><GalleryItem src="/image1.png" caption="Create a plan and share a link" /></Reveal>
            <Reveal delay={100}><GalleryItem src="/image2.png" caption="Approve once, on-chain" /></Reveal>
            <Reveal delay={150}><GalleryItem src="/image3.png" caption="Collected automatically every cycle" /></Reveal>
            <Reveal delay={200}><GalleryItem src="/image4.png" caption="Give an AI agent a bounded budget" /></Reveal>
          </div>
        </div>
      </section>

      {/* Trust band */}
      <section className="relative z-10 border-t border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-8 py-20">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <h2 className="text-4xl font-semibold tracking-tight">
                Secured on-chain.<br />Trustless by design.
              </h2>
              <p className="mt-5 max-w-md text-[var(--muted)]">
                Every payment is authorized by the customer's own wallet and enforced by Solana's
                audited Subscriptions Delegation Program. Paylo can never pull more than approved,
                and funds never touch our hands.
              </p>
              <div className="mt-8 space-y-3">
                <TrustRow text="Customer-signed, on-chain authorization" />
                <TrustRow text="Hard spending ceiling enforced by the program" />
                <TrustRow text="Cancel anytime and it revokes instantly on-chain" />
              </div>
            </Reveal>

            {/* Visual: a "verified payment" card built from UI */}
            <Reveal delay={150} className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 z-0 rounded-3xl opacity-50 blur-2xl"
                style={{ background: "color-mix(in srgb, var(--accent) 20%, transparent)" }}
              />
              <div className="relative z-10 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-7 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-full"
                    style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)" }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold">Payment authorized</p>
                    <p className="text-xs text-[var(--muted)]">Signed on Solana · mainnet</p>
                  </div>
                </div>
                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--muted)]">Amount</span><span className="font-medium">$9.99 / month</span></div>
                  <div className="flex justify-between"><span className="text-[var(--muted)]">Ceiling</span><span className="font-medium">$9.99 (max)</span></div>
                  <div className="flex justify-between"><span className="text-[var(--muted)]">Custody</span><span className="font-medium text-[var(--accent)]">Non-custodial</span></div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--border)] bg-[var(--subtle)]">
        <div className="mx-auto max-w-6xl px-8 py-16">
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:grid-cols-5">
            {/* Brand column */}
            <div className="col-span-2">
              <div className="flex items-center gap-2">
                <Image src="/z-paylo-logo.png" alt="Paylo" width={28} height={28} className="rounded-lg" />
                <span className="text-lg font-semibold tracking-tight">Paylo</span>
              </div>
              <p className="mt-4 max-w-xs text-sm text-[var(--muted)]">
                Recurring payments and payroll on Solana. Approve once, get paid on repeat.
                Non-custodial by design.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                Live on Solana Mainnet
              </div>
            </div>

            {/* Products */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Products</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><a href="/plans" className="text-[var(--muted)] transition hover:text-[var(--foreground)]">Paylo Scribe</a></li>
                <li><a href="/payroll" className="text-[var(--muted)] transition hover:text-[var(--foreground)]">Paylo Roll</a></li>
                <li><span className="text-[var(--muted)] opacity-60">Paylo API</span> <span className="ml-1 text-[10px] text-[var(--muted)]">soon</span></li>
              </ul>
            </div>

            {/* App */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">App</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><a href="/dashboard" className="text-[var(--muted)] transition hover:text-[var(--foreground)]">Dashboard</a></li>
                <li><a href="/create" className="text-[var(--muted)] transition hover:text-[var(--foreground)]">Create a plan</a></li>
                <li><a href="/subscriptions" className="text-[var(--muted)] transition hover:text-[var(--foreground)]">Subscriptions</a></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Resources</p>
              <ul className="mt-4 space-y-3 text-sm">
                <li><a href="https://github.com/pycogram/paylo-system" target="_blank" rel="noreferrer" className="text-[var(--muted)] transition hover:text-[var(--foreground)]">GitHub</a></li>
                <li><a href="https://solana.com" target="_blank" rel="noreferrer" className="text-[var(--muted)] transition hover:text-[var(--foreground)]">Solana</a></li>
                <li><span className="text-[var(--muted)] opacity-60">Docs</span> <span className="ml-1 text-[10px] text-[var(--muted)]">soon</span></li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[var(--border)] pt-8 text-sm text-[var(--muted)] sm:flex-row">
            <p>© {new Date().getFullYear()} Paylo. All rights reserved.</p>
            <p>Built on the Solana Foundation Subscriptions Delegation Program</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="mb-3 h-1 w-8 rounded-full bg-[var(--primary)]" />
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{body}</p>
    </div>
  );
}

function RelationshipFlow({
  label,
  left,
  leftSub,
  right,
  rightSub,
  topLabel,
  flowLabel,
  flowDir,
  footnote,
}: {
  label: string;
  left: string;
  leftSub: string;
  right: string;
  rightSub: string;
  topLabel: string;
  flowLabel: string;
  flowDir: "leftToRight" | "rightToLeft";
  footnote: string;
}) {
  const flowRTL = flowDir === "rightToLeft";
  return (
    <div className="hover-lift rounded-2xl border border-[var(--border)] bg-[var(--card)] p-7 hover:border-[var(--primary)] hover:shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>

      <svg viewBox="0 0 460 200" className="mt-5 w-full" role="img" aria-label={`${left} and ${right} payment flow`}>
        <defs>
          <marker id={`arr-p-${label}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <marker id={`arr-a-${label}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        {/* Left node */}
        <rect x="10" y="70" width="150" height="64" rx="14" fill="color-mix(in srgb, var(--primary) 12%, var(--card))" stroke="var(--primary)" strokeWidth="1" />
        <text x="85" y="96" textAnchor="middle" fill="var(--foreground)" fontSize="15" fontWeight="600">{left}</text>
        <text x="85" y="116" textAnchor="middle" fill="var(--muted)" fontSize="12">{leftSub}</text>

        {/* Right node */}
        <rect x="300" y="70" width="150" height="64" rx="14" fill="color-mix(in srgb, var(--accent) 12%, var(--card))" stroke="var(--accent)" strokeWidth="1" />
        <text x="375" y="96" textAnchor="middle" fill="var(--foreground)" fontSize="15" fontWeight="600">{right}</text>
        <text x="375" y="116" textAnchor="middle" fill="var(--muted)" fontSize="12">{rightSub}</text>

        {/* Top arrow: setup (left -> right), static */}
        <text x="230" y="48" textAnchor="middle" fill="var(--muted)" fontSize="12">{topLabel}</text>
        <line x1="162" y1="84" x2="298" y2="84" stroke="var(--primary)" strokeWidth="1.5" markerEnd={`url(#arr-p-${label})`} />

        {/* Bottom arrow: payment flow (animated dashes in the pay direction) */}
        <text x="230" y="164" textAnchor="middle" fill="var(--muted)" fontSize="12">{flowLabel}</text>
        {flowRTL ? (
          <line className="flow-line" x1="298" y1="120" x2="162" y2="120" stroke="var(--accent)" strokeWidth="1.5" markerEnd={`url(#arr-a-${label})`} />
        ) : (
          <line className="flow-line" x1="162" y1="120" x2="298" y2="120" stroke="var(--accent)" strokeWidth="1.5" markerEnd={`url(#arr-a-${label})`} />
        )}
      </svg>

      <p className="mt-4 text-sm text-[var(--muted)]">{footnote}</p>
    </div>
  );
}

function ProductCard({ name, tag, body, tagLive }: { name: string; tag: string; body: string; tagLive?: boolean }) {
  return (
    <div className="hover-lift group h-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-7 hover:border-[var(--primary)] hover:shadow-xl">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">{name}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tagLive ? "bg-[var(--accent)] text-black" : "border border-[var(--border)] text-[var(--muted)]"}`}>
          {tag}
        </span>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">{body}</p>
    </div>
  );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="hover-lift relative z-10 h-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-7 py-4 hover:border-[var(--primary)] hover:shadow-xl">
      <p className="mt-5 text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{body}</p>
    </div>
  );
}

function TrustRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span className="text-sm">{text}</span>
    </div>
  );
}

function GalleryItem({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="hover-lift group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:shadow-xl">
      <div className="overflow-hidden">
        <Image
          src={src}
          alt={caption}
          width={1536}
          height={1024}
          className="w-full transition duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <figcaption className="px-5 py-4 text-sm text-[var(--muted)]">{caption}</figcaption>
    </figure>
  );
}