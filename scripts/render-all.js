// Renders one SVG map per state into build/media/ (all states, or only the abbreviations given), plus build/fit/boxes.json.
// Each map is a big square, north-up Mercator view centred on the state at a true ground scale: the state in red, the other
// states in cream, Canada, Mexico and other countries in grey. The card script scales and positions the image so the state
// fits any window, using the box recorded in boxes.json.
// Tiny states also get a zoom box (build/media/us-zoom-<abbr>.svg) with a scale bar, which the card pins to its top-left.
// Usage: node scripts/render-all.js [CA RI ...]
import fs from 'node:fs';
import { feature } from 'topojson-client';
import { geoMercator, geoPath, geoArea, geoBounds } from 'd3-geo';
import { STATES, shapes, atlas } from './geo.js';

const SIZE = 1600; // canvas of the main map, px
const SHARE = 0.4; // the state's larger side takes at most this share of the canvas
const MIN_CANVAS_MI = 4000;
const CONTEXT_MI = 1500; // the card never zooms in past a view this many miles across
// States that need a wider view to show where they are: Alaska with Canada and the north-west, Hawaii with the west coast.
const WIDE = { AK: { canvas: 8000, context: 3800 }, HI: { canvas: 8000, context: 5600 } };
const ZOOM_MAX_SQMI = 5000; // states with less land than this get a zoom box
const COLORS = { ocean: '#7fb0d0', land: '#f4f1e6', border: '#8f897a', foreign: '#d8d5c9', target: '#d9381e' };
const R_MI = 3959;

const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const world = json('node_modules/world-atlas/countries-10m.json');
// Other countries (840 is the United States, drawn from the state shapes instead).
const foreign = feature(world, world.objects.countries).features.filter((f) => f.id !== '840' && f.geometry).map(solid);
// A few tiny islands in the atlas have zero-size rings that d3 reads as covering the whole globe, flooding the map.
function solid(f) {
  if (f.geometry.type !== 'MultiPolygon') return f;
  const coordinates = f.geometry.coordinates.filter((c) => geoArea({ type: 'Polygon', coordinates: c }) < 2 * Math.PI);
  return { ...f, geometry: { type: 'MultiPolygon', coordinates } };
}
// d3 wants exterior rings clockwise on the sphere (plain GeoJSON is the other way round).
const rewind = (g) => {
  const flip = (poly) => (geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map((r) => r.slice().reverse()) : poly);
  return g.type === 'MultiPolygon' ? { ...g, coordinates: g.coordinates.map(flip) } : { ...g, coordinates: flip(g.coordinates) };
};
// Only the larger lakes (the Great Lakes, which the state shapes leave out, would otherwise show as Canadian land).
const lakes = json('data/raw/natural-earth/ne_10m_lakes.geojson').features
  .filter((f) => f.geometry && f.properties.scalerank <= 2)
  .map((f) => ({ ...f, geometry: rewind(f.geometry) }));
const LABELS = [['CANADA', [-104, 56]], ['MEXICO', [-102.5, 23.5]]];

// North-up frame of a fixed ground width: Mercator centred on [lon, lat], scaled so distances are true at the centre latitude.
const frame = ([lon, lat], miles, w, h) => geoMercator().rotate([-lon, 0]).center([0, lat])
  .scale((w / miles) * R_MI * Math.cos((lat * Math.PI) / 180)).translate([w / 2, h / 2])
  .clipExtent([[-20, -20], [w + 20, h + 20]]); // nothing outside the canvas is written to the SVG

// Drops vertices closer than `min` px to the previous kept one (sub-pixel detail nobody can see).
function thin(d, min = 0.5) {
  let px = 0, py = 0;
  return d.replace(/([MLZ])([^MLZ]*)/g, (m, c, rest) => {
    if (c === 'Z') return m;
    const [x, y] = rest.split(',').map(Number);
    if (c === 'L' && Math.hypot(x - px, y - py) < min) return '';
    px = x; py = y;
    return m;
  });
}

function draw(target, proj, w, h, { ui = 2, labels = false } = {}) {
  const path = geoPath(proj).digits(1);
  const d = (list) => thin(list.map((f) => path(f)).filter(Boolean).join(''));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`
    + `<rect width="${w}" height="${h}" fill="${COLORS.ocean}"/>`
    + `<path d="${d(foreign)}" fill="${COLORS.foreign}" stroke="${COLORS.border}" stroke-width="${0.8 * ui}"/>`
    + `<path d="${d(lakes)}" fill="${COLORS.ocean}"/>`
    + `<path d="${d(atlas.filter((f) => f.id !== target.id))}" fill="${COLORS.land}" stroke="${COLORS.border}" stroke-width="${0.8 * ui}"/>`
    + `<path d="${d([target])}" fill="${COLORS.target}" stroke="${COLORS.target}" stroke-width="${0.6 * ui}"/>`;
  if (labels) {
    for (const [text, at] of LABELS) {
      const p = proj(at);
      if (!p || p[0] < 0 || p[0] > w || p[1] < 0 || p[1] > h) continue;
      svg += `<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${11 * ui}" letter-spacing="${2.5 * ui}" fill="#27323c" fill-opacity="0.55">${text}</text>`;
    }
  }
  return svg + '</svg>';
}

// The state's main land: its big parts only, so far-off islands do not pull the frame (Alaska's western Aleutians).
function mainLand(f) {
  if (f.geometry.type !== 'MultiPolygon') return f.geometry;
  const areas = f.geometry.coordinates.map((c) => geoArea({ type: 'Polygon', coordinates: c }));
  const max = Math.max(...areas);
  // Hawaii is all islands: keep every one that is at least 2% of the biggest.
  return { type: 'MultiPolygon', coordinates: f.geometry.coordinates.filter((_, i) => areas[i] >= max * 0.02) };
}

// Centre of a shape's bounding box, in lon/lat (handles shapes that cross the antimeridian).
function extentOf(geom) {
  const [[west, south], [east, north]] = geoBounds(geom);
  const width = (east - west + 360) % 360;
  const lon = ((west + width / 2 + 540) % 360) - 180;
  const my = (l) => Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360));
  const lat = ((2 * Math.atan(Math.exp((my(south) + my(north)) / 2)) - Math.PI / 2) * 180) / Math.PI;
  const miles = Math.max(width * Math.cos((lat * Math.PI) / 180) * 69.17, (north - south) * 69.17);
  return { centre: [lon, lat], miles };
}

// Zoom box: the same drawing in a frame only a little wider than the state, with a scale bar.
function drawZoom(target, geom, w = 600, h = 480, share = 0.6) {
  const [[west, south], [east, north]] = geoBounds(geom);
  const { centre } = extentOf(geom);
  const miles = Math.max(((east - west) * Math.cos((centre[1] * Math.PI) / 180) * 69.17) / share, (((north - south) * 69.17) / share) * (w / h));
  const svg = draw(target, frame(centre, miles, w, h), w, h);
  // The longest round distance that fits in about a quarter of the width.
  const bar = [100, 50, 20, 10, 5].find((m) => m <= miles / 4) || 5;
  const bx = 24, by = h - 30, bx1 = +(bx + (bar / miles) * w).toFixed(1);
  const line = `M${bx} ${by - 8}V${by}H${bx1}V${by - 8}`;
  const font = 'font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="#1d2a35" stroke="#ffffff" stroke-width="7" stroke-linejoin="round" paint-order="stroke"';
  return svg.replace('</svg>', `<path d="${line}" fill="none" stroke="#ffffff" stroke-width="9"/><path d="${line}" fill="none" stroke="#1d2a35" stroke-width="5"/>`
    + `<text x="${bx}" y="${by - 16}" ${font}>${bar} mi</text></svg>`);
}

const records = Object.fromEntries(json('data/records.json').map((r) => [r.Abbreviation, r]));
const only = process.argv.slice(2);
const BOX_FILE = 'build/fit/boxes.json';
const boxes = fs.existsSync(BOX_FILE) ? json(BOX_FILE) : {};
fs.mkdirSync('build/media', { recursive: true });
fs.mkdirSync('build/fit', { recursive: true });
const todo = STATES.filter((s) => !only.length || only.includes(s.abbr));
for (const s of todo) {
  const target = shapes.get(s.abbr);
  const geom = mainLand(target);
  const { centre, miles: extent } = extentOf(geom);
  const wide = WIDE[s.abbr];
  const canvas = wide?.canvas ?? Math.max(MIN_CANVAS_MI, Math.round(extent / SHARE));
  const context = wide?.context ?? CONTEXT_MI;
  const proj = frame(centre, canvas, SIZE, SIZE);
  const [[x0, y0], [x1, y1]] = geoPath(proj).bounds(geom);
  // [left, top, right, bottom] of the state, and the share of the canvas that is `context` miles.
  boxes[`US-${s.abbr}`] = [x0, y0, x1, y1].map((v) => +(v / SIZE).toFixed(4)).concat(+(context / canvas).toFixed(4));
  const svg = draw(target, proj, SIZE, SIZE, { labels: true });
  fs.writeFileSync(`build/media/us-map-${s.abbr}.svg`, svg);
  const land = Number(records[s.abbr]['Land Area'].split(' ')[0].replace(/,/g, ''));
  const zoom = !wide && land < ZOOM_MAX_SQMI;
  if (zoom) fs.writeFileSync(`build/media/us-zoom-${s.abbr}.svg`, drawZoom(target, geom));
  else fs.rmSync(`build/media/us-zoom-${s.abbr}.svg`, { force: true });
  console.log(`${s.abbr} ${s.name.padEnd(16)} ${String(canvas).padStart(5)} mi  ${String(Math.round(svg.length / 1024)).padStart(4)} KB${zoom ? '  + zoom' : ''}`);
}
fs.writeFileSync(BOX_FILE, JSON.stringify(boxes));
console.log('rendered', todo.length, 'maps to build/media');
