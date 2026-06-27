import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyAuth, AuthError } from "../../../lib/verify-auth";

export const runtime = "nodejs";

// POST /api/keys/revoke
// Body: { id, wallet, timestamp, signature }
// Revokes one of the caller's keys (sets revoked_at). The key stays in the DB
// for audit, but the auth check will reject it from now on.
export async function POST(req: NextRequest) {
  try {
    const { id, wallet, timestamp, signature } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let owner: string;
    try {
      owner = verifyAuth({
        action: "api-keys-revoke",
        wallet, timestamp, signature,
        params: { id },
      });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const db = createDb(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Only revoke a key that belongs to the caller (wallet match is the guard).
    const { data, error } = await db
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("wallet", owner)
      .is("revoked_at", null)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("api key revoke failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}