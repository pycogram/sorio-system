import {
  createClient,
  createKeyPairSignerFromBytes,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { signer } from "@solana/kit-plugin-signer";
import { solanaDevnetRpc } from "@solana/kit-plugin-rpc";
import {
  subscriptionsProgram,
  findPlanPda,
  findSubscriptionAuthorityPda,
  findSubscriptionDelegationPda,
  fetchPlan,
  fetchSubscriptionAuthority,
} from "@solana/subscriptions";
import { findAssociatedTokenPda } from "@solana-program/token";

export const TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

// Build a client signed by whoever's keypair bytes you pass.
export async function makeClient(secretBytes: Uint8Array) {
  const kp = await createKeyPairSignerFromBytes(secretBytes);
  const client = await createClient()
    .use(signer(kp))
    .use(solanaDevnetRpc())
    .use(subscriptionsProgram());
  return { client, signer: kp };
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

  return { signature: result?.context?.signature ?? null };
}

export {
  findPlanPda,
  findSubscriptionAuthorityPda,
  findSubscriptionDelegationPda,
  findAssociatedTokenPda,
};