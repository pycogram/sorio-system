import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planPda: string }> }
) {
  const { planPda } = await params;

  const db = createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await db
    .from("plans")
    .select("plan_pda, name, amount, token_mint, period_seconds, merchants(name, destination_wallet)")
    .eq("plan_pda", planPda)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  return NextResponse.json({ plan: data });
}