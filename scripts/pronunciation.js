// English pronunciation of each state's name.
//  1. IPA: from the English entry on Wiktionary (the "Pronunciation" lines, US reading preferred). The raw lines are cached in
//     data/raw/wiktionary/pronunciation.json so the deck can be rebuilt offline.
//  2. Respelling ("kroh-AY-shuh"): generated from the IPA by scripts/respell.js, so every state follows the same key.
// Writes data/pronunciation.json: { CO: { ipa: "/…/", respell: "…" } }.
// Usage: node scripts/pronunciation.js            use the cache, fetch only what is missing
//        node scripts/pronunciation.js --refresh  fetch everything again (needs internet access)
import fs from 'node:fs';
import { respell } from './respell.js';

const UA = { 'User-Agent': 'anki-deck-builder/1.0' };
const RAW = 'data/raw/wiktionary/pronunciation.json';
const STATES = JSON.parse(fs.readFileSync('data/states.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Wiktionary title when it differs from the state name in data/states.json.
const TITLE = {};
// Hand-checked IPA, by state abbreviation, for names Wiktionary has no usable entry for.
const IPA_OVERRIDES = {
  NH: '/ˌnu ˈhæmpʃɚ/', // the entry writes the two words as one
  NY: '/ˌnu ˈjɔɹk/', // "noo", as in the entry's other American reading and the other "New" states
  NC: '/ˌnɔɹθ ˌkɛɹəˈlaɪnə/', // the entry's pick was British; this matches South Carolina
  SC: '/ˌsaʊθ ˌkɛɹəˈlaɪnə/',
};

const raw = fs.existsSync(RAW) && !process.argv.includes('--refresh') ? JSON.parse(fs.readFileSync(RAW, 'utf8')) : {};
const save = () => { fs.mkdirSync('data/raw/wiktionary', { recursive: true }); fs.writeFileSync(RAW, JSON.stringify(raw, null, 1)); };

async function wikitext(title) {
  const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&redirects=1&format=json&formatversion=2`;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.status === 404) return null;
    if (r.ok) { const j = await r.json(); return j.parse?.wikitext ?? null; }
    await sleep(Number(r.headers.get('retry-after')) * 1000 || 5000 * (i + 1));
  }
  throw new Error('failed: ' + url);
}

// The English section's pronunciation lines, one per accent: [{ labels: ['US'], ipa: ['/…/', …] }].
function englishLines(wt) {
  const m = wt.match(/(?:^|\n)==English==\n([\s\S]*?)(?=\n==[^=]|$)/);
  if (!m) return [];
  const out = [];
  for (const line of m[1].split('\n')) {
    // {{IPA|en|/…/|/…/|a=US}}: positional parameters are transcriptions, a= is the accent the line is for.
    for (const m of line.matchAll(/\{\{IPA\|en\|([^}]*)\}\}/g)) {
      const parts = m[1].split('|');
      const labels = (parts.find((p) => p.startsWith('a=')) || '').slice(2).split(',').map((x) => x.trim()).filter(Boolean);
      out.push({ labels, ipa: parts.filter((p) => /^\/.+\/$|^\[.+\]$/.test(p)) });
    }
  }
  return out.filter((l) => l.ipa.length);
}

for (const c of STATES) {
  if (raw[c.abbr]) continue;
  const title = TITLE[c.abbr] || c.name;
  const wt = await wikitext(title);
  raw[c.abbr] = { title, lines: wt ? englishLines(wt) : [] };
  console.log(c.abbr.padEnd(4), title.padEnd(28), raw[c.abbr].lines.map((l) => `${l.labels.join(',')}: ${l.ipa.join(' ')}`).join('  |  '));
  save();
  await sleep(400);
}

// The entry lists one line per accent (UK, US, regional ones) with several transcriptions each: take the first US one, else the first
// UK one, else the first line with no regional label. Syllable dots are kept; respell.js uses them as boundaries.
const out = {};
for (const c of STATES) {
  const lines = raw[c.abbr]?.lines || [];
  // Phonemic (/…/) transcriptions only, not phonetic ([…]) ones. Order of preference: a US line, a line with no accent label,
  // a UK line, any line. Labels like "pin-pen" or "rare" mark a variant, so they never count as a plain US or UK line.
  const phonemic = lines.map((l) => ({ ...l, ipa: l.ipa.filter((p) => p.startsWith('/')) })).filter((l) => l.ipa.length);
  const accent = (l, re) => l.labels.some((x) => re.test(x)) && l.labels.every((x) => /^(US|GenAm|General American|GA|CA|Canada|UK|RP|Received Pronunciation|AU|NZ)$/i.test(x));
  const US = /^(US|GenAm|General American|GA)$/i;
  // A US line with a further qualifier (e.g. "US,non-cot-caught") still beats an unlabelled or UK one, unless it marks a rare variant.
  const qualified = (l) => l.labels.some((x) => US.test(x)) && !l.labels.some((x) => /rare|less common|pin-pen|dated|imitating/i.test(x));
  const line = phonemic.find((l) => accent(l, US)) || phonemic.find(qualified) || phonemic.find((l) => !l.labels.length)
    || phonemic.find((l) => accent(l, /^(UK|RP|Received Pronunciation)$/i)) || phonemic[0];
  const ipa = IPA_OVERRIDES[c.abbr] || line?.ipa[0];
  if (ipa) { try { out[c.abbr] = { ipa, respell: respell(ipa) }; } catch (e) { console.log(c.abbr, e.message); } }
}
fs.writeFileSync('data/pronunciation.json', `${JSON.stringify(out, null, 1)}\n`);
console.log('pronunciations:', Object.keys(out).length, '/', STATES.length, 'missing:', STATES.filter((c) => !out[c.abbr]).map((c) => c.abbr).join(' '));
