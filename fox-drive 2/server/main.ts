/* Serveur de production : fichiers du site + API + webhook WhatsApp + tâches planifiées, dans un seul processus Node. */
import "./env.ts";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { closePool, q } from "./db.ts";
import { migrate } from "./migrate.ts";
import { dispatch } from "./routes.ts";
import { webhook } from "./webhook.ts";
import { startScheduler } from "./scheduler.ts";

const ROOT = path.resolve(import.meta.dirname, "../public");
const PORT = Number(process.env.PORT) || 8080;
const MAX_BODY = 12 * 1024 * 1024;
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};
const SECURITY: Record<string, string> = {
  "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "x-robots-tag": "noindex, nofollow",
  "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=15552000",
};

async function toRequest(rq: http.IncomingMessage): Promise<Request> {
  const proto = String(rq.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const url = new URL(rq.url || "/", `${proto}://${rq.headers.host || "localhost"}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(rq.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  let body: Buffer | undefined;
  if (!["GET", "HEAD"].includes(rq.method || "GET")) {
    const chunks: Buffer[] = []; let n = 0;
    for await (const c of rq) { n += (c as Buffer).length; if (n > MAX_BODY) throw Object.assign(new Error("trop gros"), { code: 413 }); chunks.push(c as Buffer); }
    body = Buffer.concat(chunks);
  }
  return new Request(url, { method: rq.method, headers, body });
}

async function send(rs: http.ServerResponse, r: Response) {
  const h: Record<string, string | string[]> = { ...SECURITY };
  r.headers.forEach((v, k) => { if (k !== "set-cookie") h[k] = v; });
  const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
  if (sc && sc.length) h["set-cookie"] = sc;
  rs.writeHead(r.status, h);
  rs.end(Buffer.from(await r.arrayBuffer()));
}

function serveStatic(rq: http.IncomingMessage, rs: http.ServerResponse, pathname: string) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    rs.writeHead(404, { ...SECURITY, "content-type": "text/plain; charset=utf-8" }); rs.end("Page introuvable"); return;
  }
  const st = fs.statSync(file);
  const etag = '"' + crypto.createHash("sha1").update(st.size + ":" + st.mtimeMs).digest("hex").slice(0, 20) + '"';
  const headers = { ...SECURITY, "content-type": MIME[path.extname(file)] || "application/octet-stream", etag, "cache-control": "no-cache" };
  if (rq.headers["if-none-match"] === etag) { rs.writeHead(304, headers); rs.end(); return; }
  rs.writeHead(200, { ...headers, "content-length": st.size });
  if (rq.method === "HEAD") rs.end(); else fs.createReadStream(file).pipe(rs);
}

const server = http.createServer(async (rq, rs) => {
  try {
    const pathname = new URL(rq.url || "/", "http://x").pathname;
    if (pathname === "/healthz") {
      try { await q("SELECT 1"); rs.writeHead(200, { "content-type": "text/plain" }); rs.end("ok"); }
      catch { rs.writeHead(503, { "content-type": "text/plain" }); rs.end("db"); }
      return;
    }
    if (pathname.startsWith("/api/")) return await send(rs, await dispatch(await toRequest(rq)));
    if (pathname === "/webhooks/whatsapp") return await send(rs, await webhook(await toRequest(rq)));
    if (rq.method !== "GET" && rq.method !== "HEAD") { rs.writeHead(405, SECURITY); rs.end(); return; }
    serveStatic(rq, rs, pathname);
  } catch (e: any) {
    if (e?.code === 413) { rs.writeHead(413, SECURITY); rs.end("Fichier trop gros"); return; }
    console.error("requête :", e);
    if (!rs.headersSent) rs.writeHead(500, SECURITY);
    rs.end("Erreur interne");
  }
});

async function main() {
  if (!process.env.APP_SECRET || process.env.APP_SECRET.length < 16) throw new Error("APP_SECRET manquant (16 caractères minimum).");
  const applied = await migrate();
  if (applied.length) console.log("migrations appliquées :", applied.join(", "));
  const stop = startScheduler();
  server.listen(PORT, "0.0.0.0", () => console.log("Fox Drive prêt sur le port " + PORT));
  const bye = async () => { stop(); server.close(); await closePool(); process.exit(0); };
  process.on("SIGTERM", bye); process.on("SIGINT", bye);
}
main().catch((e) => { console.error("Démarrage impossible :", e?.message || e); process.exit(1); });
