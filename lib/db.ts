import { neon } from "@neondatabase/serverless";

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
}

export type SqlClient = ReturnType<typeof neon>;

let sqlInstance: SqlClient | null = null;

export function getSql(): SqlClient {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!sqlInstance) {
    sqlInstance = neon(url);
  }
  return sqlInstance;
}

export function isDbConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(sql: SqlClient): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS punches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          device_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('in', 'out')),
          at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_punches_device_at ON punches (device_id, at ASC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_punches_at ON punches (at)
      `;
    })();
  }
  return schemaReady;
}

export async function runRetentionCleanup(sql: SqlClient): Promise<void> {
  await sql`DELETE FROM punches WHERE at < NOW() - INTERVAL '7 days'`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseDeviceId(header: string | null): string | null {
  if (!header || header.length > 64) return null;
  if (!UUID_RE.test(header.trim())) return null;
  return header.trim();
}
