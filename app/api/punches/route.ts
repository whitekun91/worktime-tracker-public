import { NextResponse } from "next/server";
import {
  ensureSchema,
  getSql,
  isDbConfigured,
  parseDeviceId,
  runRetentionCleanup,
} from "@/lib/db";

export const runtime = "nodejs";

type Row = { id: string; type: "in" | "out"; at: string };

function asRows<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}

function rowToPunch(r: Row) {
  const at = typeof r.at === "string" ? r.at : new Date(r.at).toISOString();
  return { id: r.id, type: r.type, at };
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ configured: false as const, punches: [] as Row[] });
  }

  const deviceId = parseDeviceId(request.headers.get("x-device-id"));
  if (!deviceId) {
    return NextResponse.json({ error: "A valid x-device-id header is required." }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    await runRetentionCleanup(sql);

    const rows = await sql`
      SELECT id::text, type, at::text
      FROM punches
      WHERE device_id = ${deviceId}
      ORDER BY at ASC
    `;

    return NextResponse.json({
      configured: true as const,
      punches: asRows<Row>(rows).map(rowToPunch),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load punches from the database." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const deviceId = parseDeviceId(request.headers.get("x-device-id"));
  if (!deviceId) {
    return NextResponse.json({ error: "A valid x-device-id header is required." }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    await runRetentionCleanup(sql);

    const last = await sql`
      SELECT type FROM punches
      WHERE device_id = ${deviceId}
      ORDER BY at DESC
      LIMIT 1
    `;

    const lastList = asRows<{ type: string }>(last);
    const lastRow = lastList[0];
    const isWorking = lastRow?.type === "in";
    const nextType = isWorking ? "out" : "in";

    const inserted = await sql`
      INSERT INTO punches (device_id, type)
      VALUES (${deviceId}, ${nextType})
      RETURNING id::text, type, at::text
    `;

    const insertedList = asRows<Row>(inserted);
    const row = insertedList[0];
    if (!row) {
      return NextResponse.json({ error: "Could not read inserted punch." }, { status: 500 });
    }
    return NextResponse.json({ punch: rowToPunch(row) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save punch." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  const deviceId = parseDeviceId(request.headers.get("x-device-id"));
  if (!deviceId) {
    return NextResponse.json({ error: "A valid x-device-id header is required." }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensureSchema(sql);
    await sql`DELETE FROM punches WHERE device_id = ${deviceId}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete punches." }, { status: 500 });
  }
}
