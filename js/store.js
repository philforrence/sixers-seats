// Persistence. SheetStore talks to the shared Google Sheet; DemoStore keeps a copy in localStorage.
// Both expose: load() -> { games, settings }, saveGame(game), saveSettings(settings), addGame(row).
import { CONFIG } from './config.js';
import { DEFAULT_SETTINGS, makeGame, doingText, holders } from './model.js';
import { DEMO_ROWS, DEMO_CONTACTS } from './demo-data.js';
import * as auth from './auth.js';

export class AuthError extends Error {}

// Contacts: one tab per person ("Contacts - Phil"), shown only to its owner in the app.
const CONTACT_COLS = ['name', 'phone', 'email', 'group', 'notes'];
const CONTACT_HEADERS = ['Name', 'Phone', 'Email', 'Group', 'Notes'];
const contactsTab = owner => `Contacts - ${owner}`;
const rowToContact = (r, i) => ({ id: 'c' + i + '-' + (r[0] || ''), ...Object.fromEntries(CONTACT_COLS.map((k, j) => [k, r[j] ?? ''])) });

// Columns of the app-owned tab, in order.
const APP_COLS = ['date', 'opponent', 'plan', 'seat1', 'seat2', 'seat3', 'seat4', 'platform', 'listPrice', 'listedOn',
  'soldPrice', 'qtySold', 'fees', 'payout', 'buyer', 'soldOn', 'transferred', 'paid', 'updatedBy', 'updatedAt',
  'comp', 'compAt', 'pStretch', 'p2wk', 'p5d', 'p48h', 'hook', 'paidTo'];
const APP_HEADERS = ['Date', 'Opponent', 'Plan', 'Seat 1', 'Seat 2', 'Seat 3', 'Seat 4', 'Platform', 'List Price (ea)', 'Listed On',
  'Sold Price (ea)', 'Qty Sold', 'Fees', 'Payout', 'Buyer', 'Sold On', 'Transferred', 'Paid Out', 'Updated By', 'Updated At',
  'Comparable (all-in)', 'Comparable Checked', 'Stretch Price', '14-Day Price', '5-Day Price', '2-Day Price', 'Pitch Hook', 'Paid To'];

// Header names in the existing "Home Games" tab we read (and the ones we write back).
const H = {
  date: 'Date', day: 'Day', opp: 'Opponent', time: 'Time (ET)', monWed: 'Mon/Wed', doubleheader: 'Doubleheader',
  doing: 'What we actually doin', phil: "Phil's Interested", andrew: "Andrew's Interested", wantSell: 'Want to Sell',
  decided: 'Decision Made', note: 'Note', price: 'Possible Price (1 ticket)',
};
const WRITABLE = ['doing', 'phil', 'andrew', 'wantSell', 'decided', 'note'];

const colLetter = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const q = tab => `'${tab.replace(/'/g, "''")}'`;
const nowStamp = () => new Date().toISOString();

function appValues(g, who) {
  const seats = holders(g);
  return {
    date: g.date, opponent: g.opp, plan: g.plan,
    seat1: seats[0] || '', seat2: seats[1] || '', seat3: seats[2] || '', seat4: seats[3] || '',
    platform: g.platform || '', listPrice: g.listPrice ?? '', listedOn: g.listedOn || '',
    soldPrice: g.soldPrice ?? '', qtySold: g.qtySold ?? '', fees: g.fees ?? '', payout: g.payout ?? '',
    buyer: g.buyer || '', soldOn: g.soldOn || '', transferred: g.transferred ? 'TRUE' : 'FALSE', paid: g.paid ? 'TRUE' : 'FALSE',
    updatedBy: who, updatedAt: nowStamp(),
    comp: g.comp ?? '', compAt: g.compAt || '',
    pStretch: g.pStretch ?? '', p2wk: g.p2wk ?? '', p5d: g.p5d ?? '', p48h: g.p48h ?? '',
    hook: g.hook || '', paidTo: g.paidTo || '',
  };
}

function sheetValues(g) {
  return {
    doing: doingText(g),
    phil: g.interest[CONFIG.PARTNERS[0]] ? 'TRUE' : 'FALSE',
    andrew: g.interest[CONFIG.PARTNERS[1]] ? 'TRUE' : 'FALSE',
    wantSell: g.plan === 'sell' ? 'TRUE' : 'FALSE',
    decided: g.plan !== 'undecided' ? 'TRUE' : 'FALSE',
    note: g.note || '',
  };
}

export class SheetStore {
  constructor() { this.cols = {}; this.appRows = 0; this.lastSheetRow = 0; }

  async api(path, { method = 'GET', body } = {}) {
    const t = auth.token();
    if (!t) throw new AuthError('Signed out');
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}${path}`, {
      method,
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { auth.expire(); throw new AuthError('Session expired'); }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg = j.error?.message || res.statusText;
      throw new Error(res.status === 403 || res.status === 404
        ? `Can't open the sheet (${msg}). Make sure it's shared with ${auth.lastEmail()} as an editor.` : msg);
    }
    return res.json();
  }

  async ensureTabs() {
    const meta = await this.api('?fields=sheets.properties(title,sheetId)');
    const titles = meta.sheets.map(s => s.properties.title);
    const add = [CONFIG.APP_TAB, CONFIG.SETTINGS_TAB].filter(t => !titles.includes(t));
    if (!add.length) return;
    await this.api(':batchUpdate', { method: 'POST', body: { requests: add.map(title => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) } });
    const data = [];
    if (add.includes(CONFIG.APP_TAB)) data.push({ range: `${q(CONFIG.APP_TAB)}!A1`, values: [APP_HEADERS] });
    if (add.includes(CONFIG.SETTINGS_TAB)) data.push({ range: `${q(CONFIG.SETTINGS_TAB)}!A1`, values: [['Setting', 'Value'], ...Object.entries(DEFAULT_SETTINGS)] });
    await this.api('/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'USER_ENTERED', data } });
  }

  async load() {
    await this.ensureTabs();
    const ranges = [`${q(CONFIG.GAMES_TAB)}!A1:Z120`, `${q(CONFIG.APP_TAB)}!A1:${colLetter(APP_COLS.length - 1)}300`, `${q(CONFIG.SETTINGS_TAB)}!A1:B100`]
      .map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const res = await this.api(`/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`);
    const [gamesV, appV, setV] = res.valueRanges.map(v => v.values || []);

    // Locate the header row in Home Games (the tab has a title block above it).
    const hi = gamesV.findIndex(r => r[0] === H.date);
    if (hi < 0) throw new Error(`Couldn't find the "${H.date}" header in the "${CONFIG.GAMES_TAB}" tab.`);
    const header = gamesV[hi];
    this.cols = {};
    for (const [k, name] of Object.entries(H)) this.cols[k] = header.indexOf(name);
    const rows = [];
    for (let i = hi + 1; i < gamesV.length; i++) {
      const r = gamesV[i];
      if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(r[0] || '')) continue;
      const row = { sheetRow: i + 1 };
      for (const [k, c] of Object.entries(this.cols)) row[k] = c >= 0 ? (r[c] ?? '') : '';
      rows.push(row);
      this.lastSheetRow = i + 1;
    }

    const app = {};
    appV.slice(1).forEach((r, i) => {
      if (!r[0]) return;
      const o = { appRow: i + 2 };
      APP_COLS.forEach((k, j) => { o[k] = r[j] ?? ''; });
      app[r[0]] = o;
    });
    this.appRows = Math.max(1, appV.length);
    // Tabs created by an older version have fewer columns; extend the header row.
    if ((appV[0] || []).length < APP_HEADERS.length) {
      await this.api(`/values/${encodeURIComponent(`${q(CONFIG.APP_TAB)}!A1`)}?valueInputOption=RAW`, { method: 'PUT', body: { values: [APP_HEADERS] } });
    }

    const settings = { ...DEFAULT_SETTINGS };
    setV.slice(1).forEach(([k, v]) => { if (k) settings[k] = v ?? ''; });

    const games = rows.map(r => makeGame(r, app[r.date])).filter(g => g.dateObj);
    // Games added in the app (e.g. the NBA Cup date) live only in the app tab.
    const known = new Set(rows.map(r => r.date));
    for (const [date, a] of Object.entries(app)) {
      if (known.has(date) || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) continue;
      games.push(makeGame({ date, opp: a.opponent, time: a.time || '7:00 PM', doing: '', price: '' }, a));
    }
    return { games, settings };
  }

  async saveGame(g, who) {
    const data = [];
    if (g.sheetRow) {
      const sv = sheetValues(g);
      for (const k of WRITABLE) {
        const c = this.cols[k];
        if (c >= 0) data.push({ range: `${q(CONFIG.GAMES_TAB)}!${colLetter(c)}${g.sheetRow}`, values: [[sv[k]]] });
      }
    }
    const av = appValues(g, who);
    if (!g.appRow) g.appRow = ++this.appRows;
    data.push({ range: `${q(CONFIG.APP_TAB)}!A${g.appRow}:${colLetter(APP_COLS.length - 1)}${g.appRow}`, values: [APP_COLS.map(k => av[k])] });
    await this.api('/values:batchUpdate', { method: 'POST', body: { valueInputOption: 'USER_ENTERED', data } });
    g.updatedBy = who; g.updatedAt = av.updatedAt;
  }

  async saveSettings(settings) {
    const rows = [['Setting', 'Value'], ...Object.entries(settings).map(([k, v]) => [k, v ?? ''])];
    await this.api(`/values/${encodeURIComponent(`${q(CONFIG.SETTINGS_TAB)}!A1:B${rows.length}`)}?valueInputOption=RAW`, { method: 'PUT', body: { values: rows } });
  }

  async loadContacts(owner) {
    const tab = contactsTab(owner);
    const meta = await this.api('?fields=sheets.properties(title)');
    if (!meta.sheets.some(x => x.properties.title === tab)) {
      await this.api(':batchUpdate', { method: 'POST', body: { requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] } });
      await this.api(`/values/${encodeURIComponent(`${q(tab)}!A1`)}?valueInputOption=RAW`, { method: 'PUT', body: { values: [CONTACT_HEADERS] } });
      return [];
    }
    const res = await this.api(`/values/${encodeURIComponent(`${q(tab)}!A2:E2000`)}`);
    return (res.values || []).filter(r => r[0]).map(rowToContact);
  }

  // Rewrites the whole tab: contact lists are small and only their owner edits them.
  async saveContacts(owner, list) {
    const tab = contactsTab(owner);
    const rows = [CONTACT_HEADERS, ...list.map(c => CONTACT_COLS.map(k => c[k] || ''))];
    await this.api(`/values/${encodeURIComponent(`${q(tab)}!A1:E${rows.length}`)}?valueInputOption=RAW`, { method: 'PUT', body: { values: rows } });
    await this.api(`/values/${encodeURIComponent(`${q(tab)}!A${rows.length + 1}:E2000`)}:clear`, { method: 'POST', body: {} });
  }

  // New games (e.g. the NBA Cup game added in December) go in the app tab only,
  // so we never disturb the formatting/totals of the Home Games tab.
  async addGame(row, who) {
    const g = makeGame(row, null);
    await this.saveGame(g, who);
    return g;
  }
}

const DEMO_KEY = 'sixers.demo.v1';

export class DemoStore {
  async load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch {}
    const settings = { ...DEFAULT_SETTINGS, section: '112', row: '14', seats: '7-8', seasonCost: 8200, ...(saved?.settings || {}) };
    const rows = DEMO_ROWS.map((r, i) => ({ sheetRow: i + 7,
      date: r[0], day: r[1], opp: r[2], time: r[3], monWed: r[4], doubleheader: r[5], doing: r[6],
      phil: !!r[7], andrew: !!r[8], wantSell: !!r[9], decided: !!r[10], note: r[11], price: r[12],
    }));
    for (const extra of saved?.extra || []) rows.push(extra);
    const games = rows.map(r => {
      const id = r.date;
      const g = makeGame(r, saved?.app?.[id] || null);
      if (saved?.sheet?.[id]) Object.assign(g, { interest: saved.sheet[id].interest, note: saved.sheet[id].note });
      return g;
    });
    this.state = { saved: saved || { app: {}, sheet: {}, settings: {}, extra: [] }, games };
    return { games, settings };
  }
  persist() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.state.saved)); } catch {} }
  async saveGame(g, who) {
    const av = appValues(g, who);
    this.state.saved.app[g.date] = av;
    this.state.saved.sheet[g.date] = { interest: g.interest, note: g.note };
    g.updatedBy = who; g.updatedAt = av.updatedAt;
    this.persist();
  }
  async saveSettings(s) { this.state.saved.settings = s; this.persist(); }
  async addGame(row, who) {
    this.state.saved.extra.push(row);
    const g = makeGame(row, null);
    await this.saveGame(g, who);
    return g;
  }
  async loadContacts(owner) {
    const saved = this.state.saved.contacts?.[owner];
    if (saved) return saved;
    return owner === CONFIG.PARTNERS[0] ? DEMO_CONTACTS.map((r, i) => rowToContact([...r, ''], i)) : [];
  }
  async saveContacts(owner, list) { (this.state.saved.contacts ||= {})[owner] = list; this.persist(); }
  reset() { try { localStorage.removeItem(DEMO_KEY); } catch {} }
}
