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
import { getCancelSubscriptionInstructionAsync } from "@solana/subscriptions";

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
        let signature: string;
        try {
          ({ signature } = await provider.signAndSendTransaction(vtx));
        } catch (err: any) {
          // User declined the Phantom prompt — not a real error.
          if (err?.code === 4001 || /reject/i.test(err?.message ?? "")) {
            throw new Error("USER_CANCELLED");
          }
          throw err;
        }
        const { default: bs58 } = await import("bs58");
        out.push(bs58.decode(signature));
      }
      return out;
    },
  };
}

export async function runCancel(opts: {
  planPda: string;
  subscriptionPda: string;
}) {
  const signer = makePhantomSigner();
  const rpc = createSolanaRpc(RPC_URL);

  const cancelIx = await getCancelSubscriptionInstructionAsync({
    subscriber: signer,
    planPda: address(opts.planPda),
    subscriptionPda: address(opts.subscriptionPda),
  });

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(cancelIx, m)
  );
  const sig = await signAndSendTransactionMessageWithSigners(message);
  const sigStr = getBase58Decoder().decode(sig);

  // Mark cancelled in the DB so the worker stops collecting.
  await fetch("/api/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptionPda: opts.subscriptionPda }),
  });

  return { signature: sigStr };
}