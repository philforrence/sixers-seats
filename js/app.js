import { CONFIG, DEMO } from './config.js';
import * as auth from './auth.js';
import { SheetStore, DemoStore, AuthError } from './store.js';
import { loadPrices, absorbed, searchLinks } from './prices.js';
import { team, TEAM_NAMES } from './teams.js';
import {
  status, STATUS_LABEL, isPast, daysUntil, startTime, holders, estimate, trend, seatMultiplier, market,
  netPayout, feePct, ledger, money, PLATFORMS, setSeatCount, parseDate,
} from './model.js';

const [P1, P2] = CONFIG.PARTNERS;
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  user: null, games: [], settings: {}, prices: { games: {} }, mult: { value: 1, basis: 'default' },
  view: 'home', open: null, filter: 'upcoming', gamesMode: 'list', marketSort: 'value', loading: true, error: '',
};
const store = DEMO ? new DemoStore() : new SheetStore();

// ---------------------------------------------------------------- boot / auth

async function boot() {
  window.addEventListener('hashchange', route);
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.open) closeGame(); });
  route(false);
  if (DEMO) {
    state.user = { name: P1, email: 'demo', demo: true };
    return loadAll();
  }
  state.user = auth.currentUser();
  if (state.user) return loadAll();
  state.loading = false;
  render();
}

async function doSignIn() {
  try {
    state.error = '';
    state.user = await auth.signIn();
    await loadAll();
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function loadAll() {
  state.loading = true;
  render();
  try {
    const { games, settings } = await store.load();
    state.games = games.sort((a, b) => a.dateObj - b.dateObj);
    state.settings = settings;
    setSeatCount(settings.seatCount);
    render();
    const baselines = DEMO ? Object.fromEntries(games.map(g => [g.id, g.baseline || 100])) : undefined;
    state.prices = await loadPrices({ demo: DEMO, baselines });
    state.mult = seatMultiplier(state.games, state.prices, state.settings);
  } catch (e) {
    if (e instanceof AuthError) state.user = null;
    else state.error = e.message;
  }
  state.loading = false;
  render();
}

// Save with optimistic UI; on an expired token, ask to reconnect and retry once.
async function persist(g) {
  g._saving = true;
  renderDrawerStatus(g);
  try {
    await store.saveGame(g, state.user.name);
    g._saving = false; g._saved = Date.now();
  } catch (e) {
    g._saving = false;
    if (e instanceof AuthError) {
      toast('Your Google session expired — tap to reconnect', async () => { state.user = await auth.signIn(); persist(g); });
    } else toast('Save failed: ' + e.message);
  }
  renderDrawerStatus(g);
}

const debounced = new Map();
function persistSoon(g, ms = 600) {
  clearTimeout(debounced.get(g.id));
  debounced.set(g.id, setTimeout(() => persist(g), ms));
}

async function saveSettings() {
  try {
    await store.saveSettings(state.settings);
    setSeatCount(state.settings.seatCount);
    state.mult = seatMultiplier(state.games, state.prices, state.settings);
    toast('Settings saved');
  } catch (e) { toast('Save failed: ' + e.message); }
  render();
}

// ---------------------------------------------------------------- routing

function route(doRender = true) {
  const [view, id] = location.hash.replace(/^#\/?/, '').split('/');
  state.view = ['home', 'games', 'market', 'split', 'settings'].includes(view) ? view : 'home';
  state.open = id || null;
  if (doRender) render();
}
const go = (view, id) => { location.hash = `#/${view}${id ? '/' + id : ''}`; };
let openedInApp = false;
function openGame(id) { openedInApp = !state.open; go(state.view, id); }
function closeGame() {
  if (openedInApp) { openedInApp = false; history.back(); } else go(state.view);
}

// ---------------------------------------------------------------- helpers

const now = () => new Date();
const upcoming = () => state.games.filter(g => !isPast(g));
const est = g => estimate(g, state.prices, state.mult);
const mkt = g => market(state.prices, g);
const seatCount = () => Math.max(1, Number(state.settings.seatCount) || 2);
const fmtDate = (g, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => g.dateObj.toLocaleDateString('en-US', opts);
const rel = d => {
  const n = daysUntil(d);
  if (isPast(d)) return 'Final';
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `in ${n} days`;
};
const ago = iso => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const chip = s => `<span class="chip chip-${s}">${STATUS_LABEL[s]}</span>`;
const logo = (g, size = 36) => {
  const t = team(g.opp);
  return `<span class="logo" style="--team:${t.color};width:${size}px;height:${size}px">${t.logo ? `<img src="${t.logo}" alt="" loading="lazy" onerror="this.remove()">` : ''}<b>${t.abbr}</b></span>`;
};
const who = g => {
  const h = holders(g);
  if (!h.length) return '';
  return h.map(n => `<span class="person ${n === P1 ? 'p1' : n === P2 ? 'p2' : 'guest'}">${esc(n)}</span>`).join('');
};
const resalesPlanned = () => state.games.filter(g => g.plan === 'sell' || g.soldPrice != null).length;
const resalesDone = () => state.games.filter(g => g.soldPrice != null).length;
const trendBadge = g => {
  const t = trend(state.prices, g);
  if (t == null || Math.abs(t) < 0.02) return '<span class="trend flat">—</span>';
  return `<span class="trend ${t > 0 ? 'up' : 'down'}">${t > 0 ? '▲' : '▼'} ${Math.round(Math.abs(t) * 100)}%</span>`;
};

function spark(hist, { w = 120, h = 32, key = 'low', marks = [] } = {}) {
  const pts = (hist || []).filter(p => p[key] != null);
  if (pts.length < 2) return '';
  const xs = pts.map(p => Date.parse(p.t)), ys = pts.map(p => p[key]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = t => ((t - x0) / (x1 - x0 || 1)) * (w - 4) + 2;
  const Y = v => h - 3 - ((v - y0) / (y1 - y0 || 1)) * (h - 6);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" /><circle cx="${X(Date.parse(last.t))}" cy="${Y(last[key])}" r="2.5" />${marks.join('')}</svg>`;
}

// Bigger chart for the drawer, with axis labels.
function priceChart(m, g) {
  const pts = (m?.history || []).filter(p => p.low != null);
  if (pts.length < 2) return '<p class="muted small">Price history builds up as the GitHub Action snapshots prices twice a day.</p>';
  const W = 560, H = 170, L = 40, R = 10, T = 12, B = 24;
  const xs = pts.map(p => Date.parse(p.t)), ys = pts.map(p => p.low);
  const mine = state.mult.value;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const lo = Math.min(...ys) * 0.9, hi = Math.max(...ys.map(y => y * mine), g.soldPrice || 0) * 1.05;
  const X = t => L + ((t - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = v => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const line = k => pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p.low * k).toFixed(1)}`).join('');
  const ticks = [lo, (lo + hi) / 2, hi].map(v => `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${money(v)}</text><line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>`).join('');
  const dl = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const sold = g.soldPrice != null && g.soldOn ? `<circle class="sold-dot" cx="${X(Math.min(Math.max(Date.parse(g.soldOn), x0), x1))}" cy="${Y(g.soldPrice)}" r="5"><title>Sold ${money(g.soldPrice)}</title></circle>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price history">
    ${ticks}
    <path class="est-line" d="${line(mine)}"/><path class="low-line" d="${line(1)}"/>${sold}
    <text x="${L}" y="${H - 6}">${dl(x0)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${dl(x1)}</text>
  </svg>
  <div class="legend"><span><i class="k-low"></i>Arena get-in (Vivid)</span><span><i class="k-est"></i>Your seats ≈ ${mine.toFixed(2)}×</span>${sold ? '<span><i class="k-sold"></i>Your sale</span>' : ''}</div>`;
}

// ---------------------------------------------------------------- render

function render() {
  const app = $('#app');
  if (!state.user) { app.innerHTML = signInView(); return; }
  if (state.loading && !state.games.length) { app.innerHTML = shell('<div class="loading"><div class="ball"></div>Loading your season…</div>'); return; }
  if (state.error && !state.games.length) { app.innerHTML = shell(`<div class="card error"><h2>Something's off</h2><p>${esc(state.error)}</p><button class="btn" data-act="reload">Try again</button></div>`); return; }
  const views = { home: homeView, games: gamesView, market: marketView, split: splitView, settings: settingsView };
  app.innerHTML = shell(views[state.view]());
  renderDrawer();
}

function shell(content) {
  const nav = [
    ['home', 'Home', '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>'],
    ['games', 'Games', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['market', 'Market', '<path d="M4 19l5-6 4 3 7-9"/><path d="M15 7h5v5"/>'],
    ['split', 'Split', '<circle cx="8" cy="9" r="3.2"/><circle cx="16.5" cy="9" r="3.2"/><path d="M2.5 20c.8-3.4 3-5 5.5-5s4.7 1.6 5.5 5M11.5 16.3c1-.9 2.9-1.3 5-1.3 2.5 0 4.7 1.6 5.5 5"/>'],
    ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'],
  ];
  const links = nav.map(([k, label, icon]) =>
    `<a href="#/${k}" class="${state.view === k ? 'active' : ''}" ${state.view === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}</span></a>`).join('');
  const u = state.user;
  return `
  <header class="topbar">
    <a class="brand" href="#/home"><span class="brand-mark">76</span><span>Sixers Seats <em>2026-27</em></span></a>
    <div class="top-right">
      ${DEMO ? '<span class="demo-pill" title="No Google client ID set — data lives in this browser only">Demo</span>' : ''}
      ${state.loading ? '<span class="sync">Syncing…</span>' : ''}
      <button class="avatar" data-act="menu" aria-label="Account">${u.picture ? `<img src="${esc(u.picture)}" alt="">` : esc(u.name[0])}</button>
    </div>
  </header>
  <nav class="sidenav" aria-label="Main">${links}</nav>
  <main class="content">${content}</main>
  <nav class="tabbar" aria-label="Main">${links}</nav>
  <div id="drawer-root"></div>
  <div id="toast" role="status" aria-live="polite"></div>`;
}

function signInView() {
  return `<div class="signin">
    <div class="signin-card">
      <div class="brand-mark big">76</div>
      <h1>Sixers Seats</h1>
      <p class="muted">Phil &amp; Andrew's season ticket HQ — who's going, what's selling, and what it's worth.</p>
      <button class="btn google" data-act="signin">
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
        Sign in with Google
      </button>
      ${state.error ? `<p class="error-text">${esc(state.error)}</p>` : ''}
      <p class="muted small">Only ${Object.keys(CONFIG.ALLOWED).map(esc).join(' and ')} can get in.</p>
    </div>
  </div>`;
}

// ---- Home

function alerts() {
  const out = [];
  const up = upcoming();
  const cap = Number(state.settings.resaleCap) || 0;
  const planned = resalesPlanned();
  if (cap && planned > cap) out.push({ tone: 'warn', text: `<b>${planned} games marked to sell, but the 2026-27 resale cap is ${cap}.</b> Selling more than that risks a penalty or a "broker" flag on the account.`, act: 'go:market' });
  for (const g of up) {
    const d = daysUntil(g);
    if (g.plan === 'sell' && g.listPrice == null && g.soldPrice == null && d <= 14) out.push({ tone: d <= 5 ? 'warn' : 'info', text: `List <b>${esc(team(g.opp).abbr)} ${fmtDate(g, { month: 'short', day: 'numeric' })}</b> — ${rel(g)}, not listed yet.`, id: g.id });
    if (g.soldPrice != null && !g.transferred) out.push({ tone: 'warn', text: `Transfer tickets for <b>${esc(team(g.opp).abbr)} ${fmtDate(g, { month: 'short', day: 'numeric' })}</b> to ${esc(g.buyer || 'the buyer')}.`, id: g.id });
    if (g.plan === 'use' && holders(g).length < seatCount() && d <= 10) out.push({ tone: 'info', text: `Empty seat for <b>${esc(team(g.opp).abbr)} ${fmtDate(g, { month: 'short', day: 'numeric' })}</b> — bring someone or sell one.`, id: g.id });
    if (g.plan === 'undecided' && d <= 21) out.push({ tone: 'info', text: `Decide on <b>${esc(team(g.opp).abbr)} ${fmtDate(g, { month: 'short', day: 'numeric' })}</b> (${rel(g)}).`, id: g.id });
  }
  for (const g of state.games) if (g.soldPrice != null && !g.paid && isPast(g)) out.push({ tone: 'info', text: `Payout pending for <b>${esc(team(g.opp).abbr)} ${fmtDate(g, { month: 'short', day: 'numeric' })}</b>.`, id: g.id });
  return out.slice(0, 6);
}

function homeView() {
  const up = upcoming();
  const next = up[0];
  const mine = up.find(g => holders(g).includes(state.user.name));
  const L = ledger(state.games, state.prices, state.mult, { ...state.settings, seatCount: seatCount() });
  const counts = { going: 0, selling: 0, listed: 0, sold: 0, undecided: 0 };
  state.games.forEach(g => counts[status(g)]++);
  const forSale = state.games.filter(g => g.plan === 'sell' && g.soldPrice == null && !isPast(g));
  const potential = forSale.reduce((a, g) => a + (est(g).value || 0) * seatCount(), 0);
  const recent = [...state.games].filter(g => g.updatedAt).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const al = alerts();
  return `
  <section class="hero card" ${next ? `data-open="${next.id}"` : ''}>
    ${next ? `
      <div class="hero-top"><span class="eyebrow">Next home game · ${rel(next)}</span>${chip(status(next))}</div>
      <div class="hero-main">
        <div class="vs">${logo(next, 64)}<div><h1>${esc(next.opp)}</h1><p>${fmtDate(next, { weekday: 'long', month: 'long', day: 'numeric' })} · ${esc(next.time)}${mkt(next)?.tv ? ' · ' + esc(mkt(next).tv) : ''}</p></div></div>
        <div class="hero-stats">
          <div><span class="label">Who's going</span><span class="val">${who(next) || `<span class="muted">${status(next) === 'sold' ? 'Sold' : status(next) === 'undecided' ? 'TBD' : '—'}</span>`}</span></div>
          <div><span class="label">Your seat value</span><span class="val big">${money(est(next).value)}</span></div>
          <div><span class="label">Get-in now</span><span class="val">${money(mkt(next)?.low)} ${trendBadge(next)}</span></div>
        </div>
      </div>
      <div class="countdown" data-countdown="${startTime(next).toISOString()}"></div>` : '<h1>Season complete 🏀</h1>'}
  </section>

  <div class="stat-row">
    <button class="stat" data-act="filter:going"><span class="n">${counts.going}</span><span>Going</span></button>
    <button class="stat" data-act="filter:selling"><span class="n">${counts.selling + counts.listed}</span><span>For sale</span></button>
    <button class="stat" data-act="filter:sold"><span class="n">${counts.sold}</span><span>Sold</span></button>
    <button class="stat" data-act="go:split"><span class="n">${money(L.proceeds)}</span><span>Sale proceeds</span></button>
    <button class="stat" data-act="go:market"><span class="n">${money(potential)}</span><span>Still to sell (est.)</span></button>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>Needs attention</h2>
      ${al.length ? `<ul class="alerts">${al.map(a => `<li class="alert ${a.tone}" ${a.id ? `data-open="${a.id}"` : a.act ? `data-act="${a.act}"` : ''}>${a.text}</li>`).join('')}</ul>` : '<p class="muted">All caught up. 🎉</p>'}
      ${mine && mine !== next ? `<div class="mine" data-open="${mine.id}"><span class="label">Your next game</span>${logo(mine, 28)} <b>${esc(team(mine.opp).abbr)}</b> ${fmtDate(mine)} · ${rel(mine)}</div>` : ''}
    </section>
    <section class="card">
      <h2>Coming up</h2>
      <ul class="mini-list">${up.slice(0, 6).map(miniRow).join('')}</ul>
      <a class="more" href="#/games">Full schedule →</a>
    </section>
  </div>

  <div class="grid-2">
    <section class="card">
      <h2>Resale allowance</h2>
      ${resaleMeter()}
    </section>
    <section class="card">
      <h2>Recent activity</h2>
      ${recent.length ? `<ul class="activity">${recent.map(g => `<li data-open="${g.id}"><b>${esc(g.updatedBy)}</b> updated ${esc(team(g.opp).abbr)} ${fmtDate(g, { month: 'short', day: 'numeric' })} ${chip(status(g))}<span class="muted small">${ago(g.updatedAt)}</span></li>`).join('')}</ul>` : '<p class="muted">Changes either of you make show up here.</p>'}
    </section>
  </div>`;
}

function resaleMeter() {
  const cap = Number(state.settings.resaleCap) || 0;
  const done = resalesDone(), planned = resalesPlanned();
  const pct = v => cap ? Math.min(100, (v / cap) * 100) : 0;
  return `<div class="meter"><div class="meter-fill planned ${planned > cap ? 'over' : ''}" style="width:${pct(planned)}%"></div><div class="meter-fill done" style="width:${pct(done)}%"></div></div>
    <p><b>${done}</b> sold · <b>${planned}</b> planned · cap <b>${cap || '—'}</b>${planned > cap && cap ? ` — <span class="bad">${planned - cap} over</span>` : ''}</p>
    <p class="muted small">Full-season members can resell ${cap || '?'} games without penalty in 2026-27 (down from 10), per the Inquirer. Transfers through the Ticketmaster member portal were also reported as blocked. Check your contract and change the cap in Settings if yours is different. Exchanges used: ${Number(state.settings.exchangesUsed) || 0}/${Number(state.settings.exchangeCap) || 10}.</p>`;
}

function miniRow(g) {
  return `<li data-open="${g.id}">${logo(g, 28)}<div class="mini-main"><b>${esc(g.opp)}</b><span class="muted small">${fmtDate(g)} · ${esc(g.time)}</span></div><div class="mini-right">${who(g) || chip(status(g))}</div></li>`;
}

// ---- Games

const FILTERS = [
  ['upcoming', 'Upcoming'], ['all', 'All'], ['mine', 'My games'], ['going', 'Going'], ['selling', 'For sale'],
  ['sold', 'Sold'], ['undecided', 'Undecided'], ['monwed', 'Mon/Wed'], ['dh', 'Doubleheader'], ['past', 'Past'],
];
function filtered() {
  const f = state.filter, me = state.user.name;
  return state.games.filter(g => {
    const s = status(g);
    switch (f) {
      case 'upcoming': return !isPast(g);
      case 'mine': return holders(g).includes(me);
      case 'going': return s === 'going' || (s === 'sold' && holders(g).length);
      case 'selling': return s === 'selling' || s === 'listed';
      case 'sold': return s === 'sold';
      case 'undecided': return s === 'undecided';
      case 'monwed': return g.monWed;
      case 'dh': return g.doubleheader;
      case 'past': return isPast(g);
      default: return true;
    }
  });
}

function gamesView() {
  const list = filtered();
  return `
  <div class="view-head">
    <h1>Schedule</h1>
    <div class="seg" role="tablist">
      <button class="${state.gamesMode === 'list' ? 'on' : ''}" data-act="mode:list">List</button>
      <button class="${state.gamesMode === 'cal' ? 'on' : ''}" data-act="mode:cal">Calendar</button>
    </div>
  </div>
  <div class="filters" role="toolbar">${FILTERS.map(([k, l]) => `<button class="${state.filter === k ? 'on' : ''}" data-act="filter:${k}">${l}</button>`).join('')}</div>
  ${state.gamesMode === 'cal' ? calendarView() : `
  <div class="game-list">
    <div class="gl-head"><span>Game</span><span>Plan</span><span>Interest</span><span class="r">Get-in</span><span class="r">Your est.</span></div>
    ${list.map(gameRow).join('') || '<p class="muted pad">No games match.</p>'}
  </div>`}
  <div class="list-actions">
    <button class="btn ghost" data-act="ics:mine">📅 Add my games to calendar</button>
    <button class="btn ghost" data-act="ics:all">📅 All home games</button>
    <button class="btn ghost" data-act="addgame">＋ Add a game</button>
  </div>`;
}

function gameRow(g) {
  const s = status(g), m = mkt(g), e = est(g);
  const int = CONFIG.PARTNERS.map((p, i) => `<span class="int ${g.interest[p] ? 'yes' : ''} p${i + 1}" title="${p} ${g.interest[p] ? 'interested' : 'not interested'}">${p[0]}</span>`).join('');
  return `<button class="game-row ${isPast(g) ? 'past' : ''}" data-open="${g.id}">
    <span class="gr-game">${logo(g, 34)}<span><b>${esc(g.opp)}</b><span class="muted small">${fmtDate(g)} · ${esc(g.time)}${g.doubleheader ? ' · <span class="tag">DH</span>' : ''}${m?.result ? ` · <b class="${m.result === 'W' ? 'good' : 'bad'}">${m.result}</b>` : ''}</span></span></span>
    <span class="gr-plan">${chip(s)}${who(g)}</span>
    <span class="gr-int">${int}</span>
    <span class="r gr-low">${money(m?.low)}<span class="hide-sm">${spark(m?.history, { w: 56, h: 18 })}</span></span>
    <span class="r gr-est"><b>${money(e.value)}</b>${e.basis === 'sold' ? '<span class="muted small">sold</span>' : ''}</span>
  </button>`;
}

function calendarView() {
  const months = [];
  const first = state.games[0]?.dateObj, last = state.games.at(-1)?.dateObj;
  if (!first) return '';
  const byId = Object.fromEntries(state.games.map(g => [g.id, g]));
  const visible = new Set(filtered().map(g => g.id));
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const y = d.getFullYear(), mo = d.getMonth();
    const days = new Date(y, mo + 1, 0).getDate();
    const lead = new Date(y, mo, 1).getDay();
    let cells = '<span class="dow">S</span><span class="dow">M</span><span class="dow">T</span><span class="dow">W</span><span class="dow">T</span><span class="dow">F</span><span class="dow">S</span>';
    cells += '<span></span>'.repeat(lead);
    for (let day = 1; day <= days; day++) {
      const id = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const g = byId[id];
      const isToday = new Date().toDateString() === new Date(y, mo, day).toDateString();
      if (g) {
        const s = status(g);
        cells += `<button class="cal-day has ${s} ${visible.has(id) ? '' : 'dim'} ${isPast(g) ? 'past' : ''}" data-open="${id}" style="--team:${team(g.opp).color}" title="${esc(g.opp)} · ${STATUS_LABEL[s]}"><span class="dn">${day}</span><span class="ab">${team(g.opp).abbr}</span><span class="dot"></span></button>`;
      } else cells += `<span class="cal-day ${isToday ? 'today' : ''}"><span class="dn">${day}</span></span>`;
    }
    months.push(`<section class="card month"><h3>${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3><div class="cal">${cells}</div></section>`);
  }
  return `<div class="cal-legend">${['going', 'selling', 'listed', 'sold', 'undecided'].map(s => `<span><i class="dot ${s}"></i>${STATUS_LABEL[s]}</span>`).join('')}</div><div class="months">${months.join('')}</div>`;
}

// ---- Market

function marketView() {
  const up = upcoming();
  const rows = up.map(g => ({ g, m: mkt(g), e: est(g), t: trend(state.prices, g), a: absorbed(mkt(g)) }));
  const sorters = {
    value: (a, b) => (b.e.value || 0) - (a.e.value || 0),
    date: (a, b) => a.g.dateObj - b.g.dateObj,
    trend: (a, b) => (b.t ?? -9) - (a.t ?? -9),
    demand: (a, b) => (b.a ?? -1e9) - (a.a ?? -1e9),
  };
  rows.sort(sorters[state.marketSort]);
  const sales = state.games.filter(g => g.soldPrice != null);
  const updated = state.prices.liveAt || state.prices.updated;
  const maxV = Math.max(...rows.map(r => r.e.value || 0), 1);
  return `
  <div class="view-head"><h1>Market</h1><span class="muted small">${state.prices.live ? `Live from Vivid Seats via ESPN · ${ago(updated)}` : state.prices.updated ? `Snapshot ${ago(state.prices.updated)}` : 'No market data yet'}${state.prices.demo ? ' · demo history' : ''}</span></div>

  <div class="grid-2">
    <section class="card">
      <h2>How we estimate your seats</h2>
      <p class="big-num">${state.mult.value.toFixed(2)}× <span class="muted small">the arena's cheapest ticket</span></p>
      <p class="muted small">Basis: ${esc(state.mult.basis)}. Once you log 2+ sales, the multiplier learns from what your seats actually sold for vs. the get-in price at that moment. You can override it in Settings.</p>
    </section>
    <section class="card">
      <h2>Your sales</h2>
      ${sales.length ? `<table class="tbl"><thead><tr><th>Game</th><th>Where</th><th class="r">Each</th><th class="r">vs get-in</th></tr></thead><tbody>${sales.map(g => {
        const m = mkt(g); return `<tr data-open="${g.id}"><td>${esc(team(g.opp).abbr)} ${fmtDate(g, { month: 'short', day: 'numeric' })}</td><td>${esc(g.platform || '—')}</td><td class="r">${money(g.soldPrice)}</td><td class="r">${m?.low ? (g.soldPrice / m.low).toFixed(2) + '×' : '—'}</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="muted">No sales logged yet. Open a game → Sell → "Mark sold".</p>'}
    </section>
  </div>

  <section class="card">
    <div class="card-head"><h2>Every upcoming game</h2>
      <div class="seg small">${[['value', 'Value'], ['date', 'Date'], ['trend', 'Trend'], ['demand', 'Demand']].map(([k, l]) => `<button class="${state.marketSort === k ? 'on' : ''}" data-act="msort:${k}">${l}</button>`).join('')}</div>
    </div>
    <p class="muted small">"Left market" = tickets that disappeared from listings in the last 7 days (sold or delisted). No marketplace publishes actual sale prices for free, so this is the best demand signal available.</p>
    <div class="mkt-list">
      ${rows.map(({ g, m, e, t, a }) => `
      <button class="mkt-row" data-open="${g.id}">
        <span class="gr-game">${logo(g, 30)}<span><b>${esc(team(g.opp).abbr)}</b><span class="muted small">${fmtDate(g, { weekday: 'short', month: 'short', day: 'numeric' })}</span></span></span>
        <span class="bar-wrap hide-sm"><span class="bar ${status(g)}" style="width:${((e.value || 0) / maxV) * 100}%"></span></span>
        <span class="r"><b>${money(e.value)}</b></span>
        <span class="r hide-sm">${money(m?.low)}</span>
        <span class="r">${trendBadge(g)}</span>
        <span class="r hide-sm muted small">${a == null ? '—' : (a > 0 ? '−' : '+') + Math.abs(a).toLocaleString()}</span>
        <span class="r">${chip(status(g))}</span>
      </button>`).join('')}
    </div>
    <div class="mkt-legend muted small"><span>Bar/bold = your est. per ticket</span><span>2nd = get-in</span><span>▲▼ = 7-day trend</span><span>last = tickets left market (7d)</span></div>
  </section>`;
}

// ---- Split

function splitView() {
  const S = { ...state.settings, seatCount: seatCount() };
  const L = ledger(state.games, state.prices, state.mult, S);
  const cost = L.cost;
  const each = cost / 2;
  const row = p => {
    const netValue = L.used[p] - each + L.proceeds / 2;
    return `<div class="person-card ${p === P1 ? 'p1' : 'p2'}">
      <h3>${esc(p)}</h3>
      <dl>
        <dt>Seats used</dt><dd>${L.count[p]}${L.guests[p] ? ` + ${Math.round(L.guests[p] * 10) / 10} guest` : ''}</dd>
        <dt>Ticket value used</dt><dd>${money(L.used[p])}</dd>
        <dt>Paid toward season</dt><dd>${cost ? money(each) : '<span class="muted">set in Settings</span>'}</dd>
        <dt>Share of sales</dt><dd>${money(L.proceeds / 2)}</dd>
        <dt>Value used − cost + sales</dt><dd class="${netValue >= 0 ? 'good' : 'bad'}">${cost ? money(netValue) : '—'}</dd>
      </dl>
    </div>`;
  };
  const perGame = L.perGame.filter(x => x.share[P1] || x.share[P2]);
  return `
  <div class="view-head"><h1>Split &amp; ledger</h1></div>
  <section class="card settle">
    ${L.ahead ? `<p class="eyebrow">To even out ticket value</p><p class="settle-line"><b>${esc(L.ahead === P1 ? P2 : P1)}</b> is owed <span class="big-num">${money(L.owed)}</span> by <b>${esc(L.ahead)}</b></p>
      <p class="muted small">${esc(L.ahead)} has used ${money(L.diff < 0 ? -L.diff : L.diff)} more in ticket value (at current estimates). Splitting the difference evens it out — or just give ${esc(L.ahead === P1 ? P2 : P1)} the next good game.</p>`
      : '<p class="settle-line">Dead even. 🤝</p>'}
  </section>
  <div class="grid-2">${row(P1)}${row(P2)}</div>
  <div class="stat-row">
    <div class="stat"><span class="n">${money(cost)}</span><span>Season cost</span></div>
    <div class="stat"><span class="n">${money(L.proceeds)}</span><span>Sale proceeds (net)</span></div>
    <div class="stat"><span class="n">${money(L.netCost)}</span><span>Net cost so far</span></div>
    <div class="stat"><span class="n">${money(L.pendingPayout)}</span><span>Payouts pending</span></div>
  </div>
  <section class="card">
    <h2>Who used what</h2>
    <p class="muted small">A guest's seat counts toward whichever partner brought them; if neither of you went, it's split.</p>
    <table class="tbl"><thead><tr><th>Game</th><th>Seats</th><th class="r">${esc(P1)}</th><th class="r">${esc(P2)}</th></tr></thead><tbody>
      ${perGame.map(({ g, share }) => `<tr data-open="${g.id}"><td>${esc(team(g.opp).abbr)} ${fmtDate(g, { month: 'short', day: 'numeric' })}</td><td>${who(g)}</td><td class="r">${share[P1] ? money(share[P1]) : ''}</td><td class="r">${share[P2] ? money(share[P2]) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No seat assignments yet.</td></tr>'}
    </tbody></table>
  </section>`;
}

// ---- Settings

function settingsView() {
  const s = state.settings;
  const f = (k, label, type = 'text', hint = '') => `<label class="field"><span>${label}</span><input data-set="${k}" type="${type}" value="${esc(s[k] ?? '')}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''}>${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
  return `
  <div class="view-head"><h1>Settings</h1></div>
  <section class="card">
    <h2>Your seats</h2>
    <div class="form-grid">${f('section', 'Section')}${f('row', 'Row')}${f('seats', 'Seats', 'text', 'e.g. 7-8')}${f('seatCount', 'Number of seats', 'number')}${f('seasonCost', 'Season cost (all seats, $)', 'number')}${f('seatMultiplier', 'Seat value multiplier', 'number', `Blank = automatic (now ${state.mult.value.toFixed(2)}×, ${esc(state.mult.basis)})`)}</div>
  </section>
  <section class="card">
    <h2>Member limits</h2>
    <div class="form-grid">${f('resaleCap', 'Resale games allowed', 'number', '7 for full season in 2026-27 (reported)')}${f('exchangeCap', 'Exchanges allowed', 'number')}${f('exchangesUsed', 'Exchanges used', 'number')}</div>
    <p class="small"><a href="https://www.nba.com/sixers/mysixerstickets" target="_blank" rel="noopener">Sixers Account Manager ↗</a> · <a href="https://www.nba.com/sixers/tickets/exchange" target="_blank" rel="noopener">Ticket exchange rules ↗</a></p>
  </section>
  <section class="card">
    <h2>Seller fees (%)</h2>
    <p class="muted small">Typical rates; your listing preview shows the real one. These drive the "you'd net" numbers.</p>
    <div class="form-grid">${f('feeTicketmaster', 'Ticketmaster', 'number')}${f('feeStubHub', 'StubHub', 'number')}${f('feeSeatGeek', 'SeatGeek', 'number')}${f('feeVivid', 'Vivid Seats', 'number')}${f('feeTickPick', 'TickPick', 'number')}
      <label class="field"><span>Default platform</span><select data-set="defaultPlatform">${PLATFORMS.map(p => `<option ${s.defaultPlatform === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>
  </section>
  <div class="list-actions"><button class="btn" data-act="savesettings">Save settings</button></div>
  <section class="card">
    <h2>Account</h2>
    <p>Signed in as <b>${esc(state.user.name)}</b>${state.user.email && !DEMO ? ` (${esc(state.user.email)})` : ''}.</p>
    <p class="small"><a href="https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit" target="_blank" rel="noopener">Open the Google Sheet ↗</a> — the app reads your "${esc(CONFIG.GAMES_TAB)}" tab and keeps listings/sales in "${esc(CONFIG.APP_TAB)}".</p>
    <div class="list-actions">${DEMO ? '<button class="btn ghost" data-act="demoreset">Reset demo data</button><button class="btn ghost" data-act="demoswap">View as ' + esc(state.user.name === P1 ? P2 : P1) + '</button>' : '<button class="btn ghost" data-act="signout">Sign out</button>'}<button class="btn ghost" data-act="reload">Refresh data</button></div>
  </section>`;
}

// ---- Game drawer

function renderDrawer() {
  const root = $('#drawer-root');
  if (!root) return;
  const g = state.games.find(x => x.id === state.open);
  document.body.classList.toggle('drawer-open', !!g);
  if (!g) { root.innerHTML = ''; return; }
  root.innerHTML = `<div class="scrim" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(g.opp)}">${drawerBody(g)}</aside>`;
  root.querySelector('.drawer').focus?.();
}

function drawerBody(g) {
  const m = mkt(g), e = est(g), s = status(g), t = team(g.opp);
  const n = seatCount();
  const fee = feePct(state.settings, g.platform || state.settings.defaultPlatform);
  const guestNames = [...new Set(state.games.flatMap(holders).filter(x => x !== P1 && x !== P2))];
  const mult = state.mult.value;
  const quick = m?.low ? Math.round(m.low * Math.max(1, mult * 0.9)) : e.value && Math.round(e.value * 0.9);
  const fair = e.basis === 'sold' ? null : e.value;
  const stretch = fair && Math.round(fair * 1.15);
  const comps = comparables(g);
  const qty = g.qtySold || n;
  const autoPayout = g.soldPrice != null ? netPayout(g.soldPrice, qty, fee) : null;
  const seatInputs = Array.from({ length: n }, (_, i) => `<label class="field"><span>Seat ${i + 1}</span><input list="names" data-seat="${i}" value="${esc(g.seats[i] || '')}" placeholder="${i === 0 ? 'Phil, Andrew, or a guest' : 'Empty'}" autocomplete="off"></label>`).join('');
  const quickNames = [P1, P2, ...guestNames.slice(0, 4)].map(nm => `<button class="pill" data-act="seatfill:${esc(nm)}">${esc(nm)}</button>`).join('');
  const a = absorbed(m);
  return `
  <div class="d-head" style="--team:${t.color}">
    <button class="icon-btn close" data-act="close" aria-label="Close">✕</button>
    <div class="vs">${logo(g, 56)}<div><span class="eyebrow">${fmtDate(g, { weekday: 'long', month: 'long', day: 'numeric' })} · ${esc(g.time)}</span><h2>${esc(g.opp)}</h2>
      <p class="muted small">${rel(g)}${m?.tv ? ' · 📺 ' + esc(m.tv) : ''}${g.doubleheader ? ' · Flyers doubleheader' : ''}${g.monWed ? ' · Mon/Wed' : ''}${m?.score ? ' · ' + esc(m.score) : ''}</p></div></div>
    <div class="d-status">${chip(s)}<span id="save-status" class="muted small"></span></div>
  </div>
  <div class="d-body">
    <section>
      <h3>Plan</h3>
      <div class="seg full">${[['undecided', 'Undecided'], ['use', 'We\'re going'], ['sell', 'Sell']].map(([k, l]) => `<button class="${g.plan === k ? 'on' : ''}" data-act="plan:${k}">${l}</button>`).join('')}</div>
      <div class="interest">
        ${CONFIG.PARTNERS.map(p => `<label class="toggle"><input type="checkbox" data-int="${p}" ${g.interest[p] ? 'checked' : ''}><span>${esc(p)} interested</span></label>`).join('')}
      </div>
    </section>

    ${g.plan === 'use' || (g.soldPrice != null && g.qtySold && g.qtySold < n) ? `
    <section>
      <h3>Who's sitting where</h3>
      <div class="pills">${quickNames}<button class="pill ghost" data-act="seatclear">Clear</button></div>
      <div class="form-grid two">${seatInputs}</div>
      <datalist id="names">${[P1, P2, ...guestNames].map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      ${holders(g).length < n ? `<p class="muted small">Empty seat? ${quick ? `A single usually goes for ~${money(Math.round(quick * 0.9))}.` : ''} Switch the plan to Sell and set "Qty sold" to 1.</p>` : ''}
    </section>` : ''}

    ${g.plan === 'sell' || g.soldPrice != null ? `
    <section>
      <h3>Listing</h3>
      <div class="form-grid">
        <label class="field"><span>Platform</span><select data-f="platform"><option value="">—</option>${PLATFORMS.map(p => `<option ${g.platform === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label class="field"><span>List price (each)</span><input data-f="listPrice" type="number" inputmode="decimal" value="${g.listPrice ?? ''}" placeholder="${fair ? fair : ''}"></label>
        <label class="field"><span>Listed on</span><input data-f="listedOn" type="date" value="${esc(g.listedOn)}"></label>
      </div>
      ${g.listPrice != null ? `<p class="small">At ${money(g.listPrice)} × ${n} on ${esc(g.platform || state.settings.defaultPlatform)} (${fee}% fee) you'd net <b>${money(netPayout(g.listPrice, n, fee))}</b>.${m?.low ? ` That's ${(g.listPrice / m.low).toFixed(2)}× today's get-in.` : ''}</p>` : ''}
      <div class="list-actions"><button class="btn ghost small" data-act="copylisting">Copy listing text</button>${g.soldPrice == null ? '<button class="btn small" data-act="marksold">Mark sold</button>' : ''}</div>
    </section>
    ${g.soldPrice != null ? `
    <section>
      <h3>Sale</h3>
      <div class="form-grid">
        <label class="field"><span>Sold for (each)</span><input data-f="soldPrice" type="number" inputmode="decimal" value="${g.soldPrice ?? ''}"></label>
        <label class="field"><span>Qty sold</span><input data-f="qtySold" type="number" inputmode="numeric" min="1" max="${n}" value="${g.qtySold ?? n}"></label>
        <label class="field"><span>Payout</span><input data-f="payout" type="number" inputmode="decimal" value="${g.payout ?? ''}" placeholder="${autoPayout ?? ''}"><small class="muted">Blank = auto (${fee}% fee)</small></label>
        <label class="field"><span>Sold on</span><input data-f="soldOn" type="date" value="${esc(g.soldOn)}"></label>
        <label class="field wide"><span>Buyer</span><input data-f="buyer" value="${esc(g.buyer)}" placeholder="Name or marketplace"></label>
      </div>
      <div class="interest">
        <label class="toggle"><input type="checkbox" data-fb="transferred" ${g.transferred ? 'checked' : ''}><span>Tickets transferred</span></label>
        <label class="toggle"><input type="checkbox" data-fb="paid" ${g.paid ? 'checked' : ''}><span>Payout received</span></label>
      </div>
      <button class="link danger small" data-act="unsell">Undo sale</button>
    </section>` : ''}` : ''}

    <section>
      <h3>Market</h3>
      <div class="kpis">
        <div><span class="label">Your seats (est.)</span><span class="val big">${money(e.basis === 'sold' ? estimate({ ...g, soldPrice: null }, state.prices, state.mult).value : e.value)}</span><span class="muted small">per ticket</span></div>
        <div><span class="label">Get-in now</span><span class="val">${money(m?.low)}</span>${trendBadge(g)}</div>
        <div><span class="label">On the market</span><span class="val">${m?.tickets?.toLocaleString() ?? '—'}</span><span class="muted small">${m?.listings ? m.listings.toLocaleString() + ' listings' : ''}</span></div>
        <div><span class="label">Left market (7d)</span><span class="val">${a == null ? '—' : a.toLocaleString()}</span><span class="muted small">sold or delisted</span></div>
      </div>
      ${priceChart(m, g)}
      ${fair ? `
      <h4>Price it</h4>
      <table class="tbl price-tbl"><thead><tr><th></th><th class="r">Each</th>${['StubHub', 'Ticketmaster', 'SeatGeek'].map(p => `<th class="r">Net · ${p}</th>`).join('')}</tr></thead><tbody>
        ${[['Quick sale', quick], ['Fair', fair], ['Stretch', stretch]].map(([l, v]) => `<tr><td>${l}</td><td class="r"><b>${money(v)}</b></td>${['StubHub', 'Ticketmaster', 'SeatGeek'].map(p => `<td class="r">${money(netPayout(v, n, feePct(state.settings, p)))}</td>`).join('')}</tr>`).join('')}
      </tbody></table>
      <p class="muted small">${pricingTip(g)}</p>` : ''}
      <div class="links">${searchLinks(g, m).map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>
    </section>

    <section>
      <h3>Similar games</h3>
      <p class="muted small">Same opponent or a similar price range. Your own sales show what seats like yours actually went for.</p>
      <table class="tbl"><thead><tr><th>Game</th><th class="r">Get-in</th><th class="r">Your est.</th><th>Outcome</th></tr></thead><tbody>
        ${comps.map(c => `<tr data-open="${c.id}"><td>${logo(c, 22)} ${esc(team(c.opp).abbr)} ${fmtDate(c, { month: 'short', day: 'numeric' })}${c.opp === g.opp ? ' <span class="tag">same opp</span>' : ''}</td><td class="r">${money(mkt(c)?.low)}</td><td class="r">${money(estimate({ ...c, soldPrice: null }, state.prices, state.mult).value)}</td><td>${c.soldPrice != null ? `<b class="good">Sold ${money(c.soldPrice)}</b>` : chip(status(c))}</td></tr>`).join('')}
      </tbody></table>
    </section>

    <section>
      <h3>Notes</h3>
      <textarea data-f="note" rows="3" placeholder="Parking, who's driving, promo night…">${esc(g.note)}</textarea>
    </section>

    <div class="list-actions">
      <button class="btn ghost small" data-act="ics:one">📅 Add to calendar</button>
      ${g.sheetRow ? '' : '<span class="muted small">Added in the app</span>'}
    </div>
    <p class="muted small foot">${g.updatedBy ? `Last updated by ${esc(g.updatedBy)} ${ago(g.updatedAt)}` : 'Not edited in the app yet'}${g.baseline ? ` · Sheet price ${money(g.baseline)}` : ''}</p>
  </div>`;
}

function pricingTip(g) {
  const d = daysUntil(g), m = mkt(g), t = trend(state.prices, g);
  const hot = (m?.low || 0) >= 130;
  if (isPast(g)) return '';
  if (d <= 2) return 'Inside 48 hours: prices for regular games usually sag as sellers dump inventory — price to move, or keep the seats.';
  if (hot) return `Marquee game. Demand tends to hold, so there's no rush — list at Fair or Stretch and drop toward Fair inside a week${t != null && t < -0.05 ? ' (though it is sliding this week)' : ''}.`;
  return `Regular-season game with lots of inventory (${m?.tickets?.toLocaleString() || 'plenty of'} tickets). These usually get cheaper close to game day, so listing early near Fair tends to beat waiting.`;
}

function comparables(g) {
  const v = mkt(g)?.low || g.baseline || 0;
  return state.games.filter(c => c.id !== g.id)
    .map(c => ({ c, score: (c.opp === g.opp ? -1000 : 0) + (c.soldPrice != null ? -50 : 0) + Math.abs((mkt(c)?.low || c.baseline || 0) - v) }))
    .sort((a, b) => a.score - b.score).slice(0, 5).map(x => x.c);
}

function renderDrawerStatus(g) {
  const el = $('#save-status');
  if (!el || state.open !== g.id) return;
  el.textContent = g._saving ? 'Saving…' : g._saved ? 'Saved ✓' : '';
  const st = document.querySelector('.d-status .chip');
  if (st) st.outerHTML = chip(status(g));
}

// Re-render drawer body but keep scroll position.
function refreshDrawer() {
  const d = $('.drawer');
  const top = d?.scrollTop || 0;
  renderDrawer();
  const d2 = $('.drawer');
  if (d2) d2.scrollTop = top;
}

// ---------------------------------------------------------------- events

function currentGame() { return state.games.find(x => x.id === state.open); }

async function onClick(e) {
  const openEl = e.target.closest('[data-open]');
  const actEl = e.target.closest('[data-act]');
  if (actEl) {
    const [act, arg] = actEl.dataset.act.split(/:(.*)/s);
    e.preventDefault();
    return action(act, arg, actEl);
  }
  if (openEl) {
    e.preventDefault();
    openGame(openEl.dataset.open);
  }
}

async function action(act, arg) {
  const g = currentGame();
  switch (act) {
    case 'signin': return doSignIn();
    case 'signout': auth.signOut(); state.user = null; state.games = []; return render();
    case 'reload': state.error = ''; return loadAll();
    case 'menu': return go('settings');
    case 'go': return go(arg);
    case 'close': return closeGame();
    case 'filter': state.filter = arg; return state.view === 'games' ? render() : go('games');
    case 'mode': state.gamesMode = arg; return render();
    case 'msort': state.marketSort = arg; return render();
    case 'savesettings': return saveSettings();
    case 'demoreset': store.reset(); return loadAll();
    case 'demoswap': state.user = { ...state.user, name: state.user.name === P1 ? P2 : P1 }; toast(`Viewing as ${state.user.name}`); return render();
    case 'ics': return downloadIcs(arg === 'one' ? [g] : arg === 'mine' ? state.games.filter(x => holders(x).includes(state.user.name)) : state.games, arg);
    case 'addgame': return addGame();
  }
  if (!g) return;
  switch (act) {
    case 'plan':
      g.plan = arg;
      if (arg === 'use' && !holders(g).length) g.seats = CONFIG.PARTNERS.filter(p => g.interest[p]);
      if (arg === 'sell' && !g.platform) g.platform = state.settings.defaultPlatform || '';
      break;
    case 'seatfill': {
      const seats = [...g.seats];
      if (seats.includes(arg)) break;
      const i = Array.from({ length: seatCount() }, (_, k) => k).find(k => !seats[k]);
      seats[i ?? seatCount() - 1] = arg;
      g.seats = seats;
      break;
    }
    case 'seatclear': g.seats = []; break;
    case 'marksold':
      g.soldPrice = g.listPrice ?? est(g).value;
      g.qtySold = seatCount();
      g.soldOn = new Date().toLocaleDateString('en-CA');
      g.platform ||= state.settings.defaultPlatform || '';
      break;
    case 'unsell': Object.assign(g, { soldPrice: null, qtySold: null, payout: null, soldOn: '', buyer: '', transferred: false, paid: false }); break;
    case 'copylisting': return copyListing(g);
    default: return;
  }
  refreshDrawer();
  persist(g);
}

function onChange(e) {
  const el = e.target;
  if (el.dataset.set) {
    state.settings[el.dataset.set] = el.value;
    return;
  }
  const g = currentGame();
  if (!g) return;
  if (el.dataset.int) { g.interest[el.dataset.int] = el.checked; persist(g); return; }
  if (el.dataset.fb) { g[el.dataset.fb] = el.checked; persist(g); return; }
  if (el.dataset.seat != null) {
    const seats = [...g.seats];
    seats[+el.dataset.seat] = el.value.trim();
    g.seats = seats;
    persist(g);
    return;
  }
  if (el.dataset.f) {
    setField(g, el.dataset.f, el.value);
    if (['platform', 'listPrice', 'soldPrice', 'qtySold'].includes(el.dataset.f)) refreshDrawer();
    persist(g);
  }
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.f === 'note') {
    const g = currentGame();
    if (g) { g.note = el.value; persistSoon(g, 1200); }
  }
}

function setField(g, k, v) {
  const numeric = ['listPrice', 'soldPrice', 'qtySold', 'payout', 'fees'];
  if (numeric.includes(k)) {
    const n = v === '' ? null : Number(v);
    g[k] = Number.isFinite(n) ? n : null;
    if (k === 'listPrice' && g.listPrice != null && !g.listedOn) g.listedOn = new Date().toLocaleDateString('en-CA');
  } else g[k] = v;
}

async function copyListing(g) {
  const s = state.settings, n = seatCount();
  const seat = [s.section && `Sec ${s.section}`, s.row && `Row ${s.row}`, s.seats && `Seats ${s.seats}`].filter(Boolean).join(', ');
  const price = g.listPrice ?? est(g).value;
  const text = `${n} tickets: 76ers vs ${g.opp} — ${fmtDate(g, { weekday: 'short', month: 'short', day: 'numeric' })}, ${g.time} at Xfinity Mobile Arena.${seat ? ' ' + seat + '.' : ''} ${money(price)} each. Mobile transfer.`;
  try { await navigator.clipboard.writeText(text); toast('Listing copied'); } catch { prompt('Copy this:', text); }
}

function addGame() {
  const date = prompt('Date of the new home game (M/D/YYYY), e.g. 12/8/2026');
  if (!date || !parseDate(date)) return;
  const opp = prompt(`Opponent (e.g. ${TEAM_NAMES[3]})`);
  if (!opp) return;
  const time = prompt('Tip-off (e.g. 7:00 PM)', '7:00 PM') || '7:00 PM';
  store.addGame({ date, opp, time, doing: '', phil: false, andrew: false, wantSell: false, decided: false, note: 'NBA Cup game', price: '' }, state.user.name)
    .then(g => { state.games.push(g); state.games.sort((a, b) => a.dateObj - b.dateObj); render(); toast('Game added'); })
    .catch(err => toast('Could not add: ' + err.message));
}

function downloadIcs(games, kind) {
  const pad = n => String(n).padStart(2, '0');
  const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sixers Seats//EN', 'CALSCALE:GREGORIAN'];
  for (const g of games.filter(Boolean)) {
    const st = startTime(g), en = new Date(st.getTime() + 2.5 * 3600e3);
    const h = holders(g);
    lines.push('BEGIN:VEVENT', `UID:${g.id}-sixers-seats`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(st)}`, `DTEND:${stamp(en)}`,
      `SUMMARY:76ers vs ${team(g.opp).abbr}${h.length ? ' (' + h.join(', ') + ')' : ''}`,
      'LOCATION:Xfinity Mobile Arena\\, 3601 S Broad St\\, Philadelphia PA',
      `DESCRIPTION:${STATUS_LABEL[status(g)]}${g.note ? ' — ' + g.note.replace(/[,;\n]/g, ' ') : ''}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = kind === 'one' ? `sixers-${games[0].id}.ics` : `sixers-${kind}-games.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

let toastTimer;
function toast(msg, onTap) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (onTap ? ' tappable' : '');
  el.onclick = onTap ? () => { el.className = ''; onTap(); } : null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, onTap ? 12000 : 2500);
}

// Live countdown on the hero card.
setInterval(() => {
  const el = document.querySelector('[data-countdown]');
  if (!el) return;
  const ms = Date.parse(el.dataset.countdown) - Date.now();
  if (ms <= 0) { el.textContent = 'Tip-off!'; return; }
  const d = Math.floor(ms / 86400e3), h = Math.floor(ms / 3600e3) % 24, m = Math.floor(ms / 60e3) % 60, s = Math.floor(ms / 1000) % 60;
  el.innerHTML = [[d, 'd'], [h, 'h'], [m, 'm'], [s, 's']].map(([v, u]) => `<span><b>${String(v).padStart(2, '0')}</b>${u}</span>`).join('');
}, 1000);

boot();
