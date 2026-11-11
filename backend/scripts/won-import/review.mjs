#!/usr/bin/env node
// Generate human-review checklist with map links; does not modify points or DB.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const points=JSON.parse(await readFile(root+'points.json','utf8'));
const lines=[
 '# Recycling Drop Points: coordinate review',
 '',
 'Geocoding results are *candidates*, not the exact physical drop box.',
 'Verify the building/address and specific bin placement before setting geoStatus to approved.',
 'Do not approve the public-inaccessible #28 without explicit proof that the public may visit.',
 '',
 '| # | Location | Coordinates | Geocoding result | Review |',
 '|---|---|---|---|---|',
];
for(const p of points){
  const coords=Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)
    ? `[${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}](https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=18/${p.latitude}/${p.longitude})`:'Not found';
  const display=(p.geoDisplayName||'—').replaceAll('|','/');
  const flags=[p.geoStatus,p.requiresManualReview?'requires point validation':null,p.publicAccess===false?'not public':null].filter(Boolean).join('; ');
  lines.push(`| ${p.sourceId} | ${p.name.replaceAll('|','/')} | ${coords} | ${display} | ${flags} |`);
}
lines.push('','Sources: WON Drop Points.pdf (31) and Trash Lucky dropoffs (20). Coordinates: OpenStreetMap Nominatim candidate/approximate results.','');
await writeFile(root+'geocode-review.md',lines.join('\n'));
console.log('Review report written: scripts/won-import/geocode-review.md');
