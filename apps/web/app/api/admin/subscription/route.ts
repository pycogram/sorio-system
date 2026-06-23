import { NextRequest, NextResponse } from "next/server";
import { createClient as createDb } from "@supabase/supabase-js";
import { verifyAdmin } from "../verify-admin";
import { AuthError } from "../../../lib/verify-auth";

export const runtime = "nodejs";

const ALLOWED = new Set(["pause", "resume", "cancel"]);

// POST /api/admin/subscription
// Body: { id, action: "pause"|"resume"|"cancel", wallet, timestamp, signature }
// Admin-gated. The signed params include id + action so the signature covers
// exactly which record and which operation (no tampering).
export async function POST(req: NextRequest) {
  try {
    const { id, action, wallet, timestamp, signature } = await req.json();
    if (!id || !ALLOWED.has(action)) {
      return NextResponse.json({ error: "Missing id or invalid action" }, { status: 400 });
    }

    try {
      verifyAdmin({
        action: "admin-subscription",
        wallet, timestamp, signature,
        params: { id, op: action },
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

    const newStatus =
      action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "active";

    const update: Record<string, any> = { status: newStatus };
    // Resuming: collect on the next worker run.
    if (action === "resume") update.next_collection_at = new Date().toISOString();

    const { error } = await db.from("subscriptions").update(update).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true, id, status: newStatus });
  } catch (e: any) {
    console.error("admin subscription action failed:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}