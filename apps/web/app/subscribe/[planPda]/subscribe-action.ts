import {
  address,
  createSolanaRpc,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signAndSendTransactionMessageWithSigners,
  getBase58Decoder,
  getTransactionEncoder,
} from "@solana/kit";
import { VersionedTransaction } from "@solana/web3.js";
import {
  getInitSubscriptionAuthorityInstructionAsync,
  getSubscribeInstructionAsync,
  findSubscriptionAuthorityPda,
  fetchSubscriptionAuthority,
  findSubscriptionDelegationPda,
  fetchPlan,
} from "@solana/subscriptions";
import { findAssociatedTokenPda } from "@solana-program/token";
import { getProvider } from "../../providers";
import { USDC_MINT_ADDRESS, RPC_URL } from "../../lib/config";
import { signRequest } from "../../lib/sign-request";
import { getStoredRef } from "../../lib/referral";

const USDC_MINT = address(USDC_MINT_ADDRESS);
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function makePhantomSigner() {
  const provider = getProvider();
  if (!provider?.publicKey) throw new Error("Phantom not connected");
  const txEncoder = getTransactionEncoder();
  return {
    address: address(provider.publicKey.toString()),
    async signAndSendTransactions(transactions: any[]): Promise<Uint8Array[]> {
      const out: Uint8Array[] = [];
      for (const tx of transactions) {
        const wire = new Uint8Array(txEncoder.encode(tx));
        const vtx = VersionedTransaction.deserialize(wire);
        try {
          const { signature } = await provider.signAndSendTransaction(vtx);
          const { default: bs58 } = await import("bs58");
          out.push(bs58.decode(signature));
        } catch (err: any) {
          if (err?.code === 4001 || /reject/i.test(err?.message ?? "")) {
            throw new Error("USER_CANCELLED");
          }
          console.error("send error:", err?.message, err?.code);
          throw err;
        }
      }
      return out;
    },
  };
}

async function sendIx(rpc: any, signer: any, instruction: any) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m)
  );
  const sig = await signAndSendTransactionMessageWithSigners(message);
  return getBase58Decoder().decode(sig);
}

async function waitForConfirm(rpc: any, sigStr: string) {
  for (let i = 0; i < 30; i++) {
    const { value } = await rpc.getSignatureStatuses([sigStr]).send();
    const st = value?.[0];
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function runSubscribe(opts: {
  planPda: string;
  merchantWallet: string;
  maxPayments?: number | null;
}) {
  const signer = makePhantomSigner();
  const rpc = createSolanaRpc(RPC_URL);
  const subscriberAddr = signer.address;

  const [userAta] = await findAssociatedTokenPda({
    owner: subscriberAddr,
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM,
  });

  // Step 1: init subscription authority, wait for confirmation.
  const initIx = await getInitSubscriptionAuthorityInstructionAsync({
    owner: signer,
    tokenMint: USDC_MINT,
    userAta,
    tokenProgram: TOKEN_PROGRAM,
  });
  const initSig = await sendIx(rpc, signer, initIx);
  await waitForConfirm(rpc, initSig);

  // Step 2: subscribe.
  const meta = await (await fetch(`/api/plan/${opts.planPda}/meta`)).json();
  const planPda = address(opts.planPda);

  const [subAuthorityPda] = await findSubscriptionAuthorityPda({
    user: subscriberAddr,
    tokenMint: USDC_MINT,
  });

  const planAccount = await fetchPlan(rpc, planPda);
  const authAccount = await fetchSubscriptionAuthority(rpc, subAuthorityPda);
  const terms = planAccount.data.data.terms;

  const PLATFORM_OWNER = address("FPaUQV5MmDdXBTTH4pRo1C2zX7UvnC7kD1rc4VNwdFN2");
  const subscribeIx = await getSubscribeInstructionAsync({
    subscriber: signer,
    merchant: PLATFORM_OWNER,
    planPda,
    subscriptionAuthorityPda: subAuthorityPda,
    subscribeData: {
      planId: BigInt(meta.planId),
      planBump: meta.planBump,
      expectedMint: USDC_MINT,
      expectedAmount: terms.amount,
      expectedPeriodHours: terms.periodHours,
      expectedCreatedAt: terms.createdAt,
      expectedSubscriptionAuthorityInitId: authAccount.data.initId,
    },
  });
  const subSig = await sendIx(rpc, signer, subscribeIx);

  // Wait for the subscribe transaction to confirm on-chain before the first
  // charge — the puller can't collect against an unconfirmed subscription.
  await waitForConfirm(rpc, subSig);

  // Derive the subscription delegation PDA (what the worker collects against).
  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda,
    subscriber: subscriberAddr,
  });

  // Save to Supabase so the collection worker can find it.
  const inviteCode = getStoredRef();
  const saveRes = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planPda: opts.planPda,
      subscriberWallet: subscriberAddr,
      subscriptionPda,
      maxPayments: opts.maxPayments ?? null,
      inviteCode,
    }),
  });
  const saveData = await saveRes.json().catch(() => ({}));

  // Best-effort: charge the first payment immediately so the customer sees it
  // work right away. If it fails, the worker collects on its next run.
  let firstCharge: { collected: boolean; signature?: string } | null = null;
  if (saveData?.subscriptionId) {
    try {
      const auth = await signRequest("subscribe-collect", { subscriptionId: saveData.subscriptionId });
      const cRes = await fetch("/api/collect-first", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, subscriptionId: saveData.subscriptionId }),
      });
      firstCharge = await cRes.json().catch(() => null);
    } catch {
      /* non-fatal — worker will collect */
    }
  }

  return { signature: subSig, subscriptionPda, firstCharge };
}