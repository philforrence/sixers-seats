// Pitch messages. Wording written up front (by Claude); the app fills in the game, price,
// hook and contact name. "Next wording" cycles through the phrasings for each message type.
import { team } from './teams.js';

export const TYPES = [['text', 'Text'], ['email', 'Email'], ['post', 'Board post']];
export const VARIANTS = [['standard', 'Standard'], ['ff', 'Friends & family'], ['come', 'Come with me']];

const SEATS = 'upper level, center court, Row 2, seats together';
const nick = opp => opp.split(' ').slice(-1)[0] === 'Blazers' ? 'Trail Blazers' : opp.replace(/^(Los Angeles|LA|New York|New Orleans|Oklahoma City|San Antonio|Golden State|Golden|Portland) /, '').split(' ').slice(-1)[0];

export function firstName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/&|\band\b/i.test(n) || /^(aunt|uncle|cousin|grandma|grandpa|nana|pop|mom|dad)\b/i.test(n)) return n;
  return n.split(/\s+/)[0];
}

function facts(g, { price, ff, pct, hook, name }) {
  const d = g.dateObj;
  return {
    hi: firstName(name) ? `Hey ${firstName(name)}` : 'Hey',
    first: firstName(name),
    opp: nick(g.opp), oppFull: g.opp, abbr: team(g.opp).abbr,
    day: d.toLocaleDateString('en-US', { weekday: 'long' }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: String(g.time || '').replace(':00', '').replace(' PM', 'pm').replace(' AM', 'am'),
    price, ff, pct, hook: hook ? hook.replace(/[.!]+$/, '') : '',
    hookLine: hook ? ` ${hook.replace(/[.!]+$/, '')}.` : '',
  };
}

// Each entry: (f) => string. Text messages stay short; one game, one clear yes/no ask.
const T = {
  text: {
    standard: [
      f => `${f.hi}! I've got 2 Sixers tickets for the ${f.opp} game on ${f.day}, ${f.date} (${f.time}).${f.hookLine} $${f.price} each, ${SEATS}. Want them?`,
      f => `${f.hi} — any interest in Sixers vs ${f.opp}, ${f.day} ${f.date} at ${f.time}?${f.hookLine} 2 tickets, $${f.price} each. Great seats, center court. Yes or no is totally fine!`,
      f => `${f.hi}, Sixers–${f.opp} ${f.day} ${f.date}, ${f.time}.${f.hookLine} I have 2 tickets at $${f.price} each if you want them.`,
    ],
    ff: [
      f => `${f.hi}! I've got 2 Sixers tickets for the ${f.opp} game on ${f.day}, ${f.date} (${f.time}).${f.hookLine} Family price: $${f.ff} each (they go for $${f.price} online). Want them?`,
      f => `${f.hi} — Sixers vs ${f.opp}, ${f.day} ${f.date} at ${f.time}.${f.hookLine} Giving friends first dibs: 2 tickets at $${f.ff} each, ${f.pct}% off what similar seats cost. Interested?`,
      f => `${f.hi}, want to go see the Sixers play the ${f.opp}? ${f.day} ${f.date}, ${f.time}.${f.hookLine} 2 tickets, center court, $${f.ff} each for you.`,
    ],
    come: [
      f => `${f.hi}! Want to come to Sixers vs ${f.opp} with me on ${f.day}, ${f.date} (${f.time})?${f.hookLine} Just cover your seat — $${f.ff}.`,
      f => `${f.hi} — I'm going to Sixers–${f.opp} ${f.day} ${f.date} at ${f.time} and have an extra seat next to me.${f.hookLine} $${f.ff} and it's yours. In?`,
      f => `${f.hi}, come to the Sixers game with me? ${f.opp}, ${f.day} ${f.date}, ${f.time}.${f.hookLine} You'd just cover your seat ($${f.ff}).`,
    ],
  },
  email: {
    standard: [
      f => `Subject: Sixers vs ${f.opp} — ${f.day}, ${f.date}: 2 tickets\n\n${f.hi},\n\nI have 2 tickets to the Sixers vs ${f.oppFull} on ${f.day}, ${f.date} at ${f.time} at Xfinity Mobile Arena.${f.hookLine}\n\nThey're ${SEATS} — some of the best upper-level seats in the building. $${f.price} each, sent to your phone through Ticketmaster.\n\nWant them? A yes or no is all I need.\n\nThanks!`,
      f => `Subject: Want to see the Sixers play the ${f.opp}?\n\n${f.hi},\n\nSixers vs ${f.oppFull}, ${f.day} ${f.date}, ${f.time}.${f.hookLine}\n\nTwo seats together, ${SEATS}. $${f.price} each, transferred to your phone.\n\nLet me know if you're in!`,
    ],
    ff: [
      f => `Subject: Sixers vs ${f.opp} — family price\n\n${f.hi},\n\nI have 2 tickets to the Sixers vs ${f.oppFull} on ${f.day}, ${f.date} at ${f.time}.${f.hookLine}\n\nThey're ${SEATS}. Similar seats are going for about $${f.price} each online — you can have them for $${f.ff} each.\n\nWant them?`,
      f => `Subject: First dibs: Sixers vs ${f.opp}, ${f.date}\n\n${f.hi},\n\nBefore I list these anywhere: 2 tickets for Sixers vs ${f.oppFull}, ${f.day} ${f.date} at ${f.time}.${f.hookLine}\n\nCenter court, upper level, Row 2. $${f.ff} each for you (${f.pct}% off).\n\nJust say yes or no!`,
    ],
    come: [
      f => `Subject: Come to the Sixers game with me?\n\n${f.hi},\n\nI'm going to Sixers vs ${f.oppFull} on ${f.day}, ${f.date} at ${f.time} and have the seat next to me.${f.hookLine}\n\nCenter court, upper level, Row 2. Just cover your seat — $${f.ff} — and come hang.\n\nIn?`,
    ],
  },
  post: {
    standard: [
      f => `Selling 2 Sixers tickets: vs ${f.oppFull}, ${f.day} ${f.date} at ${f.time}, Xfinity Mobile Arena.${f.hookLine} Upper level center court, Row 2, seats together. $${f.price} each. Mobile transfer through Ticketmaster. Message me if you want them.`,
      f => `🏀 2 tickets: Sixers vs ${f.opp}, ${f.day} ${f.date} (${f.time}).${f.hookLine} Section 201, Row 2 — upper level, center court. $${f.price} each, transferred on Ticketmaster. DM me.`,
    ],
  },
};
T.post.ff = T.post.standard;     // board posts are public, so they always use the regular price
T.post.come = T.post.standard;

export function wordings(type, variant) { return (T[type] && T[type][variant]) || T.text.standard; }

export function buildMessage(g, { type = 'text', variant = 'standard', price, ff, pct, hook, name, n = 0 }) {
  const list = wordings(type, variant);
  return list[((n % list.length) + list.length) % list.length](facts(g, { price, ff, pct, hook, name }));
}

// A fallback hook when no researched one exists: something true about the game itself.
export function defaultHook(g) {
  const d = g.dateObj, wd = d.getDay(), h = parseInt(g.time, 10);
  if (/PM/.test(g.time) && (h === 12 || h <= 4)) return 'Afternoon game';
  if (d.getMonth() === 11 && d.getDate() >= 20) return 'Holiday week game';
  if (wd === 5) return 'Friday night in South Philly';
  if (wd === 6) return 'Saturday night game';
  if (wd === 0) return 'Sunday game';
  return '';
}

// Split the email form into subject + body for mailto links.
export function splitEmail(text) {
  const m = String(text).match(/^Subject:\s*(.+)\n+([\s\S]*)$/);
  return m ? { subject: m[1].trim(), body: m[2] } : { subject: '', body: text };
}
