// lib/parse.ts
export type ParsedSignal = {
  symbol: string | null; // BTCUSD / XAUUSD
  tf: string | null; // M5 / H1 ...
  side: 'BUY' | 'SELL' | 'CLOSE' | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
};

function toNumberSafe(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseSignal(rawText: string): ParsedSignal | null {
  const text = (rawText || '').trim();
  if (!text) return null;

  // เราโฟกัสเฉพาะ ENTRY ก่อน (ตามที่คุณใช้จริง)
  // ✅ ENTRY LONG -> BUY
  // ✅ ENTRY SHORT -> SELL
  // ถ้ามีคำว่า EXIT/CLOSE ให้เป็น CLOSE (optional)
  const isEntryLong = /ENTRY\s+LONG/i.test(text);
  const isEntryShort = /ENTRY\s+SHORT/i.test(text);
  const isClose = /(EXIT|CLOSE)\b/i.test(text);

  let side: ParsedSignal['side'] = null;
  if (isEntryLong) side = 'BUY';
  else if (isEntryShort) side = 'SELL';
  else if (isClose) side = 'CLOSE';
  else return null; // ไม่ใช่สัญญาณที่เราต้องการ

  // symbol + tf:  "BTCUSD | TF : M5"
  // รองรับเว้นวรรคหลากหลาย
  const symTf = text.match(/([A-Z0-9_\.]+)\s*\|\s*TF\s*[:：]\s*([A-Z0-9]+)/i);
  const symbol = symTf?.[1]?.toUpperCase() ?? null;
  const tf = symTf?.[2]?.toUpperCase() ?? null;

  // Entry/SL/TP: "Entry: 5086.72"
  const entry = toNumberSafe(text.match(/Entry\s*[:：]\s*([0-9\.,]+)/i)?.[1]);
  const sl = toNumberSafe(text.match(/\bSL\s*[:：]\s*([0-9\.,]+)/i)?.[1]);
  const tp = toNumberSafe(text.match(/\bTP\s*[:：]\s*([0-9\.,]+)/i)?.[1]);

  return { symbol, tf, side, entry, sl, tp };
}
