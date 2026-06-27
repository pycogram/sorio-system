"use client";
import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Back to home
        </Link>

        {/* Title */}
        <h1 className="mt-8 text-4xl font-semibold tracking-tight">Docs</h1>
        <p className="mt-3 text-lg text-[var(--muted)]">
          How Sorio works - recurring payments and payroll on Solana, where the payer approves once and keeps control.
        </p>

        {/* On this page */}
        <nav className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">On this page</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <li><a href="#how-it-works" className="text-[var(--primary)] hover:underline">How it works</a></li>
            <li><a href="#merchants" className="text-[var(--primary)] hover:underline">For merchants (Scribe)</a></li>
            <li><a href="#customers" className="text-[var(--primary)] hover:underline">For customers</a></li>
            <li><a href="#payroll" className="text-[var(--primary)] hover:underline">Payroll (Roll)</a></li>
            <li><a href="#safety" className="text-[var(--primary)] hover:underline">Safety &amp; control</a></li>
            <li><a href="#faq" className="text-[var(--primary)] hover:underline">FAQ</a></li>
          </ul>
        </nav>

        {/* How it works */}
        <Section id="how-it-works" title="How it works">
          <p>
            Sorio lets one person set the terms of a recurring payment and another approve it a single time.
            After that one approval, payments are collected automatically on the schedule - without the payer
            needing to sign again each cycle.
          </p>
          <Steps
            steps={[
              ["Create a plan", "A merchant (or employer) sets the amount, token, and billing period, then gets a shareable link."],
              ["Approve once", "The payer opens the link, connects their wallet, and approves the recurring payment one time on-chain."],
              ["Collected automatically", "On each cycle, the approved amount is collected automatically. The payer doesn't sign again."],
              ["Stay in control", "The payer can cancel at any time, and no payment can ever exceed the amount they approved."],
            ]}
          />
          <p>
            Sorio is built on the Solana Foundation&apos;s Subscriptions Delegation Program - the on-chain
            program that enforces these rules. Funds move directly from the payer to the recipient; Sorio
            never takes custody of your money.
          </p>
        </Section>

        {/* Merchants */}
        <Section id="merchants" title="For merchants - Sorio Scribe">
          <p>Sorio Scribe is for accepting recurring payments, like subscriptions.</p>
          <ul className="ml-5 list-disc space-y-2">
            <li><strong>Create a plan</strong> with a name, price, token, and billing period (for example $9.99 every month).</li>
            <li><strong>Share the link</strong> with your customers. Anyone with the link can subscribe.</li>
            <li><strong>Track subscribers</strong> from your dashboard - who&apos;s subscribed, how much you&apos;ve received, and how many payments each has made.</li>
            <li><strong>Payments arrive automatically</strong> each cycle, straight to your wallet.</li>
          </ul>
          <Callout>
            A small platform fee of 2% is added on top of your price. Your customer pays the total; you receive
            your full set amount.
          </Callout>
        </Section>

        {/* Customers */}
        <Section id="customers" title="For customers">
          <p>When you subscribe to a plan, you stay in control the whole time.</p>
          <ul className="ml-5 list-disc space-y-2">
            <li><strong>Approve once.</strong> You authorize the recurring payment a single time from your wallet.</li>
            <li><strong>A hard ceiling.</strong> The amount you approve is enforced on-chain - no one can ever collect more than that per cycle.</li>
            <li><strong>Non-custodial.</strong> Your funds stay in your wallet until each payment is collected. Sorio never holds them.</li>
            <li><strong>Cancel anytime.</strong> You can revoke the authorization whenever you want, ending future payments.</li>
          </ul>
        </Section>

        {/* Payroll */}
        <Section id="payroll" title="Payroll - Sorio Roll">
          <p>Sorio Roll runs payroll on the same rail. An employer pays employees or contractors on a recurring schedule.</p>
          <ul className="ml-5 list-disc space-y-2">
            <li><strong>Create a payroll</strong> and add employees with their wallet and salary.</li>
            <li><strong>Choose when payments start</strong> for the payroll - either pay immediately when you approve each person, or schedule a start date.</li>
            <li><strong>Approve each employee</strong> - this authorizes their recurring salary on-chain.</li>
            <li><strong>Salaries pay out automatically</strong> each cycle from your wallet.</li>
          </ul>
          <Callout>
            The 2% platform fee on payroll is paid by the employer, on top of each salary.
          </Callout>
        </Section>

        {/* Safety */}
        <Section id="safety" title="Safety &amp; control">
          <ul className="ml-5 list-disc space-y-2">
            <li><strong>Non-custodial.</strong> Funds move directly from payer to recipient on-chain. Sorio never holds your money.</li>
            <li><strong>A hard on-chain limit.</strong> The approved amount is a ceiling enforced by the on-chain program. No more than that can be collected per cycle.</li>
            <li><strong>Cancel anytime.</strong> Authorizations can be revoked at any point, stopping future payments.</li>
            <li><strong>Built on an established program.</strong> Sorio uses the Solana Foundation&apos;s Subscriptions Delegation Program for the on-chain authorization and collection logic.</li>
          </ul>
        </Section>

        {/* FAQ */}
        <Section id="faq" title="FAQ">
          <Faq q="What blockchain does Sorio use?" a="Solana. Payments settle on-chain on Solana mainnet." />
          <Faq q="What token are payments in?" a="Payments are made in USDC, a stablecoin on Solana." />
          <Faq q="Which wallets are supported?" a="Phantom and Solflare." />
          <Faq q="What does it cost?" a="A 2% platform fee. For subscriptions it's added on top of the merchant's price; for payroll the employer pays it on top of each salary." />
          <Faq q="Can a payment ever take more than I approved?" a="No. The amount you approve is a hard ceiling enforced on-chain. No payment can exceed it per cycle." />
          <Faq q="Can I cancel?" a="Yes. You can revoke the authorization at any time, which ends future payments." />
          <Faq q="Does Sorio hold my funds?" a="No. Sorio is non-custodial - funds stay in your wallet and move directly to the recipient when each payment is collected." />
        </Section>


        <Link href="/" className="inline-flex mt-6 items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Back to home
        </Link>


      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-20">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-[var(--foreground)]/90">{children}</div>
    </section>
  );
}

function Steps({ steps }: { steps: [string, string][] }) {
  return (
    <ol className="space-y-3">
      {steps.map(([t, d], i) => (
        <li key={i} className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">
            {i + 1}
          </span>
          <div>
            <p className="font-medium">{t}</p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">{d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4 text-sm">
      {children}
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-b border-[var(--border)] py-4 last:border-0">
      <p className="font-medium">{q}</p>
      <p className="mt-1.5 text-sm text-[var(--muted)]">{a}</p>
    </div>
  );
}