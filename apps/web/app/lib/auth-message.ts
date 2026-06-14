// Single source of truth for the canonical message that gets signed (client)
// and verified (server). Both sides MUST build the exact same string, so this
// lives in one file imported by both. Any change here must stay in lock-step.

export type AuthParams = Record<string, string | number | boolean | null | undefined>;

// Build a deterministic message string. Params are sorted by key so the order
// the caller passes them in never matters — both sides produce identical text.
export function buildAuthMessage(
  action: string,
  wallet: string,
  params: AuthParams,
  timestamp: number
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramPairs = sortedKeys
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");

  return [
    "Sorio authorization",
    `action: ${action}`,
    `wallet: ${wallet}`,
    `params: ${paramPairs}`,
    `timestamp: ${timestamp}`,
  ].join("\n");
}

// How long a signed request stays valid (replay window).
export const AUTH_MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes