"use client";
import bs58 from "bs58";
import { getProvider } from "../providers";
import { buildAuthMessage, type AuthParams } from "./auth-message";

// Ask the connected wallet to sign a canonical message proving it authorizes
// this specific action. Returns the fields to include in the request body.
//
// Usage:
//   const auth = await signRequest("payroll-hide", { payrollId, hidden });
//   fetch(..., { body: JSON.stringify({ ...auth, payrollId, hidden }) });
export async function signRequest(
  action: string,
  params: AuthParams
): Promise<{ wallet: string; timestamp: number; signature: string }> {
  const provider = getProvider();
  if (!provider?.publicKey) throw new Error("Wallet not connected");

  const wallet = provider.publicKey.toString();
  const timestamp = Date.now();
  const message = buildAuthMessage(action, wallet, params, timestamp);

  // Both Phantom and Solflare implement signMessage(Uint8Array) -> { signature }.
  const encoded = new TextEncoder().encode(message);
  let signatureBytes: Uint8Array;
  try {
    const res = await provider.signMessage(encoded);
    // Providers return { signature: Uint8Array } (or the bytes directly).
    signatureBytes = (res?.signature ?? res) as Uint8Array;
  } catch (err: any) {
    if (err?.code === 4001 || /reject/i.test(err?.message ?? "")) {
      throw new Error("USER_CANCELLED");
    }
    throw err;
  }

  return {
    wallet,
    timestamp,
    signature: bs58.encode(signatureBytes),
  };
}