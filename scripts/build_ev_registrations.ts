import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const OUTPUT_DIR = path.join(process.cwd(), 'server', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'ev_registrations.json');

const BASE_URL = 'https://www.ilsos.gov/content/dam/departments/vehicles/statistics/electric';

interface EVDataPoint {
  year: number;
  month: number;
  zipCode: string;
  count: number;
}

interface EVRegistrationData {
  lastUpdated: string;
  cookCountyTotal: { year: number; month: number; count: number }[];
  byZipCode: Record<string, { year: number; month: number; count: number }[]>;
}

function getMonthlyPdfUrls(startYear: number, endYear: number): { year: number; month: number; url: string }[] {
  const urls: { year: number; month: number; url: string }[] = [];
  
  for (let year = startYear; year <= endYear; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === 2026 && month > 1) continue;
      if (year === 2017 && month < 11) continue;
      
      const monthStr = month.toString().padStart(2, '0');
      const yearStr = year.toString().slice(-2);
      const filename = `electric${monthStr}15${yearStr}.pdf`;
      urls.push({
        year,
        month,
        url: `${BASE_URL}/${year}/${filename}`
      });
    }
  }
  
  return urls;
}

async function downloadPdf(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`Timeout downloading: ${url}`);
      resolve(null);
    }, 30000);

    https.get(url, { timeout: 25000 }, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        console.log(`Failed to download ${url}: ${res.statusCode}`);
        resolve(null);
        return;
      }
      
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
      res.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    }).on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

async function parsePdfForEVData(pdfBuffer: Buffer, year: number, month: number): Promise<EVDataPoint[]> {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(pdfBuffer);
    const text = data.text;
    
    const dataPoints: EVDataPoint[] = [];
    const lines = text.split('\n');
    
    let inZipSection = false;
    
    for (const line of lines) {
      if (line.includes('ZIP') || line.includes('Zip')) {
        inZipSection = true;
        continue;
      }
      
      if (inZipSection) {
        const zipMatch = line.match(/^(\d{5})\s+(\d+)/);
        if (zipMatch) {
          const zipCode = zipMatch[1];
          const count = parseInt(zipMatch[2], 10);
          
          if (zipCode.startsWith('606') || zipCode.startsWith('607') || zipCode.startsWith('608')) {
            dataPoints.push({ year, month, zipCode, count });
          }
        }
      }
    }
    
    return dataPoints;
  } catch (err) {
    console.error('Error parsing PDF:', err);
    return [];
  }
}

async function buildEVRegistrationsData() {
  console.log('Building EV registrations data...');
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  
  const urls = getMonthlyPdfUrls(startYear, currentYear);
  console.log(`Found ${urls.length} PDFs to process`);
  
  const allData: EVDataPoint[] = [];
  
  for (const { year, month, url } of urls) {
    console.log(`Processing ${year}-${month.toString().padStart(2, '0')}...`);
    
    const pdfBuffer = await downloadPdf(url);
    if (!pdfBuffer) {
      console.log(`  Skipped (download failed)`);
      continue;
    }
    
    const dataPoints = await parsePdfForEVData(pdfBuffer, year, month);
    console.log(`  Found ${dataPoints.length} Chicago zip codes`);
    allData.push(...dataPoints);
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const byZipCode: Record<string, { year: number; month: number; count: number }[]> = {};
  const cookCountyTotals: Map<string, number> = new Map();
  
  for (const dp of allData) {
    if (!byZipCode[dp.zipCode]) {
      byZipCode[dp.zipCode] = [];
    }
    byZipCode[dp.zipCode].push({ year: dp.year, month: dp.month, count: dp.count });
    
    const key = `${dp.year}-${dp.month}`;
    cookCountyTotals.set(key, (cookCountyTotals.get(key) || 0) + dp.count);
  }
  
  const cookCountyTotal = Array.from(cookCountyTotals.entries())
    .map(([key, count]) => {
      const [year, month] = key.split('-').map(Number);
      return { year, month, count };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);
  
  const result: EVRegistrationData = {
    lastUpdated: new Date().toISOString(),
    cookCountyTotal,
    byZipCode
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nSaved to ${OUTPUT_FILE}`);
  console.log(`Total zip codes: ${Object.keys(byZipCode).length}`);
  console.log(`Total data points: ${allData.length}`);
}

buildEVRegistrationsData().catch(console.error);
