import crypto from 'crypto';

export type ParsedSignal = {
  id: string;
  source: 'TradingView->Telegram';
  symbol_tv: string;
  symbol_mt5: 'XAUUSD.cm';
  tf: string;
  side: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp: number;
  ts: number;
  raw: string; // เก็บต้นฉบับไว้ debug
};

function grabNumber(text: string, label: string): number | null {
  const m = text.match(
    new RegExp(`${label}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, 'i')
  );
  return m ? Number(m[1]) : null;
}

export function parseEasyGoldSniper(text: string): ParsedSignal | null {
  // ตรวจ side
  const isLong = /ENTRY\s+LONG|ENTRY\s+BUY|✅\s*ENTRY\s+LONG/i.test(text);
  const isShort = /ENTRY\s+SHORT|ENTRY\s+SELL|✅\s*ENTRY\s+SHORT/i.test(text);
  const side: 'BUY' | 'SELL' | null = isLong ? 'BUY' : isShort ? 'SELL' : null;
  if (!side) return null;

  // Symbol/TF ตัวอย่าง: XAUUSD | TF : M5
  const symTf = text.match(/([A-Z0-9\._]+)\s*\|\s*TF\s*:\s*([A-Za-z0-9]+)/);
  if (!symTf) return null;

  const entry = grabNumber(text, 'Entry');
  const sl = grabNumber(text, 'SL');
  const tp = grabNumber(text, 'TP');
  if (entry == null || sl == null || tp == null) return null;

  // id กันซ้ำ (hash จากข้อความทั้งก้อน)
  const id = crypto.createHash('md5').update(text, 'utf8').digest('hex');

  return {
    id,
    source: 'TradingView->Telegram',
    symbol_tv: symTf[1],
    symbol_mt5: 'XAUUSD.cm',
    tf: symTf[2],
    side,
    entry,
    sl,
    tp,
    ts: Math.floor(Date.now() / 1000),
    raw: text,
  };
}
