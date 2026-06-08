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

const USDC_MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const PLATFORM_OWNER = address("FPaUQV5MmDdXBTTH4pRo1C2zX7UvnC7kD1rc4VNwdFN2");
const RPC_URL = "https://api.devnet.solana.com";

function getProvider(): any {
  const w = window as any;
  return w.phantom?.solana ?? w.solana;
}

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

export async function runApproveEmployee(opts: { itemId: string }) {
  // 1. Create (or fetch) the employee's on-chain plan, server-side.
  const planRes = await fetch("/api/payroll/approve-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: opts.itemId }),
  });
  const planData = await planRes.json();
  if (!planRes.ok) throw new Error(planData.error ?? "Plan creation failed");

  const signer = makePhantomSigner();
  const rpc = createSolanaRpc(RPC_URL);
  const employerAddr = signer.address;
  const planPda = address(planData.planPda);

  // 2. Init the employer's subscription authority (one-time per employer+mint).
  const [userAta] = await findAssociatedTokenPda({
    owner: employerAddr,
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM,
  });
  const initIx = await getInitSubscriptionAuthorityInstructionAsync({
    owner: signer,
    tokenMint: USDC_MINT,
    userAta,
    tokenProgram: TOKEN_PROGRAM,
  });

  // init may already exist from a prior employee — tolerate failure.
  try {
    const initSig = await sendIx(rpc, signer, initIx);
    await waitForConfirm(rpc, initSig);
  } catch (e: any) {
    console.log("init authority skipped/exists:", e?.message);
  }

  // 3. Employer subscribes to the employee's plan (authorizes recurring pulls).
  const [subAuthorityPda] = await findSubscriptionAuthorityPda({
    user: employerAddr,
    tokenMint: USDC_MINT,
  });
  const planAccount = await fetchPlan(rpc, planPda);
  const authAccount = await fetchSubscriptionAuthority(rpc, subAuthorityPda);
  const terms = planAccount.data.data.terms;

  const subscribeIx = await getSubscribeInstructionAsync({
    subscriber: signer,
    merchant: PLATFORM_OWNER,
    planPda,
    subscriptionAuthorityPda: subAuthorityPda,
    subscribeData: {
      planId: BigInt(planData.planId),
      planBump: planData.planBump,
      expectedMint: USDC_MINT,
      expectedAmount: terms.amount,
      expectedPeriodHours: terms.periodHours,
      expectedCreatedAt: terms.createdAt,
      expectedSubscriptionAuthorityInitId: authAccount.data.initId,
    },
  });
  const subSig = await sendIx(rpc, signer, subscribeIx);

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda,
    subscriber: employerAddr,
  });

  // 4. Mark the item active + save the subscription PDA.
  await fetch("/api/payroll/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: opts.itemId, subscriptionPda }),
  });

  return { signature: subSig, subscriptionPda };
}