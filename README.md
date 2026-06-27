# $Sorio

Contract Address:
```bash
A6VcXrUUYjNiR8RkHCRNu8zuxWUMnhMWoX11j6Bapump
```

## Sorio

Recurring payments on Solana, built on the Solana Foundation's native
Subscriptions Delegation Program. One engine, three products: **Sorio Scribe**
(subscriptions — a merchant bills customers), **Sorio Roll** (payroll — an
employer pays employees), and **Sorio API** (programmatic access for builders).
Set terms once and payments collect or pay out automatically each cycle —
non-custodial, low fees, near-instant settlement, and works for anyone with a
Solana wallet.

## Status

**Live on Solana mainnet.** All products work end-to-end with real USDC: create
a plan/payroll → authorize on-chain (one wallet approval) → automated
collection/payout by a scheduled worker → recorded history. The app is a
polished multi-page dashboard with shared data caching and a dedicated RPC, plus
an admin dashboard, a referral/bonus program with automated payouts, and a
public read API.

## Architecture

A pnpm monorepo:

- `packages/solana` — the recurring-payments engine. Reusable functions
  (`createPlan`, `makeClient`, `subscribe`, `collectPayment`, `ensureMerchantAta`,
  `sendUsdc`) wrapping the Subscriptions Delegation Program via
  `@solana/subscriptions` + `@solana/kit`. Accepts a custom RPC URL so web and
  worker can route through a dedicated endpoint.
- `apps/workers` — Cloudflare Worker. An hourly cron that finds due
  subscriptions and payrolls, collects/pays on-chain, confirms each transaction
  landed, records history, advances each schedule, and auto-pauses items after
  repeated failures.
- `apps/web` — Next.js frontend. Merchant/employer dashboards, customer subscribe
  pages, the employee paycheck view, the referral/bonus page, an admin
  dashboard, and the developer/API page. Also hosts the public API routes
  (`/api/v1/...`).

## Products

1. **Sorio Scribe** — merchant → customer recurring billing. Create plans, share
   a subscribe link, get paid automatically each cycle.
2. **Sorio Roll** — employer → employee payroll on the same rail. Add employees,
   approve each on-chain, pay salaries automatically on a daily/weekly/monthly
   schedule.
3. **Sorio API** — programmatic, read access for builders. Generate API keys and
   query your plans and subscriptions from your own server. See
   [soriopay.com/developers](https://soriopay.com/developers).

All run on the same engine; role assignment and UI differ.

## The $SORIO token

$SORIO is the platform's utility token. It does **not** replace USDC as the
payment medium (payments are always in USDC for price stability); instead it
gives holders real utility:

- **Fee discount.** The standard platform fee is 2%. Wallets holding at least
  20,000 $SORIO pay a reduced **0.5%** fee on their payments.
- **Referral eligibility.** Inviters must hold 20,000 $SORIO to receive referral
  payouts (see below).

## Referrals & bonus

Share an invite link (`/?invite=<code>`). When someone you invited pays through
Sorio, you accrue **0.4%** of each of their payments. Earnings accrue
continuously; once you've earned at least $1 and hold 20,000 $SORIO, you can
request a payout. Payouts are sent in USDC from a dedicated bonus wallet on admin
approval, confirmed on-chain before any balance is reset. Manage it from the
Bonus page.

## App structure

The dashboard is organized into dedicated pages: Overview, Plans, Subscriptions,
Payroll, Paychecks, History (a unified timeline of all money in and out), and
Bonus. A separate Developers page handles API keys and reference docs, and a
wallet-gated Admin dashboard surfaces on-chain money metrics and management
actions. Data is cached with SWR for instant navigation, and the RPC is routed
through a dedicated provider for reliability.

## How it works

Payments are authorized by the payer's own wallet and enforced on-chain by the
Subscriptions Delegation Program. The approved amount is a hard ceiling — Sorio
can never pull more than authorized, funds never touch Sorio's custody, and the
payer can cancel (revoke) anytime, which takes effect immediately on-chain. The
platform fee is collected on each payment (2% standard, 0.5% for $SORIO holders),
and fee handling stays non-custodial.

## API

A public, read-only API lets builders query their own data.

- **Base URL:** `https://soriopay.com/api/v1`
- **Auth:** `Authorization: Bearer sk_live_...` (generate keys at
  [/developers](https://soriopay.com/developers))
- **Endpoints:** `GET /v1/plans`, `GET /v1/subscriptions`

Keys are hashed at rest (only a SHA-256 hash and a short prefix are stored; the
raw key is shown once at creation), scoped to the owning wallet's data, and can
be revoked at any time.

## Tech

TypeScript · Solana (`@solana/kit`, `@solana/subscriptions`) · Cloudflare
Workers · Supabase (Postgres) · Next.js · SWR · pnpm workspaces

## Development

Requires Node, pnpm, and the Solana CLI. Configure environment variables for the
web app (`apps/web/.env.local`) and worker (`apps/workers/.dev.vars`) with your
Supabase credentials, platform keys, and Solana RPC URL. Secrets (`.env*`,
`.dev.vars`, `.keys/`) are gitignored and must never be committed.

Run the web app:

```bash
cd apps/web && npx next dev
```

Run the collection worker locally (test the cron):

```bash
cd apps/workers && npx wrangler dev --test-scheduled
# then trigger it:
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```