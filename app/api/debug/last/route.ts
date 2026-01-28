// app/api/debug/last/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getQ(req: Request) {
  const url = new URL(req.url);
  return url.searchParams;
}

export async function GET(req: Request) {
  const started = Date.now();
  const q = getQ(req);

  // ---- auth (เหมือน /api/signal) ----
  const key = q.get("key") || "";
  const expected = process.env.SIGNAL_SECRET || "";

  if (!expected) return json({ ok: false, error: "SIGNAL_SECRET env missing" }, 500);
  if (key !== expected) return json({ ok: false, error: "unauthorized" }, 401);

  // ---- filters ----
  const chatId = q.get("chat_id"); // optional
  const limit = Math.min(Math.max(Number(q.get("limit") || 10), 1), 50);

  // ---- 1) latest signals ----
  let signalsQuery = supabaseAdmin
    .from("signals")
    .select(
      "id,created_at,source,chat_id,message_id,symbol,symbol_tv,symbol_mt5,tf,side,entry,sl,tp,status,used,taken_at,taken_by,err,raw_text,date_ts"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (chatId) signalsQuery = signalsQuery.eq("chat_id", chatId);

  const { data: signals, error: signalsErr } = await signalsQuery;

  // ---- 2) latest webhook_logs (optional table) ----
  // ถ้าไม่มีตารางนี้ จะจับ error แล้วคืน logs_skipped=true
  let logs: any[] | null = null;
  let logsErr: any = null;

  try {
    let logsQuery = supabaseAdmin
      .from("webhook_logs")
      .select("created_at,source,ok,stage,chat_id,message_id,symbol,err,payload")
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 30));

    if (chatId) logsQuery = logsQuery.eq("chat_id", chatId);

    const res = await logsQuery;
    logs = res.data ?? null;
    logsErr = res.error ?? null;
  } catch (e: any) {
    logs = null;
    logsErr = { message: e?.message || String(e) };
  }

  const ms = Date.now() - started;

  // สรุปสั้นๆให้ดูง่าย
  const latestSignal = signals && signals.length > 0 ? signals[0] : null;
  const latestLog = logs && logs.length > 0 ? logs[0] : null;

  return json({
    ok: true,
    ms,
    filters: { chat_id: chatId ?? null, limit },
    signals_ok: !signalsErr,
    signals_error: signalsErr || null,
    latest_signal: latestSignal,
    signals: signals || [],
    logs_ok: !logsErr,
    logs_error: logsErr || null,
    latest_log: latestLog,
    logs: logs || [],
  });
}
