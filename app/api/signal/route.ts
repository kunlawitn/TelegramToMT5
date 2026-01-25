import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";

const KV_KEY_LATEST = "latest_signal";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";

  if (!process.env.SIGNAL_SECRET || key !== process.env.SIGNAL_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const signal = await kv.get(KV_KEY_LATEST);

  if (!signal) {
    return NextResponse.json({ ok: true, empty: true });
  }

  return NextResponse.json({ ok: true, signal });
}
