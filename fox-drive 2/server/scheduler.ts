import "./env.ts";
import { q } from "./db.ts";
import { runContactsSync, runFoxSync } from "./sync.ts";
import { sourceConfigured } from "./sheets.ts";
import { continueAutoSending, dailyRun } from "./campaigns.ts";
import { getSetting, setSetting } from "./settings.ts";

const SYNC_EVERY_MS = Number(process.env.SYNC_EVERY_MINUTES || 15) * 60_000;
const DAILY_HOUR_PARIS = Number(process.env.DAILY_HOUR || 8);

let busy = false;
async function guarded(name: string, fn: () => Promise<any>) {
  if (busy) return;
  busy = true;
  try { console.log(name, JSON.stringify(await fn())); } catch (e: any) { console.error(name, "erreur :", e?.message || e); } finally { busy = false; }
}

/** Relit la feuille Google, met la flotte à jour, reprend les envois automatiques en cours. */
export async function syncTick() {
  if (await sourceConfigured()) {
    try { console.log("sync chauffeurs", JSON.stringify(await runFoxSync({ origin: "auto" }))); } catch (e: any) { console.error("sync chauffeurs :", e?.message || e); }
    try { console.log("sync contacts", JSON.stringify(await runContactsSync())); } catch (e: any) { console.error("sync contacts :", e?.message || e); }
  }
  return await continueAutoSending();
}

/** Prépare la relance du jour une seule fois par jour, à partir de 8 h (heure de Paris), même après un redémarrage. */
export async function dailyTick(now = new Date()) {
  const paris = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => paris.find((p) => p.type === t)?.value || "";
  const day = `${get("year")}-${get("month")}-${get("day")}`, hour = Number(get("hour")) % 24;
  if (hour < DAILY_HOUR_PARIS) return { status: "too-early" };
  const last = (await getSetting<any>("daily_state"))?.day;
  if (last === day) return { status: "already-done" };
  const out = await dailyRun();
  await setSetting("daily_state", { day });
  return out;
}

export function startScheduler() {
  const timers: NodeJS.Timeout[] = [];
  timers.push(setInterval(() => { guarded("sync", syncTick); }, SYNC_EVERY_MS));
  timers.push(setInterval(() => { guarded("relance du jour", () => dailyTick()); }, 5 * 60_000));
  setTimeout(() => { guarded("sync", syncTick); }, 20_000);
  setTimeout(() => { guarded("relance du jour", () => dailyTick()); }, 40_000);
  return () => timers.forEach(clearInterval);
}
