import { verifyAuth, AuthError } from "../../lib/verify-auth";
import type { AuthParams } from "../../lib/auth-message";

// Admin gate: verify the request is signed by the ADMIN_WALLET. Reuses the same
// ed25519 signature verification + replay protection as the rest of the app,
// then adds the one extra check that the signer IS the configured admin.
//
// Safe on a public repo: the security is the private key behind ADMIN_WALLET,
// not the secrecy of this code. Only the admin's wallet can produce a valid
// signature for the admin address.
export function verifyAdmin(input: {
  action: string;
  wallet?: unknown;
  timestamp?: unknown;
  signature?: unknown;
  params: AuthParams;
}): string {
  const verifiedWallet = verifyAuth(input);

  const admin = process.env.ADMIN_WALLET;
  if (!admin) {
    // Misconfiguration — fail closed.
    throw new AuthError("Admin not configured", 500);
  }
  if (verifiedWallet !== admin) {
    throw new AuthError("Not authorized", 403);
  }
  return verifiedWallet;
}