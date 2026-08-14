import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AldermanContact {
  name: string;
  wardUrl: string;
  wardOffice?: string;
  cityHallOffice?: string;
  email?: string;
  phone?: string;
  fax?: string;
}

interface AldermenData {
  [ward: string]: AldermanContact;
}

async function fetchWardPage(wardNumber: number): Promise<string> {
  const paddedWard = wardNumber.toString().padStart(2, '0');
  const url = `https://www.chicago.gov/city/en/about/wards/${paddedWard}.html`;
  
  try {
    const response = await axios.get(url, { timeout: 15000 });
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch ward ${wardNumber}:`, error instanceof Error ? error.message : error);
    return '';
  }
}

function extractContactInfo(html: string, wardNumber: number): Partial<AldermanContact> {
  const contact: Partial<AldermanContact> = {};
  
  // Extract Ward Office address
  const wardOfficeMatch = html.match(/Ward Office:<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (wardOfficeMatch) {
    contact.wardOffice = wardOfficeMatch[1]
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Extract City Hall Office
  const cityHallMatch = html.match(/City Hall Office:<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (cityHallMatch) {
    contact.cityHallOffice = cityHallMatch[1]
      .replace(/<br\s*\/?>/gi, ', ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Extract Email
  const emailMatch = html.match(/Email:<\/td>\s*<td[^>]*>.*?href="mailto:([^"]+)"/i);
  if (emailMatch) {
    contact.email = emailMatch[1].trim();
  }
  
  // Extract Phone
  const phoneMatch = html.match(/Phone:<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  if (phoneMatch) {
    contact.phone = phoneMatch[1].trim();
  }
  
  // Extract Fax
  const faxMatch = html.match(/Fax:<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  if (faxMatch) {
    contact.fax = faxMatch[1].trim();
  }
  
  return contact;
}

async function buildAldermenContacts(): Promise<void> {
  console.log('Building aldermen contacts data...');
  
  // Load existing data
  const existingPath = path.join(__dirname, '../server/data/aldermen.json');
  const existingData: AldermenData = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
  
  const updatedData: AldermenData = {};
  
  for (let ward = 1; ward <= 50; ward++) {
    console.log(`Fetching ward ${ward}...`);
    
    const existing = existingData[ward.toString()];
    if (!existing) {
      console.log(`No existing data for ward ${ward}, skipping`);
      continue;
    }
    
    const html = await fetchWardPage(ward);
    if (!html) {
      updatedData[ward.toString()] = existing;
      continue;
    }
    
    const contactInfo = extractContactInfo(html, ward);
    
    updatedData[ward.toString()] = {
      ...existing,
      ...contactInfo
    };
    
    console.log(`Ward ${ward}: ${existing.name}`);
    if (contactInfo.phone) console.log(`  Phone: ${contactInfo.phone}`);
    if (contactInfo.email) console.log(`  Email: ${contactInfo.email}`);
    
    // Small delay to be nice to the server
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Write updated data
  fs.writeFileSync(existingPath, JSON.stringify(updatedData, null, 2));
  console.log(`\nUpdated aldermen.json with contact info for ${Object.keys(updatedData).length} wards`);
}

buildAldermenContacts().catch(console.error);
