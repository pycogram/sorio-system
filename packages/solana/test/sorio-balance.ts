import { createSolanaRpc, address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";

// $SORIO is a Token-2022 mint — different program than classic SPL / USDC.
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const SORIO_MINT = address("A6VcXrUUYjNiR8RkHCRNu8zuxWUMnhMWoX11j6Bapump");
const TOKEN_2022 = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function main() {
  const owner = process.argv[2];
  if (!owner) {
    console.error("Usage: npx tsx packages/solana/test/sorio-balance.ts <WALLET_ADDRESS>");
    process.exit(1);
  }

  const rpc = createSolanaRpc(RPC);

  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: SORIO_MINT,
    tokenProgram: TOKEN_2022,
  });

  console.log("Wallet:      ", owner);
  console.log("Derived ATA: ", ata);

  try {
    const bal = await rpc.getTokenAccountBalance(ata).send();
    console.log("Raw amount:  ", bal.value.amount);
    console.log("UI amount:   ", bal.value.uiAmountString, "$SORIO");
  } catch (e: any) {
    console.error("Balance read FAILED:", e?.message ?? e);
    console.error("(Token-2022 may need @solana-program/token-2022 derivation.)");
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});