#!/usr/bin/env node
// Geocode WON point candidates via public OpenStreetMap Nominatim (one request/second).
// Coordinates remain "candidate" until manually verified. Never silently guess.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('./points.json', import.meta.url));
const points = JSON.parse(await readFile(file, 'utf8'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const force = process.argv.includes('--retry');
const q = (p) => {
  const name = p.name.replace(/ - Thammasat.*/, '');
  return name + ', ' + p.address;
};
function validThailand(lat, lon) {
  return lat >= 5.5 && lat <= 20.6 && lon >= 97 && lon <= 106;
}
function compareLocation(p, displayName) {
  const parts = p.address.match(/(กรุงเทพมหานคร|ปทุมธานี|นนทบุรี|สมุทรปราการ|เขต[^ ]+|อำเภอ[^ ]+|[0-9]{5})/g) || [];
  const province = p.address.includes('ปทุมธานี') ? ['ปทุมธานี', 'Pathum Thani'] : p.address.includes('นนทบุรี') ? ['นนทบุรี', 'Nonthaburi'] : p.address.includes('สมุทรปราการ') ? ['สมุทรปราการ', 'Samut Prakan'] : ['กรุงเทพมหานคร', 'Bangkok'];
  const provinceMatch = province.some((v) => displayName.includes(v));
  const district = parts.find((x) => x.startsWith('เขต') || x.startsWith('อำเภอ'));
  const districtMatch = district ? displayName.includes(district.replace(/^(เขต|อำเภอ)/, '')) : null;
  return {provinceMatch, districtMatch};
}
let found=0, missing=0, failed=0;
for (const p of points) {
  if (!force && p.geoStatus !== 'pending' && p.geoStatus !== 'error') continue;
  const candidates = [q(p), p.name + ', Thailand', p.address];
  let best=null;
  for (const phrase of candidates) {
    const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      q: phrase, format:'jsonv2', countrycodes:'th', limit:'3', addressdetails:'1',
    });
    try {
      const response = await fetch(url, {headers:{
        'User-Agent':'NearCycleWONImport/1.0 (educational project; supervised import)',
        'Accept':'application/json',
      }, signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('HTTP '+response.status);
      const places=await response.json();
      for (const place of places) {
        const latitude=Number(place.lat), longitude=Number(place.lon);
        if (!validThailand(latitude,longitude)) continue;
        const check=compareLocation(p,place.display_name||'');
        if (!check.provinceMatch) continue;
        const rank=(check.districtMatch===true?2:0)+(place.name && p.name.includes(place.name)?2:0);
        if (!best || rank>best.rank) best={latitude,longitude,rank,check,place};
      }
      await wait(1100);
      if (best) break;
    } catch(error) {
      failed++; console.error('Geocoding request error:',p.sourceId,error.message);
      await wait(1100);
    }
  }
  if (best) {
    p.latitude=best.latitude; p.longitude=best.longitude;
    p.geoStatus='candidate'; p.geoSource='OpenStreetMap Nominatim';
    p.geoDisplayName=best.place.display_name; p.geoOsmId=String(best.place.osm_type)+':'+best.place.osm_id;
    p.geoChecks=best.check; found++;
    console.log('#'+p.sourceId+' CANDIDATE '+p.latitude+','+p.longitude+' '+p.geoDisplayName);
  } else {
    p.geoStatus='needs_review'; missing++;
    console.log('#'+p.sourceId+' NOT FOUND '+p.name);
  }
  await writeFile(file,JSON.stringify(points,null,2)+'\n');
}
console.log(JSON.stringify({total:points.length,candidates:found,notFound:missing,requestErrors:failed}));
console.log('IMPORTANT: Candidate coordinates are NOT verified. Review each location before marking geoStatus=approved.');
