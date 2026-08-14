#!/usr/bin/env node
// Downloads Illinois LODES8 WAC + RAC CSV files, aggregates to Cook County census tract level,
// and writes server/data/lodes_tract.json for use by the /api/lodes route.
// Run: node server/scripts/process_lodes.mjs

import https from 'https';
import zlib from 'zlib';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '../data/lodes_tract.json');

const WAC_URL = 'https://lehd.ces.census.gov/data/lodes/LODES8/il/wac/il_wac_S000_JT00_2021.csv.gz';
const RAC_URL = 'https://lehd.ces.census.gov/data/lodes/LODES8/il/rac/il_rac_S000_JT00_2021.csv.gz';

// WAC fields we care about (indices resolved after reading header)
const WAC_FIELDS = ['w_geocode', 'C000', 'CE01', 'CE02', 'CE03', 'CNS07', 'CNS17', 'CNS18', 'CNS19'];
const RAC_FIELDS = ['h_geocode', 'C000'];

function downloadAndAggregate(url, geocodeCol, fields) {
  return new Promise((resolve, reject) => {
    const tracts = {};
    let headers = null;
    let remainder = '';
    let rows = 0;

    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const gunzip = zlib.createGunzip();
      res.pipe(gunzip);

      gunzip.on('data', chunk => {
        const text = remainder + chunk.toString('utf8');
        const lines = text.split('\n');
        remainder = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (!headers) {
            headers = trimmed.split(',').map(h => h.replace(/"/g, '').trim());
            continue;
          }

          const vals = trimmed.split(',').map(v => v.replace(/"/g, '').trim());
          const geocodeIdx = headers.indexOf(geocodeCol);
          if (geocodeIdx < 0) continue;

          const blockGeoid = vals[geocodeIdx];
          if (!blockGeoid || blockGeoid.length < 11) continue;
          const tractGeoid = blockGeoid.substring(0, 11);
          if (!tractGeoid.startsWith('17031')) continue; // Cook County only

          if (!tracts[tractGeoid]) {
            tracts[tractGeoid] = {};
            for (const f of fields) if (f !== geocodeCol) tracts[tractGeoid][f] = 0;
          }

          for (const f of fields) {
            if (f === geocodeCol) continue;
            const idx = headers.indexOf(f);
            if (idx >= 0) {
              const n = parseInt(vals[idx] || '0', 10);
              if (!isNaN(n)) tracts[tractGeoid][f] += n;
            }
          }
          rows++;
        }
      });

      gunzip.on('end', () => {
        console.log(`  ${url.split('/').pop()}: ${rows} Cook County block rows, ${Object.keys(tracts).length} tracts`);
        resolve(tracts);
      });
      gunzip.on('error', reject);
      res.on('error', reject);
    }).on('error', reject);
  });
}

console.log('Downloading WAC (workplace area characteristics)...');
const wac = await downloadAndAggregate(WAC_URL, 'w_geocode', WAC_FIELDS);

console.log('Downloading RAC (residence area characteristics)...');
const rac = await downloadAndAggregate(RAC_URL, 'h_geocode', RAC_FIELDS);

const allTracts = new Set([...Object.keys(wac), ...Object.keys(rac)]);
const out = {};

for (const tract of allTracts) {
  const w = wac[tract] || {};
  const r = rac[tract] || {};
  out[tract] = {
    workersInTract: w.C000 || 0,       // jobs located here (daytime draw)
    residentsWhoWork: r.C000 || 0,      // residents who commute to any job
    highEarners: w.CE03 || 0,           // jobs >$3333/mo
    retailJobs: w.CNS07 || 0,
    healthcareJobs: w.CNS17 || 0,
    artsEntertainmentJobs: w.CNS18 || 0,
    foodServiceJobs: w.CNS19 || 0,
  };
}

fs.writeFileSync(OUTPUT, JSON.stringify(out));
console.log(`\nWrote ${Object.keys(out).length} Cook County tracts → ${OUTPUT}`);
