// lib/parse.ts

type Side = "BUY" | "SELL";

function normalizeNumber(s: string): number | null {
  // รองรับ 5067,49 -> 5067.49 และลบ comma ที่เป็น thousands (ถ้ามี)
  const cleaned = s
    .trim()
    .replace(/\s+/g, "")
    .replace(/,/g, "."); // เคสคุณใช้ comma เป็น decimal

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseSignalFromText(text: string): {
  ok: boolean;
  error?: string;
  symbol?: string;
  tf?: string;
  side?: Side;
  entry?: number;
  sl?: number;
  tp?: number;
} {
  const t = text || "";

  // ต้องมี ENTRY LONG/SHORT เท่านั้นถึงจะถือเป็นสัญญาณเข้า
  const isLong = /ENTRY\s+LONG/i.test(t);
  const isShort = /ENTRY\s+SHORT/i.test(t);
  if (!isLong && !isShort) {
    return { ok: false, error: "missing_entry_long_short" };
  }

  const side: Side = isLong ? "BUY" : "SELL";

  // หา symbol และ TF
  // รูปแบบ: "XAUUSD | TF : M5"
  const mSymTf = t.match(/([A-Z0-9._-]+)\s*\|\s*TF\s*[:=]\s*([A-Z0-9]+)/i);
  const symbol = mSymTf?.[1]?.toUpperCase();
  const tf = mSymTf?.[2]?.toUpperCase();

  if (!symbol || !tf) {
    return { ok: false, error: "missing_symbol_or_tf" };
  }

  // Entry/SL/TP
  const mEntry = t.match(/Entry\s*:\s*([0-9.,]+)/i);
  const mSL = t.match(/\bSL\s*:\s*([0-9.,]+)/i);
  const mTP = t.match(/\bTP\s*:\s*([0-9.,]+)/i);

  const entry = mEntry ? normalizeNumber(mEntry[1]) : null;
  const sl = mSL ? normalizeNumber(mSL[1]) : null;
  const tp = mTP ? normalizeNumber(mTP[1]) : null;

  if (entry == null || sl == null || tp == null) {
    return { ok: false, error: "missing_or_bad_entry_sl_tp" };
  }

  return { ok: true, symbol, tf, side, entry, sl, tp };
}
