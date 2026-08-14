import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ChildcareData {
  zipCode: string;
  childrenUnder5: number;
  licensedSlots: number;
  centerSlots: number;
  familyHomeSlots: number;
  childrenPerSlot: number | null;
  status: 'desert' | 'underserved' | 'adequate' | 'unknown';
  statusLabel: string;
  sources: {
    childrenSource: string;
    childrenYear: string;
    childcareSource: string;
    childcareYear: string;
  };
}

interface CommunityAreaChildcareData {
  communityArea: string;
  childrenUnder5: number;
  licensedSlots: number;
  centerSlots: number;
  familyHomeSlots: number;
  childrenPerSlot: number | null;
  status: 'desert' | 'underserved' | 'adequate' | 'unknown';
  statusLabel: string;
  sources: {
    childrenSource: string;
    childrenYear: string;
    childcareSource: string;
    childcareYear: string;
  };
}

let childrenData: Map<string, number> = new Map();
let childcareData: Map<string, { center: number; home: number }> = new Map();
let communityAreaData: Map<string, { childrenUnder5: number; licensedSlots: number; centerSlots: number; familyHomeSlots: number }> = new Map();
let dataLoaded = false;
let loadingPromise: Promise<void> | null = null;

function normalizeZip(zip: string | number): string {
  return String(zip).padStart(5, '0');
}

function sheetToArray(worksheet: ExcelJS.Worksheet): any[][] {
  const rows: any[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const arr = (row.values as any[]).slice(1).map((v: any) => v ?? '');
    rows.push(arr);
  });
  return rows;
}

export async function loadChildcareData(): Promise<void> {
  if (dataLoaded) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = _doLoad();
  return loadingPromise;
}

async function _doLoad(): Promise<void> {

  try {
    const childrenPath = path.join(__dirname, 'data', 'cook_zip_children.xlsx');
    const childcarePath = path.join(__dirname, 'data', 'cook_zip_childcare.xlsx');

    const wb1 = new ExcelJS.Workbook();
    await wb1.xlsx.readFile(childrenPath);
    const ws1 = wb1.worksheets[0];
    const rows1 = sheetToArray(ws1);

    for (let i = 3; i < rows1.length; i++) {
      const row = rows1[i];
      if (row && row[0]) {
        const zip = normalizeZip(row[0]);
        const age0to2 = parseFloat(row[2]) || 0;
        const age3to4 = parseFloat(row[3]) || 0;
        const childrenUnder5 = Math.round(age0to2 + age3to4);
        childrenData.set(zip, childrenUnder5);
      }
    }
    console.log(`Loaded children data for ${childrenData.size} ZIP codes`);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(childcarePath);
    const ws2 = wb2.worksheets[0];
    const rows2 = sheetToArray(ws2);

    for (let i = 5; i < rows2.length; i++) {
      const row = rows2[i];
      if (row && row[0]) {
        const zip = normalizeZip(row[0]);
        const centerSlots = parseInt(row[2]) || 0;
        const homeSlots = parseInt(row[11]) || 0;
        childcareData.set(zip, { center: centerSlots, home: homeSlots });
      }
    }
    console.log(`Loaded childcare data for ${childcareData.size} ZIP codes`);

    const communityAreaPath = path.join(__dirname, 'data', 'community_area_childcare.json');
    if (fs.existsSync(communityAreaPath)) {
      const caData = JSON.parse(fs.readFileSync(communityAreaPath, 'utf-8'));
      for (const [name, data] of Object.entries(caData)) {
        const d = data as any;
        communityAreaData.set(name.toUpperCase(), {
          childrenUnder5: d.childrenUnder5,
          licensedSlots: d.licensedSlots,
          centerSlots: d.centerSlots,
          familyHomeSlots: d.familyHomeSlots,
        });
      }
      console.log(`Loaded childcare data for ${communityAreaData.size} community areas`);
    }

    dataLoaded = true;
  } catch (err) {
    console.error('Error loading childcare data:', err);
  }
}

export async function getChildcareAccess(zipCode: string): Promise<ChildcareData | null> {
  if (!dataLoaded) {
    if (loadingPromise) await loadingPromise;
    else await loadChildcareData();
  }

  const zip = normalizeZip(zipCode);
  const children = childrenData.get(zip);
  const slotsData = childcareData.get(zip);

  if (children === undefined && slotsData === undefined) {
    return null;
  }

  const childrenUnder5 = children ?? 0;
  const centerSlots = slotsData?.center ?? 0;
  const familyHomeSlots = slotsData?.home ?? 0;
  const licensedSlots = centerSlots + familyHomeSlots;

  let childrenPerSlot: number | null = null;
  let status: 'desert' | 'underserved' | 'adequate' | 'unknown' = 'unknown';
  let statusLabel = 'Not available';

  if (licensedSlots > 0 && childrenUnder5 > 0) {
    const rawRatio = childrenUnder5 / licensedSlots;
    childrenPerSlot = Math.round(rawRatio * 100) / 100;

    if (rawRatio > 3.0) {
      status = 'desert';
      statusLabel = 'Childcare desert';
    } else if (rawRatio >= 1.5) {
      status = 'underserved';
      statusLabel = 'Underserved area';
    } else {
      status = 'adequate';
      statusLabel = 'Adequate access';
    }
  } else if (licensedSlots === 0 && childrenUnder5 > 0) {
    status = 'desert';
    statusLabel = 'Childcare desert (no licensed slots)';
    childrenPerSlot = null;
  } else if (childrenUnder5 === 0 && licensedSlots > 0) {
    status = 'adequate';
    statusLabel = 'Adequate access (no children under 5 reported)';
    childrenPerSlot = 0;
  }

  return {
    zipCode: zip,
    childrenUnder5,
    licensedSlots,
    centerSlots,
    familyHomeSlots,
    childrenPerSlot,
    status,
    statusLabel,
    sources: {
      childrenSource: 'U.S. Census Bureau, American Community Survey',
      childrenYear: '2023',
      childcareSource: 'Illinois Network of Child Care Resource and Referral Agencies',
      childcareYear: '2024',
    },
  };
}

export async function getCommunityAreaChildcareAccess(communityArea: string): Promise<CommunityAreaChildcareData | null> {
  if (!dataLoaded) {
    if (loadingPromise) await loadingPromise;
    else await loadChildcareData();
  }

  const normalizedName = communityArea
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

  const data = communityAreaData.get(normalizedName);

  if (!data) {
    return null;
  }

  const { childrenUnder5, licensedSlots, centerSlots, familyHomeSlots } = data;

  let childrenPerSlot: number | null = null;
  let status: 'desert' | 'underserved' | 'adequate' | 'unknown' = 'unknown';
  let statusLabel = 'Not available';

  if (licensedSlots > 0 && childrenUnder5 > 0) {
    const rawRatio = childrenUnder5 / licensedSlots;
    childrenPerSlot = Math.round(rawRatio * 100) / 100;

    if (rawRatio > 3.0) {
      status = 'desert';
      statusLabel = 'Childcare desert';
    } else if (rawRatio >= 1.5) {
      status = 'underserved';
      statusLabel = 'Underserved area';
    } else {
      status = 'adequate';
      statusLabel = 'Adequate access';
    }
  } else if (licensedSlots === 0 && childrenUnder5 > 0) {
    status = 'desert';
    statusLabel = 'Childcare desert (no licensed slots)';
    childrenPerSlot = null;
  } else if (childrenUnder5 === 0 && licensedSlots > 0) {
    status = 'adequate';
    statusLabel = 'Adequate access (no children under 5 reported)';
    childrenPerSlot = 0;
  }

  return {
    communityArea: normalizedName,
    childrenUnder5,
    licensedSlots,
    centerSlots,
    familyHomeSlots,
    childrenPerSlot,
    status,
    statusLabel,
    sources: {
      childrenSource: 'U.S. Census Bureau, American Community Survey',
      childrenYear: '2023',
      childcareSource: 'Illinois Network of Child Care Resource and Referral Agencies',
      childcareYear: '2024',
    },
  };
}
