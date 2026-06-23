import type { SupabaseClient } from "@supabase/supabase-js";

// 8-char codes from an unambiguous alphabet (no 0/o/1/l/i to avoid confusion).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LEN = 8;

function randomCode(): string {
  let out = "";
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

// Get the wallet's existing invite code, or create one. Uniqueness is enforced
// by the DB (code is PK, wallet is unique). On a code collision we retry.
export async function getOrCreateInviteCode(
  db: SupabaseClient,
  wallet: string
): Promise<string> {
  // Already have one?
  const { data: existing } = await db
    .from("invite_codes")
    .select("code")
    .eq("wallet", wallet)
    .maybeSingle();
  if (existing?.code) return existing.code;

  // Create, retrying on the rare code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data, error } = await db
      .from("invite_codes")
      .insert({ code, wallet })
      .select("code")
      .single();
    if (!error && data?.code) return data.code;

    // If the WALLET already exists (race: created between our check and insert),
    // fetch and return it instead of retrying.
    const { data: again } = await db
      .from("invite_codes")
      .select("code")
      .eq("wallet", wallet)
      .maybeSingle();
    if (again?.code) return again.code;
    // else: code collision -> loop and try a new code
  }
  throw new Error("could not generate a unique invite code");
}

// Resolve an invite code to its owner wallet (or null).
export async function resolveInviteCode(
  db: SupabaseClient,
  code: string
): Promise<string | null> {
  const { data } = await db
    .from("invite_codes")
    .select("wallet")
    .eq("code", code)
    .maybeSingle();
  return data?.wallet ?? null;
}