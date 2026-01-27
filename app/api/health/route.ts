// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // ดึง 1 แถวล่าสุดเพื่อยืนยันว่าตารางอ่านได้จริง
    // (เลือกคอลัมน์ที่ "มีอยู่จริง" ตาม schema ของคุณ)
    const { data, error } = await supabaseAdmin
      .from('signals')
      .select(
        'id, created_at, chat_id, message_id, symbol, symbol_tv, symbol_mt5, tf, side, entry, sl, tp, status, used, taken_at, taken_by, err, raw_text'
      )
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.details, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      latest: data?.[0] ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'server error' },
      { status: 500 }
    );
  }
}
