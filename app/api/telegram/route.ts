// app/api/telegram/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseSignalFromText } from "@/lib/parse";
import { randomUUID } from "crypto";

export const runtime = "nodejs"; // ชัวร์ว่าใช้ node runtime

function envBool(name: string) {
  return (process.env[name] || "").toLowerCase() === "true";
}

const DEBUG = envBool("DEBUG_LOG"); // ตั้งใน Vercel: DEBUG_LOG=true

function dbg(...args: any[]) {
  if (DEBUG) console.log(...args);
}

function getHeader(req: Request, name: string) {
  // headers ใน fetch เป็น case-insensitive อยู่แล้ว แต่เผื่อไว้
  return req.headers.get(name) || req.headers.get(name.toLowerCase());
}

// ---- optional: write debug to DB (ถ้าไม่มี table ก็ไม่เป็นไร) ----
async function safeWebhookLog(row: any) {
  try {
    // ถ้าคุณมีตาราง webhook_logs แนะนำสร้างคอลัมน์พื้นฐาน:
    // created_at timestamptz default now()
    // source text, ok bool, stage text, chat_id text, message_id bigint, symbol text, err text, payload jsonb
    await supabaseAdmin.from("webhook_logs").insert(row);
  } catch (e: any) {
    // ห้ามทำให้ main flow ล่ม
    if (DEBUG) console.log("[TG] webhook_logs skipped:", e?.message || e);
  }
}

export async function POST(req: Request) {
  const started = Date.now();

  // เก็บ payload ไว้ช่วยดีบัก (แต่อย่าทำให้ crash ถ้าอ่านไม่ได้)
  let rawBody: any = null;

  try {
    // 1) Verify Telegram secret header
    const expected = process.env.WEBHOOK_SECRET || process.env.WEBHOOK_SECRET?.trim() || "";
    const got =
      getHeader(req, "x-telegram-bot-api-secret-token") ||
      getHeader(req, "X-Telegram-Bot-Api-Secret-Token") ||
      "";

    if (!expected) {
      await safeWebhookLog({
        source: "telegram",
        ok: false,
        stage: "env_missing",
        chat_id: null,
        message_id: null,
        symbol: null,
        err: "WEBHOOK_SECRET env missing",
        payload: null,
      });
      return NextResponse.json(
        { ok: false, error: "WEBHOOK_SECRET env missing" },
        { status: 500 }
      );
    }

    if (got !== expected) {
      await safeWebhookLog({
        source: "telegram",
        ok: false,
        stage: "unauthorized",
        chat_id: null,
        message_id: null,
        symbol: null,
        err: "unauthorized secret",
        payload: null,
      });
      dbg("[TG] unauthorized secret", { gotLen: got.length });
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // 2) Read body (Telegram update)
    rawBody = await req.json().catch(() => null);

    // Telegram ส่งมาได้หลายชนิด message / channel_post / edited_* / callback_query
    const update =
      rawBody?.message ??
      rawBody?.channel_post ??
      rawBody?.edited_message ??
      rawBody?.edited_channel_post ??
      rawBody?.callback_query?.message ??
      null;
    if (!update) {
      await safeWebhookLog({
        source: "telegram",
        ok: true,
        stage: "no_update_object",
        chat_id: null,
        message_id: null,
        symbol: null,
        err: null,
        payload: rawBody,
      });

      dbg("[TG] no message/channel_post", { keys: Object.keys(rawBody || {}) });
      return NextResponse.json({ ok: true, skipped: true, reason: "no_update_object" });
    }

    const chatId = update?.chat?.id;
    const messageId = update?.message_id;
    const date = update?.date; // epoch seconds
    const text =
      update?.text ??
      update?.caption ??
      update?.message?.text ??
      update?.message?.caption ??
      rawBody?.callback_query?.data ??
      "";
    const trimmedText = typeof text === "string" ? text.trim() : "";

    dbg("[TG] recv", {
      chatId,
      messageId,
      date,
      textLen: trimmedText.length || 0,
      preview: trimmedText.slice(0, 160),
    });

    const missingTextOnly = !!chatId && !!messageId && !trimmedText;

    if (!chatId || !messageId || missingTextOnly) {
      await safeWebhookLog({
        source: "telegram",
        ok: true,
        stage: missingTextOnly ? "missing_text_only" : "missing_required_fields",
        chat_id: chatId ? String(chatId) : null,
        message_id: messageId ? Number(messageId) : null,
        symbol: null,
        err: missingTextOnly
          ? "missing text"
          : "missing chatId/messageId/text",
    if (!chatId || !messageId || !trimmedText) {
      await safeWebhookLog({
        source: "telegram",
        ok: true,
        stage: "missing_required_fields",
        chat_id: chatId ? String(chatId) : null,
        message_id: messageId ? Number(messageId) : null,
        symbol: null,
        err: "missing chatId/messageId/text",
        payload: rawBody,
      });

      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: missingTextOnly
          ? "missing_text"
          : "missing_chatId_or_messageId_or_text",
        reason: "missing_chatId_or_messageId_or_text",
        got: { chatId, messageId, hasText: !!trimmedText },
      });
    }

    // 3) Parse signal text -> structured fields
    const parsed = parseSignalFromText(trimmedText);

    dbg("[TG] parsed", parsed);

    if (!parsed.ok) {
      await safeWebhookLog({
        source: "telegram",
        ok: true,
        stage: "not_trade_signal",
        chat_id: String(chatId),
        message_id: Number(messageId),
        symbol: null,
        err: parsed.error || "not_a_trade_signal",
        payload: rawBody,
        payload: { text: trimmedText },
      });

      // ไม่ใช่สัญญาณเข้า (WIN/EXIT/ข้อความอื่น) ก็ข้าม ไม่ต้องทำ 500
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "not_a_trade_signal",
        parse_error: parsed.error,
      });
    }

    // 4) Insert to Supabase (signals)
    // ⚠️ สำคัญ: ถ้า signals.symbol_mt5 เป็น NOT NULL ห้ามใส่ null
    // เราเก็บ "base symbol" ไว้ก่อน (เช่น XAUUSD) แล้ว EA จะไปต่อ suffix เอง
    const row = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      source: "telegram",

      chat_id: String(chatId),
      message_id: Number(messageId),
      date_ts: date ? new Date(date * 1000).toISOString() : null,

      raw_text: trimmedText,

      symbol: parsed.symbol!,      // base symbol
      symbol_tv: parsed.symbol!,   // เก็บเหมือนกันไปก่อน
      symbol_mt5: parsed.symbol!,  // ✅ ห้าม null (ให้ EA append suffix เอง)

      tf: parsed.tf!,
      side: parsed.side!,
      entry: parsed.entry!,
      sl: parsed.sl!,
      tp: parsed.tp!,

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

      await safeWebhookLog({
        source: "telegram",
        ok: false,
        stage: "supabase_insert_failed",
        chat_id: String(chatId),
        message_id: Number(messageId),
        symbol: parsed.symbol || null,
        err: error?.message || "insert_failed",
        payload: { row },
      });

      return NextResponse.json(
        { ok: false, error: "supabase_insert_failed", details: error },
        { status: 500 }
      );
    }

    const ms = Date.now() - started;

    await safeWebhookLog({
      source: "telegram",
      ok: true,
      stage: "saved",
      chat_id: String(chatId),
      message_id: Number(messageId),
      symbol: parsed.symbol || null,
      err: null,
      payload: { id: data?.id, ms },
    });

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

    await safeWebhookLog({
      source: "telegram",
      ok: false,
      stage: "route_crash",
      chat_id: null,
      message_id: null,
      symbol: null,
      err: e?.message || String(e),
      payload: rawBody,
    });

    return NextResponse.json(
      { ok: false, error: "route_crash", message: e?.message || String(e) },
      { status: 500 }
    );
  }
}
