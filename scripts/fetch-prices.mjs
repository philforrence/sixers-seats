// Snapshot 76ers home-game resale prices into data/prices.json.
// Run by .github/workflows/prices.yml twice a day; safe to run locally: `node scripts/fetch-prices.mjs`.
//
// Source 1 (always): ESPN's team schedule feed, which includes Vivid Seats' lowest price,
//                    highest price, tickets available and listing count per game.
// Source 2 (optional): SeatGeek Platform API, if SEATGEEK_CLIENT_ID is set (adds avg/median).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseEspn } from '../js/prices.js';

const OUT = new URL('../data/prices.json', import.meta.url);
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/phi/schedule';
const MAX_POINTS = 500;

const etDate = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

async function seatGeek() {
  const id = process.env.SEATGEEK_CLIENT_ID;
  if (!id) return {};
  const url = `https://api.seatgeek.com/2/events?performers.slug=philadelphia-76ers&venue.city=philadelphia&per_page=100&client_id=${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) { console.warn('SeatGeek', res.status, await res.text()); return {}; }
  const out = {};
  for (const e of (await res.json()).events || []) {
    if (!/76ers/i.test(e.title) || e.type !== 'nba') continue;
    const s = e.stats || {};
    out[etDate(e.datetime_utc + 'Z')] = { sgUrl: e.url, sgLow: s.lowest_price ?? null, sgAvg: s.average_price ?? null, sgMed: s.median_price ?? null, sgCount: s.listing_count ?? null };
  }
  return out;
}

const prev = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => ({ games: {} }));
const res = await fetch(ESPN, { headers: { 'User-Agent': 'sixers-seats/1.0' } });
if (!res.ok) throw new Error(`ESPN ${res.status}`);
const live = parseEspn(await res.json());
const sg = await seatGeek().catch(e => (console.warn('SeatGeek failed', e.message), {}));

const t = new Date().toISOString();
const games = prev.games || {};
for (const [id, m] of Object.entries(live)) {
  const g = (games[id] ||= { history: [] });
  const s = sg[id] || {};
  const { low, high, tickets, listings, ...meta } = m;
  Object.assign(g, meta, s, { low, high, tickets, listings });
  if (low != null) {
    const point = { t, low, high, n: tickets, posts: listings };
    if (s.sgMed != null) Object.assign(point, { sgLow: s.sgLow, sgMed: s.sgMed, sgAvg: s.sgAvg });
    g.history = [...(g.history || []), point].slice(-MAX_POINTS);
  }
}

await mkdir(dirname(OUT.pathname), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: t, source: 'Vivid Seats via ESPN' + (Object.keys(sg).length ? ' + SeatGeek' : ''), games }, null, 0) + '\n');
console.log(`Saved ${Object.keys(live).length} games at ${t}`);
