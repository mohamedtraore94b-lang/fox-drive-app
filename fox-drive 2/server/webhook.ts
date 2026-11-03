import "./env.ts";
import { hmacHex, safeEqual } from "./crypto.ts";
import { waConfig, handleWebhookPayload } from "./whatsapp.ts";

/** Webhook WhatsApp (Meta) : vérification de l'URL (GET) et réception des réponses / statuts (POST signé). */
export async function webhook(req: Request): Promise<Response> {
  const cfg = await waConfig();
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (cfg?.verifyToken && url.searchParams.get("hub.mode") === "subscribe" && safeEqual(url.searchParams.get("hub.verify_token") || "", cfg.verifyToken)) {
      return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();
  if (!cfg?.appSecret) return new Response("App secret manquant", { status: 403 });
  const sig = (req.headers.get("x-hub-signature-256") || "").replace(/^sha256=/, "");
  if (!sig || !safeEqual(sig, hmacHex(cfg.appSecret, raw))) return new Response("Signature invalide", { status: 403 });
  try { await handleWebhookPayload(JSON.parse(raw)); } catch (e) { console.error("webhook", e); return new Response("error", { status: 500 }); }
  return new Response("ok", { status: 200 });
}
