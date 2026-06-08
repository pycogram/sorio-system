import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { subscriptionPda } = await req.json();
  if (!subscriptionPda) {
    return NextResponse.json({ error: "subscriptionPda required" }, { status: 400 });
  }

  const db = createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { error } = await db
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("subscription_pda", subscriptionPda);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}