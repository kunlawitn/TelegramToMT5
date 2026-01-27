import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const payload = {
    chat_id: 0,
    text: "healthcheck",
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("signals")
    .insert(payload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, details: error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, inserted: data });
}
