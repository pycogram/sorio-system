import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { itemId } = await req.json();
    if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { error } = await db
      .from("payroll_items")
      .update({ status: "removed" })
      .eq("id", itemId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("payroll remove failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}