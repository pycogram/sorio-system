// apps/web/app/lib/verify-api-key.ts
//
// Authenticates an incoming API request by its API key (NOT a wallet signature).
// This is how developers' servers call the public API: they send their key in
// the Authorization header, and we map it back to the wallet that owns it.
//
// Flow: read the key from the header -> hash it -> look up the hash -> if found,
// not revoked, return the owning wallet. Otherwise throw ApiKeyError.

import { createClient as createDb } from "@supabase/supabase-js";
import { createHash } from "crypto";

export class ApiKeyError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Extract the API key from the request. Standard convention:
//   Authorization: Bearer sk_live_xxx
// We also accept a raw "x-api-key: sk_live_xxx" header for convenience.
function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const xKey = req.headers.get("x-api-key");
  if (xKey) return xKey.trim();
  return null;
}

// Verify the API key on a request. Returns the owning wallet on success.
// Throws ApiKeyError (401/etc) on any failure. Also bumps last_used_at so the
// developer can see which keys are active.
export async function verifyApiKey(req: Request): Promise<string> {
  const rawKey = extractKey(req);
  if (!rawKey) {
    throw new ApiKeyError("Missing API key. Send 'Authorization: Bearer <key>'.", 401);
  }
  if (!rawKey.startsWith("sk_live_")) {
    throw new ApiKeyError("Invalid API key format.", 401);
  }

  const keyHash = hashKey(rawKey);

  const db = createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await db
    .from("api_keys")
    .select("id, wallet, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error) throw new ApiKeyError("Auth lookup failed", 500);
  if (!data) throw new ApiKeyError("Invalid API key.", 401);
  if (data.revoked_at) throw new ApiKeyError("This API key has been revoked.", 401);

  // Best-effort: record usage. Don't fail the request if this update hiccups.
  try {
    await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  } catch {
    /* non-fatal */
  }

  return data.wallet;
}