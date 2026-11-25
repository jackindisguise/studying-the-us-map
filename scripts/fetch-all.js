// Downloads the source files into data/raw/ (they are kept with the project, so builds work offline).
// Usage: node scripts/fetch-all.js             fetches only the missing files
//        node scripts/fetch-all.js --refresh   fetches everything again
import fs from 'node:fs';
import path from 'node:path';

const wiki = (page) => `https://en.wikipedia.org/w/index.php?title=${page}&action=raw`;
const SOURCES = {
  'census/NST-EST2025-ALLDATA.csv': 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/state/totals/NST-EST2025-ALLDATA.csv',
  'bea/SAGDP.zip': 'https://apps.bea.gov/regional/zip/SAGDP.zip',
  'natural-earth/ne_10m_lakes.geojson': 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson',
  'wikipedia/states.wiki': wiki('List_of_states_and_territories_of_the_United_States'),
  'wikipedia/area.wiki': wiki('List_of_U.S._states_and_territories_by_area'),
  'wikipedia/governors.wiki': wiki('List_of_current_United_States_governors'),
  'wikipedia/nicknames.wiki': wiki('List_of_U.S._state_and_territory_nicknames'),
};

const refresh = process.argv.includes('--refresh');
for (const [file, url] of Object.entries(SOURCES)) {
  const out = `data/raw/${file}`;
  if (!refresh && fs.existsSync(out)) continue;
  const res = await fetch(url, { headers: { 'User-Agent': 'anki-deck-builder/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('fetched', out);
}
