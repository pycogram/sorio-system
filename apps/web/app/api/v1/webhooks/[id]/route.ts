import { NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyApiKey, ApiKeyError } from "../../../../lib/verify-api-key";

export const runtime = "nodejs";

function db() {
  return createDb(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// DELETE /api/v1/webhooks/[id]
// Deactivates the webhook. The wallet check ensures you can only delete your own.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let wallet: string;
  try {
    wallet = await verifyApiKey(req);
  } catch (e) {
    if (e instanceof ApiKeyError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  const supa = db();

  const { error } = await supa
    .from("webhooks")
    .update({ active: false })
    .eq("id", id)
    .eq("wallet", wallet);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: { id, deleted: true } });
}
