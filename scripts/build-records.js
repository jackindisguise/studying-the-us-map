// Parses the raw sources into data/records.json: one object per state with the exact note field values (except images).
import fs from 'node:fs';
import JSZip from 'jszip';
import { STATES, borders } from './geo.js';

const raw = (f) => fs.readFileSync(`data/raw/${f}`, 'utf8');
const YEAR = 2025;
const pron = JSON.parse(fs.readFileSync('data/pronunciation.json', 'utf8')); // run scripts/pronunciation.js to refresh

// Hand values for what the sources do not give cleanly.
const NICKNAME_FIX = { Washington: 'The Evergreen State' }; // unofficial, so not bold in the source
// Land borders with other countries, added after the neighbouring states.
const FOREIGN = { Canada: ['AK', 'ID', 'ME', 'MN', 'MT', 'NH', 'NY', 'ND', 'VT', 'WA'], Mexico: ['AZ', 'CA', 'NM', 'TX'] };

// One CSV line -> fields (handles quotes).
const csvLine = (line) => [...line.matchAll(/(?:^|,)\s*(?:"((?:[^"]|"")*)"|([^,]*))/g)].map((m) => (m[1] ?? m[2]).trim());

// Wiki markup -> plain text.
const noRefs = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
const plain = (s) => noRefs(s)
  .replace(/\{\{efn[^{}]*(\{\{[^{}]*\}\})?[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/''+/g, '')
  .trim();

// ---- Census population ----
const census = raw('census/NST-EST2025-ALLDATA.csv').split(/\r?\n/).filter(Boolean).map(csvLine);
const col = census[0].indexOf(`POPESTIMATE${YEAR}`);
const population = Object.fromEntries(census.filter((r) => Number(r[0]) === 40).map((r) => [r[4], Number(r[col])]));

// ---- BEA current-dollar GDP, millions ----
const zip = await JSZip.loadAsync(fs.readFileSync('data/raw/bea/SAGDP.zip'));
const entry = zip.file(/^SAGDP1__ALL_AREAS_\d+_\d+\.csv$/)[0];
const bea = (await entry.async('string')).split(/\r?\n/).map(csvLine);
const gcol = bea[0].indexOf(String(YEAR));
const gdp = Object.fromEntries(bea.filter((r) => r[4] === '3').map((r) => [r[1].replace(/\s*\*$/, ''), Number(r[gcol])]));

// The text of each table row that mentions a state through the given pattern.
const rowsBy = (text, pattern) => {
  const out = {};
  for (const row of text.split(/\n\|-[^\n]*/)) {
    const m = row.match(pattern);
    if (!m) continue;
    const name = m[1].replace(/ \(U\.S\. state\)|, U\.S\. state/, '').trim();
    out[name] ??= row;
  }
  return out;
};

// ---- Capital, largest city, statehood ----
const stateRows = rowsBy(raw('wikipedia/states.wiki'), /scope="row"\s*\|\s*\{\{flaglist\|([^|}]+)/);
const basics = (name) => {
  const row = plain(stateRows[name] || '');
  const m = row.match(/\n\|\s*[A-Z]{2}\s*\|\|\s*(colspan=2\s*\|)?\s*([^|]+?)\s*(?:\|\|\s*([^|]+?)\s*)?\|\|\s*\{\{dts\|([^}|]+)/);
  if (!m) return {};
  const city = (s) => s.split(',')[0];
  const date = new Date(`${m[4]} UTC`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
  return { capital: city(m[2]), largest: city(m[1] ? m[2] : m[3]), statehood: date };
};

// ---- Land area, square miles ----
const areaRows = rowsBy(raw('wikipedia/area.wiki'), /scope="row"\s*\|\s*\{\{flag\|([^|}]+)/);
const landArea = (name) => {
  // Cells after the name: total km2, total mi2, land km2, land mi2, ...
  const body = noRefs(areaRows[name] || '').split(/scope="row"[^\n]*\n/)[1] || '';
  const cells = body.replace(/\{\{[^{}]*\}\}/g, '').split(/\|\||\n\s*\|/).map((c) => c.replace(/[|\s,]/g, '')).filter(Boolean);
  return Number(cells[3]) || 0;
};

// ---- Governor and party ----
const govRows = rowsBy(raw('wikipedia/governors.wiki'), /\[\[Governor of [^|\]]+\|([^\]]+)\]\]/);
const governor = (name) => {
  const row = noRefs(govRows[name] || '');
  const cell = row.match(/!\s*scope="row"\s*\|\s*([^\n]+)/)?.[1] || '';
  const sortname = cell.match(/\{\{sortname\|([^|}]+)\|([^|}]+)/i);
  const leader = sortname ? `${sortname[1]} ${sortname[2]}` : plain(cell.replace(/\{\{[^}]*\}\}/g, ''));
  // The party cell is the line after the party-colour swatch.
  const line = row.match(/\{\{party color[^\n]*\n\|([^\n]*)/)?.[1] || '';
  const party = plain(line.replace(/\{\{refn[\s\S]*$/, ''));
  return { leader, party };
};

// ---- Nicknames: the official ones are in bold ----
const nickRows = rowsBy(raw('wikipedia/nicknames.wiki'), /\{\{flag\|([^|}]+)/);
const nickname = (name) => {
  const bold = [...noRefs(nickRows[name] || '').matchAll(/'''(.+?)'''/g)].map((m) => plain(m[1]));
  return NICKNAME_FIX[name] || bold.join(', ');
};

const money = (millions) => (millions >= 1e6 ? `$${(millions / 1e6).toFixed(2)} trillion` : `$${(millions / 1e3).toFixed(1)} billion`);
const int = (n) => Math.round(n).toLocaleString('en-US');

const data = STATES.map((s) => {
  const b = basics(s.name), g = governor(s.name), pop = population[s.name], gd = gdp[s.name], land = landArea(s.name);
  const next = borders(s.fips).sort((a, z) => a.localeCompare(z));
  for (const [country, list] of Object.entries(FOREIGN)) if (list.includes(s.abbr)) next.push(country);
  // [field, shown text, number to rank by]
  const numbers = [
    ['Population', pop && int(pop), pop],
    ['GDP', gd && money(gd), gd],
    ['GDP per Capita', gd && pop ? `$${int((gd * 1e6) / pop)}` : '', gd && pop ? Math.round((gd * 1e6) / pop) : 0],
    ['Land Area', land ? `${int(land)} sq mi` : '', land],
    ['Density', pop && land ? `${int(pop / land)} per sq mi` : '', pop && land ? Math.round(pop / land) : 0],
  ];
  return {
    ID: `US-${s.abbr}`, Name: s.name, Abbreviation: s.abbr, Region: s.region,
    Capital: b.capital || '', 'Largest City': b.largest || '', Borders: next.join(', '), Statehood: b.statehood || '',
    Nickname: nickname(s.name), Governor: g.leader, Party: g.party, 'As Of': String(YEAR),
    IPA: pron[s.abbr]?.ipa || '', Respelling: pron[s.abbr]?.respell || '',
    _numbers: numbers,
  };
});

// Order of admission to the Union, appended to the date: "December 7, 1787 (#1/50)". North and South Dakota were admitted on the
// same day and are conventionally numbered alphabetically (39th and 40th), so ties go by name.
data.filter((d) => d.Statehood)
  .sort((a, z) => new Date(a.Statehood) - new Date(z.Statehood) || a.Name.localeCompare(z.Name))
  .forEach((d, i) => { d.Statehood += ` (#${i + 1}/${STATES.length})`; });
data.sort((a, z) => STATES.findIndex((s) => s.name === a.Name) - STATES.findIndex((s) => s.name === z.Name));

// Rank every numeric field among the 50 states: "39,355,309 (#1/50)". Ties share a rank; 1 = highest.
const records = data.map(({ _numbers, ...r }) => {
  _numbers.forEach(([k, text, v], i) => {
    const vals = data.map((d) => d._numbers[i][2]).filter(Boolean);
    r[k] = v ? `${text} (#${1 + vals.filter((x) => x > v).length}/${vals.length})` : '';
  });
  return r;
});

fs.writeFileSync('data/records.json', JSON.stringify(records, null, 1) + '\n');
console.log(records.length, 'records');
for (const k of Object.keys(records[0])) {
  const empty = records.filter((r) => !r[k]).map((r) => r.Abbreviation);
  if (empty.length) console.log(k.padEnd(14), 'empty:', empty.join(' '));
}
