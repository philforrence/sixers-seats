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
  resaleCap: 7,           // 2026-27 full-season resale allowance (Inquirer, Sep 2026); 10 last season
  exchangeCap: 10,
  exchangesUsed: 0,
};

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
      if (at?.low) ratios.push(['sale', g.soldPrice / at.low]);
    }
  }
  const sales = ratios.filter(r => r[0] === 'sale').map(r => r[1]);
  if (sales.length >= 2) return { value: median(sales), basis: `learned from ${sales.length} sales` };
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
