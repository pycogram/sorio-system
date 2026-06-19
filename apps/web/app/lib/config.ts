// Central network config for the web app — the ONE place to flip devnet <-> mainnet.
//
// Set NEXT_PUBLIC_SOLANA_NETWORK to "devnet" or "mainnet" in your env.
// Defaults to "mainnet". USDC mint, RPC fallback, and explorer links follow.

export type SolanaNetwork = "devnet" | "mainnet";

export const NETWORK: SolanaNetwork =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as SolanaNetwork) ?? "mainnet";

const CONFIG = {
  devnet: {
    usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    rpcFallback: "https://api.devnet.solana.com",
    explorerCluster: "devnet",
  },
  mainnet: {
    usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    rpcFallback: "https://api.mainnet-beta.solana.com",
    explorerCluster: "mainnet-beta",
  },
} as const;

export const USDC_MINT_ADDRESS = CONFIG[NETWORK].usdcMint;
export const RPC_FALLBACK = CONFIG[NETWORK].rpcFallback;
export const NETWORK_LABEL = NETWORK;

// Program ID is the SAME on devnet and mainnet.
export const SUBSCRIPTIONS_PROGRAM_ID =
  "De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44";

// Resolved RPC URL: explicit env var wins, else the network's public fallback.
export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  process.env.SOLANA_RPC_URL ??
  RPC_FALLBACK;

// Explorer tx link, correct for the active network.
export function explorerTx(sig: string): string {
  const q = NETWORK === "mainnet" ? "" : `?cluster=${CONFIG[NETWORK].explorerCluster}`;
  return `https://explorer.solana.com/tx/${sig}${q}`;
}

// ===== $SORIO token — holder fee-discount config =====
// $SORIO is a Token-2022 mint (different program than classic SPL / USDC).
export const SORIO_MINT_ADDRESS =
  process.env.NEXT_PUBLIC_SORIO_MINT ??
  "A6VcXrUUYjNiR8RkHCRNu8zuxWUMnhMWoX11j6Bapump";

// Token-2022 program (NOT the classic token program USDC uses).
export const TOKEN_2022_PROGRAM =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// $SORIO has 6 decimals (confirmed on Solscan).
export const SORIO_DECIMALS = 6;

// Minimum $SORIO an employer must hold for the discounted fee (in base units).
// 20,000 tokens × 10^6. Override with SORIO_FEE_DISCOUNT_THRESHOLD (token count).
export const SORIO_FEE_DISCOUNT_THRESHOLD =
  BigInt(process.env.SORIO_FEE_DISCOUNT_THRESHOLD ?? "20000") *
  BigInt(10) ** BigInt(SORIO_DECIMALS);

// Fee rates (percent): holders pay less.
export const FEE_PERCENT_STANDARD = 2;
export const FEE_PERCENT_HOLDER = 0.5;