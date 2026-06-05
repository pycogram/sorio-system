import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const planPda = req.nextUrl.searchParams.get("planPda");
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!planPda || !wallet) {
    return NextResponse.json({ subscribed: false });
  }

  const db = createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: plan } = await db
    .from("plans")
    .select("id")
    .eq("plan_pda", planPda)
    .maybeSingle();
  if (!plan) return NextResponse.json({ subscribed: false });

  const { data: sub } = await db
    .from("subscriptions")
    .select("id, status")
    .eq("plan_id", plan.id)
    .eq("subscriber_wallet", wallet)
    .maybeSingle();

  return NextResponse.json({ subscribed: !!sub, status: sub?.status ?? null });
}