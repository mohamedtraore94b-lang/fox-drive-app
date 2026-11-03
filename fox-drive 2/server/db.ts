import "./env.ts";
import pg from "pg";

let override: any = null;
let real: any = null;
/** Tests : injecte un pool Postgres local. */
export function setPool(p: any) { override = p; }

export function pool(): any {
  if (override) return override;
  if (!real) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL n'est pas défini (adresse de la base Postgres).");
    // DATABASE_SSL=true : connexion chiffrée sans vérification de certificat (utile pour certaines bases managées)
    real = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX) || 8, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
    real.on("error", (e: any) => console.error("Postgres (connexion inactive) :", e?.message || e));
  }
  return real;
}
export async function closePool() { try { await real?.end(); } catch { /* ignore */ } real = null; }

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await pool().query(text, params);
  return r.rows as T[];
}

export async function tx<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    c.release();
  }
}
