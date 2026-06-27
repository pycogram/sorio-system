import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { verifyAuth, AuthError } from "../../lib/verify-auth";

export const runtime = "nodejs";

function db() {
  return createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Hash a raw key for storage/lookup. We NEVER store the raw key — only this.
// sha256 is one-way: you can compute the hash from the key, but you cannot
// recover the key from the hash. So a leaked DB still can't be used to call the API.
function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// GET /api/keys?wallet=..&timestamp=..&signature=..
// List the caller's API keys (prefix only — the full key is never retrievable).
export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet") ?? undefined;
    const timestampRaw = req.nextUrl.searchParams.get("timestamp");
    const signature = req.nextUrl.searchParams.get("signature") ?? undefined;
    const timestamp = timestampRaw ? Number(timestampRaw) : undefined;

    let owner: string;
    try {
      owner = verifyAuth({ action: "api-keys-list", wallet, timestamp, signature, params: {} });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const { data } = await db()
      .from("api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
      .eq("wallet", owner)
      .order("created_at", { ascending: false });

    return NextResponse.json({ keys: data ?? [] });
  } catch (e: any) {
    console.error("api keys list failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}

// POST /api/keys
// Body: { name?, wallet, timestamp, signature }
// Generates a new API key for the caller's wallet. Returns the raw key ONCE.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, wallet, timestamp, signature } = body;

    let owner: string;
    try {
      // The name is part of the signed params so it can't be tampered with.
      owner = verifyAuth({
        action: "api-keys-create",
        wallet, timestamp, signature,
        params: { name: typeof name === "string" ? name : "" },
      });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    // Generate the key: sk_live_ + 32 random hex-ish chars (24 bytes -> base64url).
    const secret = randomBytes(24).toString("base64url"); // ~32 chars, URL-safe
    const rawKey = `sk_live_${secret}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12); // e.g. "sk_live_a1b2" — safe to show

    const { error } = await db().from("api_keys").insert({
      wallet: owner,
      name: typeof name === "string" && name.trim() ? name.trim() : null,
      key_hash: keyHash,
      key_prefix: keyPrefix,
    });
    if (error) throw error;

    // Return the raw key ONCE. After this we only have the hash — it can never
    // be shown again. The developer must copy it now.
    return NextResponse.json({ key: rawKey, prefix: keyPrefix, name: name ?? null });
  } catch (e: any) {
    console.error("api key create failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}