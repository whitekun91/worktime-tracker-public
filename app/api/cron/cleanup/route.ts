import { NextResponse } from "next/server";
import { ensureSchema, getSql, isDbConfigured, runRetentionCleanup } from "@/lib/db";

export const runtime = "nodejs";

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) {
    return true;
  }
  if (request.headers.get("x-vercel-cron") === "1") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_database" });
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    await runRetentionCleanup(sql);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "cleanup_failed" }, { status: 500 });
  }
}
