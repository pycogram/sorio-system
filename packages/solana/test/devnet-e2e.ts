import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createKeyPairSignerFromBytes, address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  makeClient,
  createPlan,
  initAuthority,
  subscribe,
  collectPayment,
  TOKEN_PROGRAM,
} from "../src/index.js";

const KEYS = join(homedir(), "Desktop/paylo/.keys");
const USDC_MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

function loadKey(file: string): Uint8Array {
  return new Uint8Array(JSON.parse(readFileSync(join(KEYS, file), "utf8")));
}

async function main() {
  const collectorBytes = loadKey("collector.json");
  const customerBytes = loadKey("customer.json");
  const { client: merchantClient, signer: collector } = await makeClient(collectorBytes);
  const { client: customerClient, signer: customer } = await makeClient(customerBytes);

  console.log("Collector:", collector.address);
  console.log("Customer: ", customer.address);

  const planId = BigInt(Date.now());

  console.log("\n[1/4] createPlan...");
  const { planPda, planBump } = await createPlan(merchantClient, collector, {
    planId,
    mint: USDC_MINT,
    amount: 1_000_000n,
    periodHours: 1,
  });
  console.log("  plan:", planPda);

  console.log("\n[2/4] initAuthority...");
  try {
    await initAuthority(customerClient, customer, USDC_MINT);
    console.log("  ok");
  } catch (e: any) {
    console.log("  note:", e?.message ?? e);
  }

  console.log("\n[3/4] subscribe...");
  await subscribe(customerClient, customer, {
    merchant: collector.address,
    mint: USDC_MINT,
    planId,
    planPda,
    planBump,
  });
  console.log("  subscribed");

  console.log("\n[4/4] collectPayment...");
  const [collectorAta] = await findAssociatedTokenPda({
    owner: collector.address,
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM,
  });
  await collectPayment(merchantClient, collector, {
    amount: 1_000_000n,
    delegator: customer.address,
    mint: USDC_MINT,
    planPda,
    receiverAta: collectorAta,
  });
  console.log("  *** PAYMENT COLLECTED ***");

  console.log("\nDone — full loop via reusable functions.");
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});