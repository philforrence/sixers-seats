// Google sign-in via Google Identity Services (token model). The access token is used
// directly against the Sheets API, so the sheet's own sharing settings are the real lock;
// the allowlist below keeps anyone else out of the UI.
import { CONFIG } from './config.js';

const SCOPES = 'openid email profile https://www.googleapis.com/auth/spreadsheets';
const KEY = 'sixers.auth';

let session = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.expiresAt > Date.now() + 60e3 ? s : (s ? { ...s, token: null } : null);
  } catch { return null; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(session)); } catch {} }

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
}

export const currentUser = () => (session?.token ? session : null);
export const lastEmail = () => session?.email || '';
export const token = () => session?.token;

// Must be called from a click (it opens Google's popup).
export async function signIn() {
  await loadGis();
  const resp = await new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: SCOPES,
      login_hint: session?.email || undefined,
      prompt: session?.email ? '' : 'select_account',
      callback: r => (r.error ? reject(new Error(r.error_description || r.error)) : resolve(r)),
      error_callback: e => reject(new Error(e.message || e.type || 'Sign-in cancelled')),
    });
    client.requestAccessToken();
  });
  if (!google.accounts.oauth2.hasGrantedAllScopes(resp, 'https://www.googleapis.com/auth/spreadsheets')) {
    throw new Error('Please allow access to Google Sheets — the app keeps everything in your shared sheet.');
  }
  const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${resp.access_token}` },
  }).then(r => r.json());
  const email = String(info.email || '').toLowerCase();
  const name = CONFIG.ALLOWED[email];
  if (!name) {
    google.accounts.oauth2.revoke(resp.access_token, () => {});
    session = null;
    save();
    throw new Error(`${email || 'That account'} isn't on the guest list. This app is just for Phil and Andrew.`);
  }
  session = { token: resp.access_token, expiresAt: Date.now() + resp.expires_in * 1000, email, name, picture: info.picture || '' };
  save();
  return session;
}

export function expire() {
  if (session) { session.token = null; save(); }
}

export function signOut() {
  if (session?.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(session.token, () => {});
  session = null;
  try { localStorage.removeItem(KEY); } catch {}
}
