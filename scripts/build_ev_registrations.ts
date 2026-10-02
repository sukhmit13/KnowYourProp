import fs from 'fs';
import path from 'path';
import { importEVReports, refreshEVRegistrations } from '../server/evRegistrations';
import { parseEVReport, type EVReport } from '../server/evRegistrationSource';

// Normal builds discover real publisher links. Text import is only for an
// independently verified backfill when SOS blocks this runtime's network.
const textDirIndex = process.argv.indexOf('--verified-text-dir');
async function main() {
  if (textDirIndex < 0) {
    await refreshEVRegistrations(true);
    return;
  }
  const directory = process.argv[textDirIndex + 1];
  if (!directory) throw new Error('--verified-text-dir requires a directory');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const reports: EVReport[] = [];
  for (const entry of manifest) {
    const text = fs.readFileSync(path.join(directory, `${entry.year}-${String(entry.month).padStart(2, '0')}.txt`), 'utf8');
    reports.push(parseEVReport(text, entry, entry.sourceLastModified, true));
  }
  if (!reports.length) throw new Error('No verified EV reports supplied');
  const data = importEVReports(reports);
  console.log(`Imported ${reports.length} official monthly reports; county latest ${data.cookCountyMonthly.at(-1)?.year}-${data.cookCountyMonthly.at(-1)?.month}`);
}
main().catch(() => {
  console.error('EV import failed; verified data retained. Check source access, report format, and scraping credentials.');
  process.exitCode = 1;
});