// app/api/telegram/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseSignal } from '@/lib/parse';

export const runtime = 'nodejs';

function unauthorized(msg = 'unauthorized') {
  return NextResponse.json({ ok: false, error: msg }, { status: 401 });
}

export async function POST(req: Request) {
  try {
    // 1) Verify secret header (แนะนำให้ตั้งใน setWebhook ด้วย secret_token)
    const secret = req.headers.get('x-telegram-bot-api-secret-token') || '';
    const expected = process.env.WEBHOOK_SECRET || '';
    if (expected && secret !== expected) {
      return unauthorized('bad webhook secret');
    }

    // 2) Read body
    const body = await req.json();

    // Telegram update payload
    const message = body?.message;
    const chatId = message?.chat?.id ?? null;
    const messageId = message?.message_id ?? null;
    const dateUnix = message?.date ?? null; // seconds
    const rawText: string = message?.text ?? '';

    if (!chatId || !messageId) {
      if (process.env.DEBUG_LOG === 'true') {
        console.log('[TG] skip: missing chatId/messageId');
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 3) Parse
    const parsed = parseSignal(rawText);

    if (process.env.DEBUG_LOG === 'true') {
      console.log('[TG]', {
        chat_id: chatId,
        message_id: messageId,
        text_len: rawText.length,
        parsed_ok: !!parsed,
        symbol: parsed?.symbol,
        side: parsed?.side,
        entry: parsed?.entry,
      });
    }

    // 4) Insert raw เสมอ (แม้ parsed ไม่ครบก็เก็บไว้ debug)
    // ใช้ column ชุดของคุณ: raw_text, chat_id, message_id, date_ts, symbol, tf, side, entry, sl, tp, status
    const dateTs = dateUnix ? new Date(dateUnix * 1000).toISOString() : null;

    const payload: any = {
      source: 'telegram',
      chat_id: String(chatId), // ตอนนี้ใน table คุณ chat_id เป็น text -> ส่ง string ให้ตรง
      message_id: Number(messageId),
      date_ts: dateTs,
      raw_text: rawText,
      status: 'NEW',
      used: false,
    };

    // map parsed fields
    if (parsed) {
      payload.symbol_tv = parsed.symbol;     // optional
      payload.symbol = parsed.symbol;        // เก็บ symbol กลาง
      payload.tf = parsed.tf;
      payload.side = parsed.side;
      payload.entry = parsed.entry;
      payload.sl = parsed.sl;
      payload.tp = parsed.tp;

      // ถ้าอยากให้ symbol_mt5 auto ใส่ suffix ให้ทำตรงนี้ (หรือปล่อยให้ EA ทำ)
      // payload.symbol_mt5 = parsed.symbol ? `${parsed.symbol}.cm` : null;
    }

    const { error } = await supabaseAdmin.from('signals').insert(payload);

    if (error) {
      if (process.env.DEBUG_LOG === 'true') {
        console.log('[TG] insert error:', error.message);
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, saved: true });
  } catch (e: any) {
    if (process.env.DEBUG_LOG === 'true') {
      console.log('[TG] exception:', e?.message || e);
    }
    return NextResponse.json({ ok: false, error: 'server error' }, { status: 500 });
  }
}
