import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { getOrCreateInviteCode } from "../../lib/invite-code";

export const runtime = "nodejs";

// GET /api/invite-code?wallet=<addr>
// Returns the wallet's invite code, creating one on first call.
// Used by the referral page to show the user their shareable link.
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const code = await getOrCreateInviteCode(db, wallet);
    return NextResponse.json({ code });
  } catch (e: any) {
    console.error("invite-code failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}