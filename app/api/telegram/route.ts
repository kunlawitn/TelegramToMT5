import { NextResponse } from "next/server";
import { parseEasyGoldSniper } from "../../../lib/parse";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";


export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.SIGNAL_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }


  const update = await req.json();
  const msg = update.message || update.channel_post;
  const text: string = msg?.text || "";
  const chatId = String(msg?.chat?.id ?? "");


  const signal = parseEasyGoldSniper(text);
  if (!signal) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const { error } = await supabaseAdmin
    .from("signals")
    .upsert({
      id: signal.id,
      chat_id: chatId,
      source: signal.source,
      symbol_tv: signal.symbol_tv,
      symbol_mt5: signal.symbol_mt5,
      tf: signal.tf,
      side: signal.side,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp,
      raw: signal.raw,
    });
    

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: true, id: signal.id });
}
