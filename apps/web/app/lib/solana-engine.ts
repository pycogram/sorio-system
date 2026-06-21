import {
  createClient,
  createKeyPairSignerFromBytes,
  type Address,
  type TransactionSigner,
  createSolanaRpc,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,

} from "@solana/kit";

import { signer } from "@solana/kit-plugin-signer";
import { solanaMainnetRpc } from "@solana/kit-plugin-rpc";
import { getCreateAssociatedTokenIdempotentInstructionAsync } from "@solana-program/token";

import {
  subscriptionsProgram,
  findPlanPda,
  findSubscriptionAuthorityPda,
  findSubscriptionDelegationPda,
  fetchPlan,
  fetchSubscriptionAuthority,
} from "@solana/subscriptions";
import { findAssociatedTokenPda } from "@solana-program/token";

import { RPC_URL } from "./config"

export const TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

// Build a client signed by whoever's keypair bytes you pass.
export async function makeClient(secretBytes: Uint8Array, rpcUrl?: string) {
  const kp = await createKeyPairSignerFromBytes(secretBytes);
  const url = rpcUrl ?? RPC_URL;
  const client = await createClient()
    .use(signer(kp))
    .use(solanaMainnetRpc({ rpcUrl: url }))
    .use(subscriptionsProgram());
  return { client, signer: kp };
}

// Build a client that signs via an externally-provided signer (e.g. a browser wallet).
export async function makeClientWithSigner(walletSigner: any, rpcUrl?: string) {
  const url = rpcUrl ?? RPC_URL;
  const client = await createClient()
    .use(signer(walletSigner))
    .use(solanaMainnetRpc({ rpcUrl: url }))
    .use(subscriptionsProgram());
  return { client, signer: walletSigner };
}

// Ensure a merchant's associated token account exists (idempotent).
// Signed/paid by the platform. Safe to call repeatedly.
export async function ensureMerchantAta(
  platform: TransactionSigner,
  merchantWallet: Address,
  mint: Address
) {
  const ix = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer: platform,
    owner: merchantWallet,
    mint,
  });

  const rpc = createSolanaRpc(RPC_URL);
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(platform, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(ix, m)
  );

  // Keypair signer: sign locally, then send the raw transaction.
  const signed = await signTransactionMessageWithSigners(message);
  const wire = getBase64EncodedWireTransaction(signed);
  const sig = await rpc
    .sendTransaction(wire, { encoding: "base64", skipPreflight: false })
    .send();
  return sig;
}

// MERCHANT (or payer): create a plan. Returns the plan PDA + bump.
export async function createPlan(
  client: any,
  owner: TransactionSigner,
  opts: {
    planId: bigint;
    mint: Address;
    amount: bigint;
    periodHours: number;
  }
) {
  const [planPda, planBump] = await findPlanPda({
    owner: owner.address,
    planId: opts.planId,
  });

  await client.subscriptions.instructions
    .createPlan({
      planId: opts.planId,
      mint: opts.mint,
      amount: opts.amount,
      periodHours: opts.periodHours,
      endTs: 0,
      destinations: [],
      pullers: [],
      metadataUri: "",
    })
    .sendTransaction();

  return { planPda, planBump };
}

// CUSTOMER: one-time authority setup for a given mint.
// CUSTOMER: one-time authority setup for a given mint.
export async function initAuthority(
  client: any,
  customer: TransactionSigner,
  mint: Address
) {
  const [userAta] = await findAssociatedTokenPda({
    owner: customer.address,
    mint,
    tokenProgram: TOKEN_PROGRAM,
  });

  await client.subscriptions.instructions
    .initSubscriptionAuthority({
      owner: customer,
      tokenMint: mint,
      userAta,
      tokenProgram: TOKEN_PROGRAM,
    })
    .sendTransaction();
}

// CUSTOMER: subscribe to a plan (echoes on-chain terms back).
export async function subscribe(
  client: any,
  customer: TransactionSigner,
  opts: {
    merchant: Address;
    mint: Address;
    planId: bigint;
    planPda: Address;
    planBump: number;
  }
) {
  const [subAuthorityPda] = await findSubscriptionAuthorityPda({
    user: customer.address,
    tokenMint: opts.mint,
  });

  const planAccount = await fetchPlan(client.rpc, opts.planPda);
  const authAccount = await fetchSubscriptionAuthority(client.rpc, subAuthorityPda);
  const terms = planAccount.data.data.terms;

  await client.subscriptions.instructions
    .subscribe({
      subscriber: customer,
      merchant: opts.merchant,
      planId: opts.planId,
      planPda: opts.planPda,
      tokenMint: opts.mint,
      subscriptionAuthorityPda: subAuthorityPda,
      subscribeData: {
        planId: opts.planId,
        planBump: opts.planBump,
        expectedMint: opts.mint,
        expectedAmount: terms.amount,
        expectedPeriodHours: terms.periodHours,
        expectedCreatedAt: terms.createdAt,
        expectedSubscriptionAuthorityInitId: authAccount.data.initId,
      },
    })
    .sendTransaction();

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda: opts.planPda,
    subscriber: customer.address,
  });
  return { subscriptionPda };
}

// PULLER: collect one cycle's payment. Called by the cron worker.
export async function collectPayment(
  client: any,
  caller: TransactionSigner,
  opts: {
    amount: bigint;
    delegator: Address;   // subscriber wallet
    mint: Address;
    planPda: Address;
    receiverAta: Address; // where funds land
  }
) {
  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda: opts.planPda,
    subscriber: opts.delegator,
  });

const result = await client.subscriptions.instructions
    .transferSubscription({
      amount: opts.amount,
      caller,
      delegator: opts.delegator,
      planPda: opts.planPda,
      subscriptionPda,
      receiverAta: opts.receiverAta,
      tokenMint: opts.mint,
      tokenProgram: TOKEN_PROGRAM,
    })
    .sendTransaction();

  const signature = result?.context?.signature ?? null;
  if (!signature) {
    // No signature came back -> nothing landed. Treat as failure.
    throw new Error("collectPayment: no signature returned from sendTransaction");
  }

  // Confirm the tx actually landed on-chain (not just submitted).
  const confirmed = await confirmSignature(client.rpc, signature);
  if (!confirmed.ok) {
    throw new Error(`collectPayment: tx not confirmed (${signature}): ${confirmed.reason}`);
  }

  return { signature };
}

// Poll a signature until confirmed/finalized or timeout.
// Returns { ok: true } only if the tx confirmed WITHOUT an on-chain error.
async function confirmSignature(
  rpc: any,
  signature: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<{ ok: boolean; reason?: string }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const intervalMs = opts.intervalMs ?? 1_500;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await rpc.getSignatureStatuses([signature]).send();
      const st = res?.value?.[0];
      if (st) {
        if (st.err) {
          return { ok: false, reason: `on-chain error: ${JSON.stringify(st.err)}` };
        }
        const status = st.confirmationStatus;
        if (status === "confirmed" || status === "finalized") {
          return { ok: true };
        }
      }
    } catch {
      // transient RPC hiccup -> keep polling until timeout
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, reason: "confirmation timed out" };
}

export {
  findPlanPda,
  findSubscriptionAuthorityPda,
  findSubscriptionDelegationPda,
  findAssociatedTokenPda,
};