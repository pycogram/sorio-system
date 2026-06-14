# Solio

Recurring payments on Solana, built on the Solana Foundation's native
Subscriptions Delegation Program. One engine, two products: **Solio Scribe**
(subscriptions — a merchant bills customers) and **Solio Roll** (payroll — an
employer pays employees). Set terms once and payments collect or pay out
automatically each cycle — non-custodial, low fees, near-instant settlement,
and works for anyone with a Solana wallet. A third product, **Solio API**
(programmatic access for builders), is planned.

## Status

Both products work end-to-end on **devnet**: create plan/payroll → authorize
on-chain (one wallet approval) → automated collection/payout by a scheduled
worker. The app is a polished multi-page dashboard with shared data caching and
a dedicated RPC. Not yet on mainnet; deployment and production hardening are the
next milestones.

## Architecture

A pnpm monorepo:

- `packages/solana` — the recurring-payments engine. Reusable functions
  (`createPlan`, `makeClient`, `subscribe`, `collectPayment`, `ensureMerchantAta`)
  wrapping the Subscriptions Delegation Program via `@solana/subscriptions` +
  `@solana/kit`. Accepts a custom RPC URL so web and worker can route through a
  dedicated endpoint.
- `apps/workers` — Cloudflare Worker. A cron that finds due subscriptions and
  payrolls, collects/pays on-chain (fee split handled non-custodially via two
  direct transfers), records history, and advances each schedule.
- `apps/web` — Next.js frontend. Merchant/employer dashboards, customer subscribe
  pages, and the employee paycheck view.

## Products

1. **Paylo Scribe** — merchant → customer recurring billing. Create plans, share
   a subscribe link, get paid automatically each cycle.
2. **Paylo Roll** — employer → employee payroll on the same rail. Add employees,
   approve each on-chain, pay salaries automatically on a daily/weekly/monthly
   schedule.
3. **Paylo API** — programmatic access for builders (planned).

All run on the same engine; role assignment and UI differ.

## App structure

The dashboard is organized into dedicated pages: Overview, Plans, Subscriptions,
Payroll, Paychecks, and History (a unified timeline of all money in and out).
Data is cached with SWR for instant navigation, and the RPC is routed through a
dedicated provider for reliability.

## How it works

Payments are authorized by the payer's own wallet and enforced on-chain by the
Subscriptions Delegation Program. The approved amount is a hard ceiling — Paylo
can never pull more than authorized, funds never touch Paylo's custody, and the
payer can cancel (revoke) anytime, which takes effect immediately on-chain. A
small platform fee is collected as a separate direct transfer, so fee splitting
stays non-custodial.

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