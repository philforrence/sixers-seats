// Game model, derived status, price estimates, fees and the partner ledger.
import { CONFIG } from './config.js';

export const DEFAULT_SETTINGS = {
  section: '',
  row: '',
  seats: '',
  seatCount: 2,
  seasonCost: 0,          // total paid for the season, all seats
  seatMultiplier: '',     // blank = auto-calibrate
  feeTicketmaster: 15,    // seller fee %, editable in Settings
  feeStubHub: 15,
  feeSeatGeek: 10,
  feeVivid: 10,
  feeTickPick: 15,
  defaultPlatform: 'StubHub',
  resaleCap: 10,          // Ticketmaster resales allowed; contract said 10, reports said 7 — unconfirmed
  exchangeCap: 10,
  exchangesUsed: 0,
  tmBuyerFee: 20,         // approx. % Ticketmaster adds on top of your list price for buyers
  trancheStarts: '2026-10-01,2027-01-01,2027-02-15',   // first day of each selling tranche
  trancheDecideWeeks: 4,  // decide on a tranche this many weeks before its first game
  trancheDeadlines: '2026-11-01,,',   // optional fixed decide-by date per tranche (blank = automatic)
  ffDiscount: 20,         // friends & family discount, % off the friend price
  revenueTarget: 8000,    // what both seats cost for the season
  settingsVersion: 0,
};

export const FRIEND = 'Friend / Venmo';
export const PLATFORMS = ['Ticketmaster', 'StubHub', 'SeatGeek', 'Vivid', 'TickPick', 'Friend / Venmo', 'Other'];

export const feePct = (settings, platform) => {
  const key = 'fee' + (platform || '').replace(/[^A-Za-z]/g, '');
  const v = Number(settings[key]);
  return Number.isFinite(v) ? v : 0;
};

const bool = v => v === true || v === 1 || String(v).toUpperCase() === 'TRUE';
const num = v => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function parseDate(s) {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(+m[3], +m[1] - 1, +m[2]);
}
export const gameId = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Game start as a Date in local time (sheet times are Eastern; good enough for Philly folks).
export function startTime(g) {
  const d = new Date(g.dateObj);
  const m = String(g.time || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (m) {
    let h = +m[1] % 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
    d.setHours(h, +m[2]);
  } else d.setHours(19, 0);
  return d;
}

// Turn the free-text "What we actually doin" column into a plan + seat holders.
export function parseDoing(text, wantSell, decided, interest) {
  const t = String(text || '').trim();
  if (/^sold/i.test(t)) return { plan: 'sell', seats: [] };
  if (/sell|listed/i.test(t)) return { plan: 'sell', seats: [] };
  if (t) {
    const names = t.replace(/['’]s\b/g, '').replace(/\bgoing\b/gi, '').split(/\s*(?:,|&|\band\b|\+)\s*/i)
      .map(s => s.trim()).filter(Boolean);
    if (names.length) return { plan: 'use', seats: names };
  }
  if (!decided) return { plan: 'undecided', seats: [] };
  if (wantSell) return { plan: 'sell', seats: [] };
  return { plan: 'use', seats: CONFIG.PARTNERS.filter(p => interest[p]) };
}

export function doingText(g) {
  if (g.soldPrice != null) return g.qtySold && g.qtySold < seatCountOf(g) ? `SOLD ${g.qtySold} · ${holders(g).join(' and ')} going` : 'SOLD';
  if (g.plan === 'sell') return g.listPrice != null ? 'LISTED' : 'SELLING';
  if (g.plan === 'use') {
    const h = holders(g);
    if (!h.length) return '';
    return h.length === 1 ? `${h[0]}'s going` : `${h.join(' and ')} going`;
  }
  return '';
}

let _seatCount = 2;
export const setSeatCount = n => { _seatCount = Math.max(1, Number(n) || 2); };
const seatCountOf = () => _seatCount;
export const holders = g => (g.seats || []).filter(Boolean);

export function makeGame(row, app) {
  const dateObj = parseDate(row.date);
  const interest = { [CONFIG.PARTNERS[0]]: bool(row.phil), [CONFIG.PARTNERS[1]]: bool(row.andrew) };
  const parsed = parseDoing(row.doing, bool(row.wantSell), bool(row.decided), interest);
  const g = {
    id: gameId(dateObj),
    date: row.date,
    dateObj,
    day: row.day || dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
    opp: row.opp,
    time: row.time,
    monWed: /yes/i.test(row.monWed || '') || /^(Mon|Wed)/.test(row.day || ''),
    doubleheader: /yes/i.test(row.doubleheader || ''),
    note: row.note || '',
    baseline: num(row.price),
    sheetRow: row.sheetRow,
    interest,
    plan: parsed.plan,
    seats: parsed.seats,
    platform: '', listPrice: null, listedOn: '', soldPrice: null, qtySold: null, fees: null,
    payout: null, buyer: '', soldOn: '', transferred: false, paid: false, updatedBy: '', updatedAt: '', appRow: null,
    comp: null, compAt: '', compUrl: '', compNote: '', compN: null, pStretch: null, p2wk: null, p5d: null, p48h: null, hook: '',
  };
  if (app) {
    Object.assign(g, {
      plan: app.plan || g.plan,
      seats: [app.seat1, app.seat2, app.seat3, app.seat4].filter(s => s != null && s !== '').map(String),
      platform: app.platform || '',
      listPrice: num(app.listPrice),
      listedOn: app.listedOn || '',
      soldPrice: num(app.soldPrice),
      qtySold: num(app.qtySold),
      fees: num(app.fees),
      payout: num(app.payout),
      buyer: app.buyer || '',
      soldOn: app.soldOn || '',
      transferred: bool(app.transferred),
      paid: bool(app.paid),
      updatedBy: app.updatedBy || '',
      updatedAt: app.updatedAt || '',
      appRow: app.appRow,
      comp: num(app.comp),
      compAt: app.compAt || '',
      pStretch: num(app.pStretch),
      p2wk: num(app.p2wk),
      p5d: num(app.p5d),
      p48h: num(app.p48h),
      hook: app.hook || '',
    });
  }
  return g;
}

// Status shown on chips: sold > listed > selling > going > undecided; past games become "past".
export function status(g, now = new Date()) {
  if (g.soldPrice != null) return 'sold';
  if (g.plan === 'sell') return g.listPrice != null ? 'listed' : 'selling';
  if (g.plan === 'use') return 'going';
  return 'undecided';
}
export const STATUS_LABEL = { sold: 'Sold', listed: 'Listed', selling: 'To sell', going: 'Going', undecided: 'Undecided' };

export const isPast = (g, now = new Date()) => startTime(g).getTime() + 3 * 3600e3 < now.getTime();
export const daysUntil = (g, now = new Date()) => Math.ceil((startTime(g) - now) / 86400e3);

// --- Prices -----------------------------------------------------------------

export function market(prices, g) {
  return prices?.games?.[g.id] || null;
}

// How your seats compare to the arena get-in price. Learned from your sales first,
// then from the sheet's "Possible Price" vs the first market snapshot.
export function seatMultiplier(games, prices, settings) {
  const manual = num(settings.seatMultiplier);
  if (manual) return { value: manual, basis: 'set in Settings' };
  const ratios = [];
  for (const g of games) {
    const m = market(prices, g);
    if (!m?.history?.length) continue;
    if (g.soldPrice != null) {
      const at = nearestSnapshot(m.history, g.soldOn) || m.history[m.history.length - 1];
      // Ticketmaster prices are before buyer fees; market prices include them.
      const allIn = /ticketmaster/i.test(g.platform) ? g.soldPrice * (1 + (Number(settings.tmBuyerFee) || 0) / 100) : g.soldPrice;
      if (at?.low) ratios.push(['sale', allIn / at.low]);
    }
  }
  const sales = ratios.filter(r => r[0] === 'sale').map(r => r[1]);
  if (sales.length >= 2) return { value: median(sales), basis: `learned from ${sales.length} sales` };
  // Comparable listings (cheapest similar pair, all-in) vs. that game's get-in price.
  const comps = [];
  for (const g of games) {
    const m = market(prices, g);
    if (g.comp == null || !m) continue;
    const at = nearestSnapshot(m.history || [], g.compAt) || m;
    if (at?.low) comps.push(g.comp / at.low);
  }
  if (comps.length) return { value: median(comps), basis: `comparable listings in ${comps.length} game${comps.length > 1 ? 's' : ''}` };
  const base = [];
  for (const g of games) {
    const m = market(prices, g);
    const first = m?.history?.[0];
    if (g.baseline && first?.low) base.push(g.baseline / first.low);
  }
  if (base.length >= 5) return { value: median(base), basis: 'sheet prices vs. market' };
  return { value: 1, basis: 'default' };
}

function nearestSnapshot(hist, dateStr) {
  const t = Date.parse(dateStr);
  if (!t) return null;
  let best = null;
  for (const h of hist) if (!best || Math.abs(Date.parse(h.t) - t) < Math.abs(Date.parse(best.t) - t)) best = h;
  return best;
}

export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

// Estimated value of one of your tickets right now.
export function estimate(g, prices, mult) {
  if (g.soldPrice != null) return { value: g.soldPrice, basis: 'sold' };
  if (g.comp != null) return { value: g.comp, basis: 'comps' };
  const m = market(prices, g);
  if (m?.low) return { value: Math.round(m.low * mult.value), basis: 'market', low: m.low };
  if (g.baseline) return { value: g.baseline, basis: 'sheet' };
  return { value: null, basis: 'none' };
}

// Change in get-in price over the last ~7 days.
export function trend(prices, g) {
  const h = market(prices, g)?.history;
  if (!h || h.length < 2) return null;
  const last = h[h.length - 1];
  const cutoff = Date.parse(last.t) - 7 * 86400e3;
  const prev = h.find(x => Date.parse(x.t) >= cutoff) || h[0];
  if (!prev.low || prev === last) return null;
  return (last.low - prev.low) / prev.low;
}

export function netPayout(price, qty, pct) {
  const gross = (price || 0) * (qty || 1);
  return Math.round(gross * (1 - pct / 100) * 100) / 100;
}

// --- Ledger -----------------------------------------------------------------

// Ticket value each partner used (their seats + guests they brought), and sale proceeds.
export function ledger(games, prices, mult, settings) {
  const [A, B] = CONFIG.PARTNERS;
  const used = { [A]: 0, [B]: 0 };
  const count = { [A]: 0, [B]: 0 };
  const guests = { [A]: 0, [B]: 0 };
  let proceeds = 0, soldTickets = 0, pendingPayout = 0;
  const perGame = [];
  for (const g of games) {
    const est = estimate({ ...g, soldPrice: null }, prices, mult).value || 0;
    if (g.soldPrice != null) {
      const qty = g.qtySold || settings.seatCount;
      const pay = g.payout ?? netPayout(g.soldPrice, qty, feePct(settings, g.platform));
      proceeds += pay;
      soldTickets += qty;
      if (!g.paid) pendingPayout += pay;
    }
    const partialSale = g.soldPrice != null && (g.qtySold || settings.seatCount) < settings.seatCount;
    if (g.soldPrice != null ? !partialSale : g.plan !== 'use') continue;
    const h = holders(g);
    const partnersHere = h.filter(n => n === A || n === B);
    const share = { [A]: 0, [B]: 0 };
    for (const n of h) {
      if (n === A || n === B) { share[n] += est; count[n]++; continue; }
      // A guest seat is charged to the partner(s) attending, or split if neither is.
      const to = partnersHere.length ? partnersHere : [A, B];
      to.forEach(p => { share[p] += est / to.length; guests[p] += 1 / to.length; });
    }
    used[A] += share[A];
    used[B] += share[B];
    perGame.push({ g, share });
  }
  const cost = Number(settings.seasonCost) || 0;
  const netCost = cost - proceeds;
  // Fair outcome: each partner ends up with equal net value (used value minus cost share).
  const diff = used[A] - used[B];
  return { used, count, guests, proceeds, soldTickets, pendingPayout, cost, netCost, diff, owed: Math.abs(diff) / 2, ahead: diff > 0 ? A : diff < 0 ? B : null, perGame };
}

export const money = (n, dp = 0) => n == null || !Number.isFinite(n) ? '—' : (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

// --- Price ladder -----------------------------------------------------------
// Each game you sell steps down as it gets closer: Stretch until 2 weeks out, then the
// 2-week ("Fair") price, the 5-day price, and finally the 48-hour price. Prices are what
// you type into Ticketmaster (before their buyer fees). Any step can be overridden per game.

export const STEPS = [
  { key: 'pStretch', label: 'Stretch', short: '14d+', window: 'more than 14 days out', fromHours: Infinity, factor: 1.15 },
  { key: 'p2wk', label: '14 days', short: '14d', window: '14 to 5 days out', fromHours: 14 * 24, factor: 1 },
  { key: 'p5d', label: '5 days', short: '5d', window: '5 to 2 days out', fromHours: 5 * 24, factor: 0.85 },
  { key: 'p48h', label: '2 days', short: '2d', window: 'last 2 days', fromHours: 48, factor: 0.7 },
];

const round5 = n => Math.round(n / 5) * 5;
export const hoursUntil = (g, now = new Date()) => (startTime(g) - now) / 3600e3;

// Per-ticket cost of one seat for one game, from the season cost.
export function floorPrice(settings, games) {
  const cost = Number(settings.seasonCost) || 0;
  const seats = Number(settings.seatCount) || 2;
  return cost ? Math.round(cost / seats / Math.max(games.length, 1)) : null;
}

// The anchor ("Fair", the 2-week price) as a Ticketmaster list price.
export function fairAnchor(g, prices, mult, settings) {
  const buyerFee = 1 + (Number(settings.tmBuyerFee) || 0) / 100;
  if (g.p2wk != null) return { value: g.p2wk, basis: 'set' };
  if (g.comp != null) return { value: round5(g.comp / buyerFee), basis: 'comps' };
  const m = market(prices, g);
  if (m?.low) return { value: round5((m.low * mult.value) / buyerFee), basis: 'est.' };
  if (g.baseline) return { value: round5(g.baseline), basis: 'sheet' };
  return { value: null, basis: 'none' };
}

export function ladder(g, prices, mult, settings, floor, now = new Date()) {
  const fair = fairAnchor(g, prices, mult, settings);
  const h = hoursUntil(g, now);
  const steps = STEPS.map(st => {
    const auto = fair.value == null ? null : Math.max(round5(fair.value * st.factor), floor || 0);
    return { ...st, value: g[st.key] ?? auto, auto, overridden: g[st.key] != null };
  });
  // The step in effect right now is the last one whose window has started.
  let current = 0;
  steps.forEach((st, i) => { if (h <= st.fromHours) current = i; });
  const next = steps[current + 1];
  const nextAt = next ? new Date(startTime(g).getTime() - next.fromHours * 3600e3) : null;
  return { fair, steps, current, now: steps[current], next, nextAt, hours: h };
}

// --- Comparable listings ------------------------------------------------------
// data/comps.json holds the cheapest similar pair per game (collected from Vivid Seats).
// A comp typed into the app wins when it was entered after the file was checked.
export function applyComps(games, prices) {
  const file = prices?.comps;
  for (const g of games) {
    const m = market(prices, g);
    g.compSearch = m?.vividUrl ? m.vividUrl + '?quantity=2' : '';
    const c = file?.games?.[g.id];
    if (!c) continue;
    const manualNewer = g.comp != null && Date.parse(g.compAt) > Date.parse(file.checked);
    if (manualNewer) continue;
    Object.assign(g, { comp: c.price, compAt: file.checked, compUrl: c.url, compNote: `Sec ${c.sec} · Row ${c.row}`, compN: c.n });
  }
}

// A comp from a thin or wildly high listing would set a silly price. Compare each comp's ratio to
// the arena's cheapest ticket against the typical ratio; set aside ones that are far off.
export function guardComps(games, prices) {
  const withLow = games.filter(g => g.comp != null && market(prices, g)?.low);
  const ratios = withLow.map(g => g.comp / market(prices, g).low);
  const typical = median(ratios);
  if (!typical) return typical;
  for (const g of withLow) {
    const r = g.comp / market(prices, g).low;
    const thin = g.compN != null && g.compN < 3;
    if (r > typical * 2 || (thin && r > typical * 1.5)) {
      g.compIgnored = { price: g.comp, url: g.compUrl, note: g.compNote, n: g.compN, ratio: r, typical };
      Object.assign(g, { comp: null, compUrl: '', compNote: '', compN: null });
    }
  }
  return typical;
}

// --- Selling tranches ------------------------------------------------------------
// The season is sold in batches. Each tranche has a decision date a few weeks before
// its first game, so every game we sell still gets its full Stretch window.
export function tranches(settings, games) {
  const starts = String(settings.trancheStarts || DEFAULT_SETTINGS.trancheStarts).split(',')
    .map(s => s.trim()).filter(Boolean).map(s => new Date(s + 'T00:00:00')).filter(d => !isNaN(d)).sort((a, b) => a - b);
  const weeks = Number(settings.trancheDecideWeeks) || 4;
  const fixed = String(settings.trancheDeadlines ?? DEFAULT_SETTINGS.trancheDeadlines).split(',').map(s => s.trim());
  const list = starts.map((start, i) => ({ n: i + 1, start, end: starts[i + 1] || null, games: [] }));
  for (const g of games) {
    const t = [...list].reverse().find(t => g.dateObj >= t.start) || list[0];
    if (t) t.games.push(g);
  }
  for (const t of list) {
    t.games.sort((a, b) => a.dateObj - b.dateObj);
    const first = t.games[0], last = t.games[t.games.length - 1];
    t.first = first?.dateObj || t.start;
    t.last = last?.dateObj || t.start;
    const set = fixed[t.n - 1] && new Date(fixed[t.n - 1] + 'T23:59:00');
    t.decideBy = set && !isNaN(set) ? set : new Date(t.first.getTime() - weeks * 7 * 86400e3);
    t.decideBy.setHours(23, 59, 0, 0);
  }
  return list.filter(t => t.games.length);
}
export const trancheOf = (list, g) => list.find(t => t.games.includes(g)) || null;

// --- Friend prices --------------------------------------------------------------
// Friends pay what similar seats cost online with fees included, so a friend price is the
// Ticketmaster list price plus Ticketmaster's buyer fee. Overrides on the ladder carry through.
export const round5down = n => Math.floor(n / 5) * 5;
export function friendPrice(tmPrice, settings) {
  if (tmPrice == null) return null;
  return Math.round(tmPrice * (1 + (Number(settings.tmBuyerFee) || 0) / 100) / 5) * 5;
}
export function ffPrice(price, pct) {
  if (price == null) return null;
  return round5down(price * (1 - (Number(pct) || 0) / 100));
}
export function friendLadder(L, settings) {
  return L.steps.map(st => ({ ...st, friend: friendPrice(st.value, settings) }));
}

// Days-to-game window, for color-coding rows (14 / 5 / 2 days out).
export function windowOf(g, now = new Date()) {
  const h = hoursUntil(g, now);
  if (h < -3) return 'past';
  if (h <= 48) return 'w2';
  if (h <= 5 * 24) return 'w5';
  if (h <= 14 * 24) return 'w14';
  return 'far';
}
export const WINDOW_LABEL = { far: 'More than 14 days', w14: '14–5 days', w5: '5–2 days', w2: 'Last 2 days', past: 'Played' };

// --- Sales ------------------------------------------------------------------------
// A sale counts once the money is in and the tickets are transferred.
export const saleDone = g => g.soldPrice != null && g.paid && g.transferred;
export function received(g, settings) {
  if (g.soldPrice == null) return 0;
  if (g.payout != null) return g.payout;
  const qty = g.qtySold || Number(settings.seatCount) || 2;
  return netPayout(g.soldPrice, qty, feePct(settings, g.platform));
}
