import "./env.ts";
import { q } from "./db.ts";
import * as L from "../public/lib.js";
import { loadDrivers } from "./repo.ts";
import { relanceTargets } from "./campaigns.ts";

/**
 * Compte rendu : qui a envoyé sa vérification / des photos sur la période, et qui reste à relancer.
 * Deux sources pour « a envoyé » : une vérification enregistrée (FoxDrive via la feuille, ou cochée à la main)
 * et les photos reçues sur WhatsApp (quand WhatsApp Business est relié).
 */
export async function buildReport(hours = 24, now = L.todayDate()) {
  const h = Math.min(Math.max(Math.round(Number(hours) || 24), 1), 24 * 14);
  const drivers = await loadDrivers();
  const byId = new Map(drivers.map((d: any) => [d.id, d]));
  const active = drivers.filter(L.isActive);

  const ver = await q(
    `SELECT driver_id AS id, max(ts) AS ts FROM events
      WHERE type = 'verif' AND driver_id IS NOT NULL AND ts > now() - make_interval(hours => $1::int) GROUP BY driver_id`, [h]);
  const photos = await q(
    `SELECT driver_id AS id, max(ts) AS ts, count(*)::int AS n FROM messages
      WHERE direction = 'in' AND body = '[photo]' AND driver_id IS NOT NULL AND ts > now() - make_interval(hours => $1::int) GROUP BY driver_id`, [h]);
  const unknownPhotos = await q(
    `SELECT phone, max(ts) AS ts FROM messages
      WHERE direction = 'in' AND body = '[photo]' AND driver_id IS NULL AND ts > now() - make_interval(hours => $1::int) GROUP BY phone`, [h]);
  const texts = await q(
    `SELECT driver_id AS id, max(ts) AS ts, (array_agg(body ORDER BY ts DESC))[1] AS body FROM messages
      WHERE direction = 'in' AND body <> '[photo]' AND driver_id IS NOT NULL AND ts > now() - make_interval(hours => $1::int) GROUP BY driver_id`, [h]);

  const iso = (v: any) => (v ? new Date(v).toISOString() : null);
  const card = (d: any) => ({ id: d.id, name: d.name, plate: L.fmtPlate(d.plate), agency: d.agency || "" });

  const sent = new Map<number, any>();
  ver.forEach((r: any) => { const d: any = byId.get(Number(r.id)); if (d && L.isActive(d)) sent.set(d.id, { ...card(d), via: ["vérification enregistrée"], at: iso(r.ts) }); });
  photos.forEach((r: any) => {
    const d: any = byId.get(Number(r.id)); if (!d || !L.isActive(d)) return;
    const cur = sent.get(d.id) || { ...card(d), via: [], at: iso(r.ts) };
    cur.via.push(r.n > 1 ? r.n + " photos WhatsApp" : "photo WhatsApp");
    if (!cur.at || iso(r.ts)! > cur.at) cur.at = iso(r.ts);
    sent.set(d.id, cur);
  });
  // photos reçues mais vérification pas encore enregistrée : à valider à la main (✓), et on ne les relance pas
  const photoIds = new Set(photos.map((r: any) => Number(r.id)));
  const received = [...sent.values()].map((x: any) => {
    const d: any = byId.get(x.id);
    return { ...x, toRegister: photoIds.has(x.id) && L.dueStatus(d, now) === "overdue" };
  }).sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)));

  const t = relanceTargets(drivers, now);
  const late = (d: any) => (L.neverSent(d) ? null : -(L.daysToDue(d, now) ?? 0));
  const row = (d: any) => ({ ...card(d), never: L.neverSent(d), lateDays: late(d) });
  const order = (a: any, b: any) => (Number(b.never) - Number(a.never)) || ((b.lateDays || 0) - (a.lateDays || 0)) || a.name.localeCompare(b.name, "fr");
  const toRelance = t.ready.filter((d: any) => !photoIds.has(d.id) && !sent.has(d.id)).map(row).sort(order);
  const overdue = active.filter((d: any) => L.dueStatus(d, now) === "overdue");
  const waiting = overdue.filter((d: any) => L.normPhone(d.phone).ok && L.recentlyContacted(d, now) && !sent.has(d.id)).map(row).sort(order);
  const noPhone = overdue.filter((d: any) => !L.normPhone(d.phone).ok).map(row).sort(order);
  const replies = texts.map((r: any) => { const d: any = byId.get(Number(r.id)); return d ? { ...card(d), at: iso(r.ts), text: String(r.body || "").slice(0, 140) } : null; }).filter(Boolean);

  const byAgency: Record<string, number> = {};
  toRelance.forEach((d: any) => { byAgency[d.agency] = (byAgency[d.agency] || 0) + 1; });

  return {
    generatedAt: new Date().toISOString(), hours: h,
    counts: { active: active.length, overdue: overdue.length, neverSent: active.filter((d: any) => L.neverSent(d)).length, received: received.length, toRelance: toRelance.length, waiting: waiting.length, noPhone: noPhone.length },
    received, toRelance, waiting, noPhone, replies, byAgency, unknownPhotos: unknownPhotos.map((r: any) => ({ phone: r.phone, at: iso(r.ts) })),
  };
}

/** Enregistre la photo du jour (8 h) : on garde l'historique pour comparer d'un jour à l'autre. */
export async function saveDailySnapshot() {
  const data = await buildReport(24);
  await q("INSERT INTO daily_reports (day, data) VALUES ($1, $2) ON CONFLICT (day) DO UPDATE SET data = EXCLUDED.data, created_at = now()", [L.toISO(L.todayDate()), JSON.stringify(data)]);
  return data.counts;
}

export async function listReports(limit = 14) {
  const rows = await q("SELECT to_char(day, 'YYYY-MM-DD') AS day, data->'counts' AS counts FROM daily_reports ORDER BY day DESC LIMIT $1", [limit]);
  return rows.map((r: any) => ({ day: r.day, counts: r.counts }));
}
