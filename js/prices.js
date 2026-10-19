// Market prices. History comes from data/prices.json (written twice a day by the GitHub Action);
// the current point is fetched live from ESPN's schedule feed, which carries Vivid Seats'
// get-in price and inventory for every game.
import { CONFIG } from './config.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/phi/schedule';

// ESPN dates are UTC; key games by their date in Philadelphia.
export const etDate = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function parseEspn(json) {
  const out = {};
  for (const e of json.events || []) {
    const c = e.competitions?.[0];
    const home = c?.competitors?.find(x => x.homeAway === 'home');
    if (home?.team?.abbreviation !== 'PHI') continue;
    const t = c.tickets?.[0];
    const away = c.competitors.find(x => x.homeAway === 'away');
    const done = c.status?.type?.completed;
    out[etDate(e.date)] = {
      espnId: e.id,
      opp: away?.team?.displayName,
      start: e.date,
      tv: (c.broadcasts || []).map(b => b.media?.shortName).filter(Boolean).join(', '),
      vividUrl: t?.links?.find(l => l.rel?.includes('event'))?.href?.replace(/\?wsUser=\d+/, '') || '',
      low: t?.startingPrice ?? null,
      high: t?.maxPrice ?? null,
      tickets: t?.numberAvailable ?? null,
      listings: t?.totalPostings ?? null,
      score: done ? c.competitors.map(x => `${x.team.abbreviation} ${x.score?.displayValue ?? ''}`).join(' – ') : '',
      result: done ? (home.winner ? 'W' : 'L') : '',
    };
  }
  return out;
}

export async function loadPrices({ demo, baselines } = {}) {
  const prices = { updated: null, games: {}, live: false };
  try {
    const r = await fetch(CONFIG.PRICES_URL, { cache: 'no-cache' });
    if (r.ok) Object.assign(prices, await r.json());
  } catch {}
  try {
    const live = parseEspn(await fetch(ESPN).then(r => r.json()));
    const t = new Date().toISOString();
    for (const [id, m] of Object.entries(live)) {
      const g = (prices.games[id] ||= { history: [] });
      Object.assign(g, m);
      g.history ||= [];
      if (m.low != null) {
        const last = g.history[g.history.length - 1];
        if (!last || Date.parse(t) - Date.parse(last.t) > 30 * 60e3) g.history = [...g.history, { t, low: m.low, high: m.high, n: m.tickets, posts: m.listings, live: true }];
      }
    }
    prices.live = true;
    prices.liveAt = t;
  } catch {}
  if (demo) fillDemoHistory(prices, baselines);
  return prices;
}

// Demo only: synthesize 3 weeks of plausible history ending at the live price so charts have shape.
function fillDemoHistory(prices, baselines = {}) {
  for (const [id, base] of Object.entries(baselines)) {
    const g = (prices.games[id] ||= { history: [] });
    if (g.history.length > 3) continue;
    const end = g.low ?? Math.round(base / 1.6);
    const n0 = g.tickets ?? 3300;
    let seed = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const hist = [];
    for (let d = 21; d >= 0; d--) {
      const drift = 1 + (d / 21) * (rnd() * 0.3 - 0.1);
      hist.push({
        t: new Date(Date.now() - d * 86400e3).toISOString(),
        low: Math.round(end * drift * (0.95 + rnd() * 0.1)),
        n: Math.round(n0 * (1 + d * 0.012 + rnd() * 0.02)),
        posts: Math.round((g.listings ?? 1050) * (1 + d * 0.01)),
      });
    }
    hist[hist.length - 1].low = end;
    g.history = hist;
    if (g.low == null) Object.assign(g, { low: end, tickets: hist.at(-1).n, listings: hist.at(-1).posts });
  }
  prices.demo = true;
}

// Tickets that left the market over the last N days — a rough proxy for recent sales.
export function absorbed(m, days = 7) {
  const h = m?.history;
  if (!h || h.length < 2) return null;
  const last = h[h.length - 1];
  const cutoff = Date.parse(last.t) - days * 86400e3;
  const prev = h.find(x => Date.parse(x.t) >= cutoff);
  if (!prev || prev === last || prev.n == null || last.n == null) return null;
  return prev.n - last.n;
}

export function searchLinks(g, m) {
  const d = g.dateObj;
  const mdY = `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  const opp = encodeURIComponent(g.opp);
  return [
    { label: 'Vivid Seats', href: m?.vividUrl || `https://www.vividseats.com/search?searchTerm=76ers%20${opp}` },
    { label: 'StubHub', href: `https://www.stubhub.com/secure/search?q=76ers%20${opp}%20${mdY}` },
    { label: 'SeatGeek', href: `https://seatgeek.com/search?search=76ers%20${opp}` },
    { label: 'TickPick', href: `https://www.tickpick.com/search?q=76ers%20${opp}` },
    { label: 'Ticketmaster', href: `https://www.ticketmaster.com/search?q=76ers%20${opp}` },
  ];
}
