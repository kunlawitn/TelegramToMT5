// app/api/signal/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

function unauthorized(msg = 'unauthorized') {
  return NextResponse.json({ ok: false, error: msg }, { status: 401 });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get('key') || '';
    const chatId = url.searchParams.get('chat_id') || '';
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase(); // BTCUSD / XAUUSD
    const takeBy = url.searchParams.get('by') || ''; // optional: terminal name

    const expectedKey = process.env.SIGNAL_SECRET || '';
    if (!expectedKey || key !== expectedKey) return unauthorized();

    if (!chatId) {
      return NextResponse.json({ ok: false, error: 'missing chat_id' }, { status: 400 });
    }

    // filter: NEW + chat_id + (symbol match ถ้าส่งมา)
    let q = supabaseAdmin
      .from('signals')
      .select('*')
      .eq('status', 'NEW')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(1);

    // ถ้าส่ง symbol มา ให้กรองเพิ่ม
    // คุณมีทั้ง symbol และ symbol_tv / symbol_mt5
    if (symbol) {
      q = q.or(`symbol.eq.${symbol},symbol_tv.eq.${symbol},symbol_mt5.ilike.${symbol}%`);
    }

    const { data, error } = await q;

    if (error) {
      if (process.env.DEBUG_LOG === 'true') console.log('[SIG] select error:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ ok: true, empty: true });
    }

    const sig = data[0];

    // mark TAKEN กันแย่งกันยิง (EA หลายตัว)
    const updatePayload: any = {
      status: 'TAKEN',
      used: true,
      taken_at: new Date().toISOString(),
      taken_by: takeBy || 'mt5',
    };

    const { error: upErr } = await supabaseAdmin.from('signals').update(updatePayload).eq('id', sig.id);

    if (upErr && process.env.DEBUG_LOG === 'true') {
      console.log('[SIG] update TAKEN error:', upErr.message);
      // ถึง update fail ก็ยังส่ง signal ไปก่อน เพื่อไม่ให้ EA พลาด
    }

    // ส่งกลับให้ EA ใช้ได้ทันที
    return NextResponse.json({
      ok: true,
      signal: {
        id: sig.id,
        chat_id: sig.chat_id,
        symbol_tv: sig.symbol_tv,
        symbol_mt5: sig.symbol_mt5,
        symbol: sig.symbol,
        tf: sig.tf,
        side: sig.side,
        entry: sig.entry,
        sl: sig.sl,
        tp: sig.tp,
        raw_text: sig.raw_text,
        created_at: sig.created_at,
      },
    });
  } catch (e: any) {
    if (process.env.DEBUG_LOG === 'true') console.log('[SIG] exception:', e?.message || e);
    return NextResponse.json({ ok: false, error: 'server error' }, { status: 500 });
  }
}
