import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { verifyApiKey, ApiKeyError } from "../../../lib/verify-api-key";
import { isPrivateHost } from "../../../lib/validate-webhook-url";

export const runtime = "nodejs";

function db() {
  return createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET /api/v1/webhooks
// Returns the active webhook for the authenticated wallet (secret omitted).
export async function GET(req: Request) {
  let wallet: string;
  try {
    wallet = await verifyApiKey(req);
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const supa = db();
  const { data } = await supa
    .from("webhooks")
    .select("id, url, active, created_at")
    .eq("wallet", wallet)
    .eq("active", true)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/v1/webhooks
// Body: { url }
// Registers a webhook endpoint. Deactivates any previous webhook for this wallet.
// The signing secret is returned once — store it, it cannot be retrieved again.
export async function POST(req: Request) {
  let wallet: string;
  try {
    wallet = await verifyApiKey(req);
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });

  const { url } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return NextResponse.json({ error: "url must use http or https." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "url is not a valid URL." }, { status: 400 });
  }
  if (isPrivateHost(url)) {
    return NextResponse.json({ error: "url must point to a public host." }, { status: 400 });
  }

  const secret = randomBytes(32).toString("hex");
  const supa = db();

  // One active webhook per wallet — deactivate the old one first.
  await supa.from("webhooks").update({ active: false }).eq("wallet", wallet);

  const { data, error } = await supa
    .from("webhooks")
    .insert({ wallet, url, secret, active: true })
    .select("id, url, active, created_at")
    .single();

  if (error) throw error;

  return NextResponse.json({ data: { ...data, secret } }, { status: 201 });
}
