import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { itemId, subscriptionPda } = await req.json();
    if (!itemId || !subscriptionPda) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { error } = await db
      .from("payroll_items")
      .update({ subscription_pda: subscriptionPda, status: "active" })
      .eq("id", itemId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("payroll activate failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}