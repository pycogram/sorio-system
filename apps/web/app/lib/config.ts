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