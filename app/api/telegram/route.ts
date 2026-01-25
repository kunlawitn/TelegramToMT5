import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { parseEasyGoldSniper } from "@/lib/parse";

export const runtime = "nodejs"; // ให้ใช้ node runtime

const KV_KEY_LATEST = "latest_signal";
const KV_KEY_LAST_ID = "latest_signal_id";

export async function POST(req: Request) {
  // 1) ตรวจ secret (ง่ายและกันมั่วได้ดี)
  const secret = req.headers.get("x-webhook-secret") || "";
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2) รับ update จาก Telegram
  const update = await req.json();
  const msg = update.message || update.channel_post;
  const text: string = msg?.text || "";

  // 3) parse ตามรูปแบบ EasyGoldSniper
  const signal = parseEasyGoldSniper(text);
  if (!signal) {
    // ไม่ใช่สัญญาณที่เราต้องการ ก็ตอบ ok ไป (Telegram ต้องการ 200)
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 4) กันซ้ำใน server-side อีกชั้น
  const lastId = (await kv.get<string>(KV_KEY_LAST_ID)) || "";
  if (lastId === signal.id) {
    return NextResponse.json({ ok: true, duplicated: true });
  }

  // 5) บันทึก KV
  await kv.set(KV_KEY_LATEST, signal);
  await kv.set(KV_KEY_LAST_ID, signal.id);

  return NextResponse.json({ ok: true, saved: true, id: signal.id });
}
