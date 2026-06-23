import type { SupabaseClient } from "@supabase/supabase-js";

// Referral reward: 0.4% of the payment (merchant/salary) amount.
const REFERRAL_RATE_BPS = 40n; // 40 basis points = 0.4%

// On a successful payment by `payerWallet` of `amountBaseUnits` (merchant or
// salary amount, USDC base units), accrue 0.4% to the inviter if this payer was
// referred, and confirm the referral on first accrual. No-op if not referred.
// Never throws — referral bookkeeping must not break a payment.
export async function accrueReferral(
  db: SupabaseClient,
  payerWallet: string,
  amountBaseUnits: bigint
): Promise<void> {
  try {
    const { data: ref } = await db
      .from("referrals")
      .select("id, status, accrued_usd")
      .eq("invitee_wallet", payerWallet)
      .maybeSingle();
    if (!ref) return;

    const reward = (amountBaseUnits * REFERRAL_RATE_BPS) / 10000n;
    if (reward <= 0n) return;

    const newAccrued = BigInt(ref.accrued_usd ?? 0) + reward;
    const update: Record<string, any> = { accrued_usd: Number(newAccrued) };
    if (ref.status !== "confirmed") {
      update.status = "confirmed";
      update.confirmed_at = new Date().toISOString();
    }
    await db.from("referrals").update(update).eq("id", ref.id);
  } catch (e) {
    console.log("accrueReferral error (non-fatal):", (e as any)?.message ?? e);
  }
}
