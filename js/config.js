// App configuration. The only value you must fill in is CLIENT_ID (see README → "Google setup").
export const CONFIG = {
  // OAuth 2.0 Web client ID from Google Cloud Console, e.g. "1234-abc.apps.googleusercontent.com".
  // Leave empty to run in demo mode (sample data saved in this browser only).
  CLIENT_ID: '205553819526-t0rlpa1omlc3qk4qdafprsum22ma3pi1.apps.googleusercontent.com',

  // The Google Sheet that holds everything. Both partners need edit access to it.
  SHEET_ID: '1MFwX0YZbs3yw6AoKuOPa9acs9t8jA0Fhe2Dyuzoyu-g',
  GAMES_TAB: 'Home Games',     // your existing tab (read + kept in sync)
  APP_TAB: 'App Data',         // created by the app: listings, sales, seat assignments
  SETTINGS_TAB: 'App Settings',// created by the app: seat info, cost, fees

  // Only these Google accounts can use the app.
  ALLOWED: {
    'philforrence@gmail.com': 'Phil',
    'mozartpc27@gmail.com': 'Andrew',
  },
  PARTNERS: ['Phil', 'Andrew'],

  // Market prices written by the GitHub Action (scripts/fetch-prices.mjs).
  PRICES_URL: 'data/prices.json',
};

export const DEMO = !CONFIG.CLIENT_ID || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'));
