import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { planPda, subscriberWallet, subscriptionPda, maxPayments, inviteCode } = await req.json();
    if (!planPda || !subscriberWallet || !subscriptionPda) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Look up the plan to get its id + period.
    const { data: plan, error: pErr } = await db
      .from("plans")
      .select("id, period_seconds")
      .eq("plan_pda", planPda)
      .maybeSingle();
    if (pErr || !plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // First collection is due now (so the worker picks it up on next run).
    const { data: sub, error: sErr } = await db
      .from("subscriptions")
      .insert({
        plan_id: plan.id,
        subscriber_wallet: subscriberWallet,
        subscription_pda: subscriptionPda,
        next_collection_at: new Date().toISOString(),
        max_payments:
          typeof maxPayments === "number" && maxPayments > 0 ? maxPayments : null,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    // Record a pending referral if this subscriber arrived via an invite code.
    // Resolve the code -> inviter wallet server-side (keeps inviter address
    // private). Never let referral recording break the subscribe flow.
    try {
      if (inviteCode && typeof inviteCode === "string") {
        const inviter = await resolveInviteCode(db, inviteCode);
        if (inviter && inviter !== subscriberWallet) {
          await db.from("referrals").upsert(
            { inviter_wallet: inviter, invitee_wallet: subscriberWallet, status: "pending" },
            { onConflict: "invitee_wallet", ignoreDuplicates: true }
          );
        }
      }
    } catch (e: any) {
      console.log("referral record (non-fatal):", e?.message ?? e);
    }

    return NextResponse.json({ subscriptionId: sub.id });
  } catch (e: any) {
    console.error("subscribe save failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}