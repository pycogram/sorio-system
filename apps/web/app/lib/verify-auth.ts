import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildAuthMessage, AUTH_MAX_AGE_MS, type AuthParams } from "./auth-message";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

// Verify that `wallet` really signed an authorization for this exact action +
// params, and that the request is fresh (within the replay window).
//
// Throws AuthError (status 401) on any failure. On success, returns the
// verified wallet address — callers should use THIS, not a wallet value taken
// from elsewhere in the body.
export function verifyAuth(input: {
  action: string;
  wallet?: unknown;
  timestamp?: unknown;
  signature?: unknown;
  params: AuthParams;
}): string {
  const { action, wallet, timestamp, signature, params } = input;

  if (typeof wallet !== "string" || !wallet) {
    throw new AuthError("Missing wallet");
  }
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    throw new AuthError("Missing or invalid timestamp");
  }
  if (typeof signature !== "string" || !signature) {
    throw new AuthError("Missing signature");
  }

  // Freshness: reject stale or future-dated requests (replay protection).
  const age = Date.now() - timestamp;
  if (age > AUTH_MAX_AGE_MS || age < -AUTH_MAX_AGE_MS) {
    throw new AuthError("Request expired — please try again");
  }

  // Rebuild the exact message the client should have signed.
  const message = buildAuthMessage(action, wallet, params, timestamp);
  const messageBytes = new TextEncoder().encode(message);

  let sigBytes: Uint8Array;
  let pubkeyBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(signature);
    pubkeyBytes = bs58.decode(wallet);
  } catch {
    throw new AuthError("Malformed signature or wallet");
  }

  if (pubkeyBytes.length !== 32 || sigBytes.length !== 64) {
    throw new AuthError("Invalid signature or wallet length");
  }

  const ok = nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
  if (!ok) {
    throw new AuthError("Signature verification failed");
  }

  return wallet;
}