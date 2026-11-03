import "./env.ts";
import fs from "node:fs";
import path from "node:path";
import { pool } from "./db.ts";

/** Applique, dans l'ordre, les fichiers migrations/*.sql pas encore passés. Verrou : un seul démarrage à la fois. */
export async function migrate(dir = path.resolve(import.meta.dirname, "../migrations")) {
  const c = await pool().connect();
  try {
    await c.query("SELECT pg_advisory_lock(424241)");
    await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const done = new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r: any) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied: string[] = [];
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      try {
        await c.query("BEGIN");
        await c.query(sql);
        await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
        await c.query("COMMIT");
        applied.push(f);
      } catch (e) {
        try { await c.query("ROLLBACK"); } catch { /* ignore */ }
        throw new Error("Migration " + f + " échouée : " + ((e as any)?.message || e));
      }
    }
    return applied;
  } finally {
    try { await c.query("SELECT pg_advisory_unlock(424241)"); } catch { /* ignore */ }
    c.release();
  }
}
