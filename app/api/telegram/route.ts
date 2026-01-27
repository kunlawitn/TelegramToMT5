// app/api/telegram/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseSignalFromText } from "@/lib/parse";

export const runtime = "nodejs"; // ชัวร์ว่าใช้ node runtime

function dbg(...args: any[]) {
  if (process.env.DEBUG_LOG === "true") console.log(...args);
}

function getHeader(req: Request, name: string) {
  return req.headers.get(name) || req.headers.get(name.toLowerCase());
}

export async function POST(req: Request) {
  const started = Date.now();

  try {
    // 1) Verify Telegram secret header
    const expected = process.env.WEBHOOK_SECRET || "";
    const got =
      getHeader(req, "x-telegram-bot-api-secret-token") ||
      getHeader(req, "X-Telegram-Bot-Api-Secret-Token") ||
      "";

    if (!expected) {
      // เผื่อยังไม่ได้ตั้ง ENV
      return NextResponse.json(
        { ok: false, error: "WEBHOOK_SECRET env missing" },
        { status: 500 }
      );
    }

    if (got !== expected) {
      dbg("[TG] unauthorized secret", { gotLen: got.length });
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // 2) Read body
    const body = await req.json();

    // Telegram ส่งมาได้ทั้ง message / channel_post
    const update = body?.message ?? body?.channel_post ?? null;
    if (!update) {
      dbg("[TG] no message/channel_post", { keys: Object.keys(body || {}) });
      return NextResponse.json({ ok: true, skipped: true, reason: "no_update_object" });
    }

    const chatId = update?.chat?.id;
    const messageId = update?.message_id;
    const date = update?.date; // epoch seconds
    const text = update?.text ?? update?.caption ?? ""; // กันเคสข้อความอยู่ใน caption

    dbg("[TG] recv", {
      chatId,
      messageId,
      date,
      textLen: text?.length || 0,
      preview: (text || "").slice(0, 120),
    });

    if (!chatId || !messageId || !text) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "missing_chatId_or_messageId_or_text",
        got: { chatId, messageId, hasText: !!text },
      });
    }

    // 3) Parse signal text -> structured fields
    const parsed = parseSignalFromText(text);

    dbg("[TG] parsed", parsed);

    if (!parsed.ok) {
      // ไม่ใช่สัญญาณเข้า (เช่น WIN/EXIT) ก็ข้ามได้ ไม่ต้องทำ 500
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "not_a_trade_signal",
        parse_error: parsed.error,
      });
    }

    // 4) Insert to Supabase
    const row = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      source: "telegram",
      chat_id: String(chatId),
      message_id: Number(messageId),
      date_ts: date ? new Date(date * 1000).toISOString() : null,

      // raw เก็บไว้ดูย้อนหลัง
      raw_text: text,

      // parsed fields
      symbol: parsed.symbol,         // เช่น XAUUSD, BTCUSD
      symbol_tv: parsed.symbol,      // เก็บเหมือนกันก่อน
      symbol_mt5: null as string | null, // ให้ EA map เองด้วย suffix
      tf: parsed.tf,                 // M5
      side: parsed.side,             // BUY/SELL
      entry: parsed.entry,
      sl: parsed.sl,
      tp: parsed.tp,

      status: "NEW",
      used: false,
      taken_at: null,
      taken_by: null,
      err: null,
    };

    const { data, error } = await supabaseAdmin
      .from("signals")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("[TG] supabase insert error", error);
      return NextResponse.json(
        { ok: false, error: "supabase_insert_failed", details: error },
        { status: 500 }
      );
    }

    const ms = Date.now() - started;
    return NextResponse.json({
      ok: true,
      saved: true,
      id: data?.id,
      ms,
      chat_id: String(chatId),
      message_id: Number(messageId),
      symbol: parsed.symbol,
      side: parsed.side,
    });
  } catch (e: any) {
    console.error("[TG] route crash", e);
    return NextResponse.json(
      { ok: false, error: "route_crash", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
