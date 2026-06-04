# Paylo

Recurring payments on Solana, built on the Solana Foundation's native
Subscriptions Delegation Program. One engine, two products: **subscriptions**
(merchant bills customers) and **payroll** (a payer pays recipients). Set terms
once, payments collect or pay out automatically each cycle — no intermediary,
low fees, near-instant settlement, and works for anyone with a Solana wallet.

## Status

Core on-chain engine proven end-to-end on devnet (create plan → authorize →
automated collection). Backend collection worker and database wired.
Subscriptions product is the first build; payroll follows on the same engine.
Frontend in progress.

## Architecture

A pnpm monorepo:

- `packages/solana` — the recurring-payments engine. Reusable functions
  (`createPlan`, `initAuthority`, `subscribe`, `collectPayment`) wrapping the
  Subscriptions Delegation Program via `@solana/subscriptions` + `@solana/kit`.
- `packages/db` — typed Supabase client and table types.
- `apps/workers` — Cloudflare Worker. Hourly cron that finds due subscriptions,
  collects payment, records billing history, and advances the schedule.
- `apps/web` — Next.js frontend (merchant dashboard + customer subscribe pages).

## Products

1. **Subscriptions** — merchant → customer recurring billing (in progress).
2. **Payroll** — payer → payee, fixed salary or variable (capped) pay (planned).

Both run on the same engine; only role assignment and UI differ.

## Tech

TypeScript · Solana (`@solana/kit`, `@solana/subscriptions`) · Cloudflare
Workers · Supabase (Postgres) · Next.js · pnpm workspaces

## Development

Requires Node, pnpm, and the Solana CLI. Copy `.env.example` to `.env` and fill
in Supabase credentials. Secrets (`.env`, `.dev.vars`, `.keys/`) are gitignored
and must never be committed.