// The 50 states: shapes (us-atlas, Census cartographic boundaries at 1:10m), land borders (shared arcs) and Census regions.
import fs from 'node:fs';
import { feature, neighbors } from 'topojson-client';

const dir = new URL('../', import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));

export const STATES = read('data/states.json'); // [{ abbr, fips, name, region }]
const topo = read('node_modules/us-atlas/states-10m.json');
const geoms = topo.objects.states.geometries;
const adj = neighbors(geoms);

// Every shape in the atlas (including DC and the territories), used as the map backdrop.
export const atlas = feature(topo, topo.objects.states).features;
const byFips = new Map(atlas.map((f) => [f.id, f]));
export const shapes = new Map(STATES.map((s) => {
  const f = byFips.get(s.fips);
  if (!f) throw new Error(`No shape for ${s.abbr}`);
  return [s.abbr, f];
}));

// Land borders with other states and DC. States that only meet at a point (Four Corners) or across water do not count.
export const borders = (fips) => adj[geoms.findIndex((g) => g.id === fips)].map((j) => geoms[j].properties.name);
