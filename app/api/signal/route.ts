import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key") || "";
    const chatId = url.searchParams.get("chat_id") || "";

    if (!process.env.SIGNAL_SECRET || key !== process.env.SIGNAL_SECRET) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!chatId) {
      return NextResponse.json({ ok: false, error: "missing_chat_id" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("signals")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ ok: true, empty: true });

    const s: any = data[0];
    return NextResponse.json({
      ok: true,
      signal: {
        id: s.id,
        chat_id: s.chat_id,
        symbol_tv: s.symbol_tv,
        side: s.side,
        entry: Number(s.entry),
        sl: Number(s.sl),
        tp: Number(s.tp),
        tf: s.tf,
        ts: Math.floor(new Date(s.created_at).getTime() / 1000),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
