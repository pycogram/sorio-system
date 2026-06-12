import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { wallet, hidden } = await req.json();

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
  if (typeof hidden !== "boolean") {
    return NextResponse.json({ error: "hidden (boolean) required" }, { status: 400 });
  }

  const db = createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Ownership check: the payroll must belong to this employer wallet.
  const { data: payroll } = await db
    .from("payrolls")
    .select("id, employer_wallet")
    .eq("id", id)
    .maybeSingle();

  if (!payroll || payroll.employer_wallet !== wallet) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const { error } = await db
    .from("payrolls")
    .update({ hidden })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hidden });
}