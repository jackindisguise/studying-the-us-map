// Writes one Anki-importable CSV note file with a row per state to build/notes.csv.
// Fields follow the State Map note type; Map holds <img> tags that use the real file names in build/media/.
// Usage: node scripts/build-notes.js
import fs from 'node:fs';

const DECK = 'Studying the US Map', MODEL = 'State Map', TAG = 'us-map';
const ORDER = ['Northeast', 'South', 'Midwest', 'West'];
const FIELDS = ['Name', 'Map', 'Abbreviation', 'Capital', 'Region', 'Largest City', 'Population', 'GDP', 'GDP per Capita', 'Land Area', 'Density', 'Statehood', 'Nickname', 'Governor', 'Party', 'Borders', 'As Of', 'ID', 'IPA', 'Respelling'];

// Most populous first (Population is formatted text like '39,355,309 (#1/50)'); Anki shows new cards in this order.
const pop = (r) => Number(r.Population.split(' (')[0].replace(/\D/g, ''));
const records = JSON.parse(fs.readFileSync('data/records.json', 'utf8')).sort((a, b) => pop(b) - pop(a) || a.Name.localeCompare(b.Name));
const boxes = JSON.parse(fs.readFileSync('build/fit/boxes.json', 'utf8'));
const csv = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const header = [
  '#separator:Comma', '#html:true', `#notetype:${MODEL}`,
  `#columns:${[...FIELDS, 'Deck', 'Tags'].join(',')}`,
  `#deck column:${FIELDS.length + 1}`, `#tags column:${FIELDS.length + 2}`,
];
const rows = records.map((r) => {
  const zoom = `us-zoom-${r.Abbreviation}.svg`;
  const f = {
    ...r,
    Map: `<img src="us-map-${r.Abbreviation}.svg" data-box="${boxes[r.ID].join(',')}">`
      // Tiny states also get a zoom box the card pins to its top-left corner.
      + (fs.existsSync(`build/media/${zoom}`) ? `<img class="zoom" src="${zoom}">` : ''),
  };
  const deck = `${DECK}::${String(ORDER.indexOf(r.Region) + 1).padStart(2, '0')}. ${r.Region}`;
  return [...FIELDS.map((k) => f[k] || ''), deck, TAG].map(csv).join(',');
});
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/notes.csv', [...header, ...rows].join('\n') + '\n');
console.log('wrote', rows.length, 'notes to build/notes.csv');
