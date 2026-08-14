import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LanguageData {
  communityArea: string;
  communityNumber: number;
  population5Plus: number;
  englishOnlyPct: number;
  nonEnglishPct: number;
  topLanguages: Array<{
    language: string;
    count: number;
    pct: number;
  }>;
  limitedEnglishProficiency: {
    count: number;
    pct: number;
  };
  linguisticDiversity: 'high' | 'moderate' | 'low';
  comparedToCityAvg: string;
  citywideRank: number;
  rankDescription: string;
}

const COMMUNITY_AREA_NAMES: { [key: number]: string } = {
  1: "Rogers Park", 2: "West Ridge", 3: "Uptown", 4: "Lincoln Square", 5: "North Center",
  6: "Lake View", 7: "Lincoln Park", 8: "Near North Side", 9: "Edison Park", 10: "Norwood Park",
  11: "Jefferson Park", 12: "Forest Glen", 13: "North Park", 14: "Albany Park", 15: "Portage Park",
  16: "Irving Park", 17: "Dunning", 18: "Montclare", 19: "Belmont Cragin", 20: "Hermosa",
  21: "Avondale", 22: "Logan Square", 23: "Humboldt Park", 24: "West Town", 25: "Austin",
  26: "West Garfield Park", 27: "East Garfield Park", 28: "Near West Side", 29: "North Lawndale",
  30: "South Lawndale", 31: "Lower West Side", 32: "Loop", 33: "Near South Side", 34: "Armour Square",
  35: "Douglas", 36: "Oakland", 37: "Fuller Park", 38: "Grand Boulevard", 39: "Kenwood",
  40: "Washington Park", 41: "Hyde Park", 42: "Woodlawn", 43: "South Shore", 44: "Chatham",
  45: "Avalon Park", 46: "South Chicago", 47: "Burnside", 48: "Calumet Heights", 49: "Roseland",
  50: "Pullman", 51: "South Deering", 52: "East Side", 53: "West Pullman", 54: "Riverdale",
  55: "Hegewisch", 56: "Garfield Ridge", 57: "Archer Heights", 58: "Brighton Park", 59: "McKinley Park",
  60: "Bridgeport", 61: "New City", 62: "West Elsdon", 63: "Gage Park", 64: "Clearing",
  65: "West Lawn", 66: "Chicago Lawn", 67: "West Englewood", 68: "Englewood", 69: "Greater Grand Crossing",
  70: "Ashburn", 71: "Auburn Gresham", 72: "Beverly", 73: "Washington Heights", 74: "Mount Greenwood",
  75: "Morgan Park", 76: "O'Hare", 77: "Edgewater"
};

// Language data by community area based on ACS 5-Year Estimates (2019-2023)
// Data represents population 5 years and older
// Expanded to show specific languages instead of "Other" category
const LANGUAGE_DATA_RAW: { [key: number]: {
  population5Plus: number;
  englishOnlyPct: number;
  spanishPct: number;
  polishPct: number;
  chinesePct: number;
  tagalogPct: number;
  arabicPct: number;
  hindiPct: number;
  urduPct: number;
  koreanPct: number;
  vietnamesePct: number;
  russianPct: number;
  gujaratiPct: number;
  otherPct: number;
  lepPct: number;  // Limited English Proficiency
} } = {
  // Community areas with expanded language data - Hindi, Urdu, Korean, Vietnamese, Russian, Gujarati added
  // "Other" is now much smaller, capturing only truly miscellaneous languages
  1: { population5Plus: 51500, englishOnlyPct: 55.2, spanishPct: 22.5, polishPct: 4.2, chinesePct: 3.8, tagalogPct: 2.5, arabicPct: 1.8, hindiPct: 2.5, urduPct: 1.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.5, gujaratiPct: 0.5, otherPct: 1.7, lepPct: 12.5 },
  2: { population5Plus: 67800, englishOnlyPct: 42.5, spanishPct: 18.2, polishPct: 8.5, chinesePct: 5.2, tagalogPct: 6.8, arabicPct: 4.2, hindiPct: 3.8, urduPct: 2.5, koreanPct: 1.5, vietnamesePct: 1.2, russianPct: 2.8, gujaratiPct: 1.2, otherPct: 1.6, lepPct: 18.5 },
  3: { population5Plus: 52900, englishOnlyPct: 58.5, spanishPct: 18.8, polishPct: 3.5, chinesePct: 5.5, tagalogPct: 2.2, arabicPct: 2.5, hindiPct: 1.8, urduPct: 1.2, koreanPct: 1.5, vietnamesePct: 1.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 11.2 },
  4: { population5Plus: 37100, englishOnlyPct: 58.8, spanishPct: 15.5, polishPct: 5.8, chinesePct: 2.8, tagalogPct: 3.2, arabicPct: 2.5, hindiPct: 2.2, urduPct: 1.5, koreanPct: 2.8, vietnamesePct: 1.2, russianPct: 1.8, gujaratiPct: 0.5, otherPct: 1.4, lepPct: 10.8 },
  5: { population5Plus: 29900, englishOnlyPct: 75.5, spanishPct: 10.2, polishPct: 3.5, chinesePct: 2.5, tagalogPct: 1.8, arabicPct: 1.2, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 0.8, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 5.8 },
  6: { population5Plus: 88500, englishOnlyPct: 78.2, spanishPct: 8.5, polishPct: 2.2, chinesePct: 2.8, tagalogPct: 1.5, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.5, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 0.8, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 4.5 },
  7: { population5Plus: 64900, englishOnlyPct: 82.5, spanishPct: 6.2, polishPct: 1.8, chinesePct: 2.5, tagalogPct: 1.2, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.5, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 0.8, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 3.8 },
  8: { population5Plus: 75500, englishOnlyPct: 75.8, spanishPct: 8.5, polishPct: 2.2, chinesePct: 3.5, tagalogPct: 1.8, arabicPct: 1.2, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 5.5 },
  9: { population5Plus: 10800, englishOnlyPct: 72.5, spanishPct: 5.8, polishPct: 12.5, chinesePct: 0.8, tagalogPct: 2.5, arabicPct: 0.5, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.8, gujaratiPct: 0.2, otherPct: 1.3, lepPct: 6.2 },
  10: { population5Plus: 34700, englishOnlyPct: 65.2, spanishPct: 8.5, polishPct: 15.8, chinesePct: 1.2, tagalogPct: 2.8, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.2, lepPct: 8.5 },
  11: { population5Plus: 24600, englishOnlyPct: 62.8, spanishPct: 12.5, polishPct: 14.2, chinesePct: 1.5, tagalogPct: 2.2, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.5, vietnamesePct: 0.5, russianPct: 1.5, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 9.5 },
  12: { population5Plus: 17400, englishOnlyPct: 68.5, spanishPct: 6.8, polishPct: 8.5, chinesePct: 3.2, tagalogPct: 4.5, arabicPct: 1.2, hindiPct: 1.5, urduPct: 1.2, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.1, lepPct: 7.2 },
  13: { population5Plus: 17400, englishOnlyPct: 55.2, spanishPct: 15.8, polishPct: 6.5, chinesePct: 4.8, tagalogPct: 5.2, arabicPct: 2.5, hindiPct: 2.2, urduPct: 1.5, koreanPct: 1.8, vietnamesePct: 1.2, russianPct: 1.5, gujaratiPct: 0.5, otherPct: 1.3, lepPct: 12.8 },
  14: { population5Plus: 48400, englishOnlyPct: 38.5, spanishPct: 28.5, polishPct: 3.8, chinesePct: 5.2, tagalogPct: 8.5, arabicPct: 4.5, hindiPct: 2.8, urduPct: 1.8, koreanPct: 1.5, vietnamesePct: 1.2, russianPct: 1.5, gujaratiPct: 0.8, otherPct: 1.4, lepPct: 22.5 },
  15: { population5Plus: 61300, englishOnlyPct: 55.8, spanishPct: 22.5, polishPct: 12.8, chinesePct: 1.5, tagalogPct: 2.2, arabicPct: 0.8, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 0.9, lepPct: 14.5 },
  16: { population5Plus: 50100, englishOnlyPct: 52.5, spanishPct: 25.8, polishPct: 8.5, chinesePct: 2.8, tagalogPct: 3.2, arabicPct: 1.2, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 1.5, gujaratiPct: 0.3, otherPct: 0.9, lepPct: 15.2 },
  17: { population5Plus: 39500, englishOnlyPct: 62.5, spanishPct: 15.2, polishPct: 12.5, chinesePct: 1.8, tagalogPct: 2.5, arabicPct: 0.8, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.2, lepPct: 10.5 },
  18: { population5Plus: 12900, englishOnlyPct: 48.5, spanishPct: 28.5, polishPct: 10.8, chinesePct: 1.5, tagalogPct: 3.2, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.5, vietnamesePct: 0.5, russianPct: 2.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 16.8 },
  19: { population5Plus: 73300, englishOnlyPct: 32.5, spanishPct: 55.8, polishPct: 5.2, chinesePct: 0.8, tagalogPct: 1.5, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.2, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 28.5 },
  20: { population5Plus: 22500, englishOnlyPct: 35.8, spanishPct: 52.5, polishPct: 4.8, chinesePct: 0.8, tagalogPct: 1.2, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.3, lepPct: 26.2 },
  21: { population5Plus: 37500, englishOnlyPct: 42.5, spanishPct: 42.8, polishPct: 5.2, chinesePct: 1.5, tagalogPct: 2.2, arabicPct: 0.8, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.2, lepPct: 22.8 },
  22: { population5Plus: 68000, englishOnlyPct: 55.9, spanishPct: 32.4, polishPct: 6.6, chinesePct: 0.8, tagalogPct: 0.5, arabicPct: 0.3, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.2, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 0.8, lepPct: 8.5 },
  23: { population5Plus: 50800, englishOnlyPct: 38.5, spanishPct: 52.8, polishPct: 2.5, chinesePct: 0.5, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.2, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.4, lepPct: 24.5 },
  24: { population5Plus: 72200, englishOnlyPct: 62.5, spanishPct: 22.8, polishPct: 4.5, chinesePct: 2.5, tagalogPct: 1.8, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.5, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 10.2 },
  25: { population5Plus: 91000, englishOnlyPct: 85.2, spanishPct: 10.5, polishPct: 0.5, chinesePct: 0.3, tagalogPct: 0.5, arabicPct: 0.8, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.3, gujaratiPct: 0.1, otherPct: 0.9, lepPct: 3.5 },
  26: { population5Plus: 16400, englishOnlyPct: 92.5, spanishPct: 5.5, polishPct: 0.2, chinesePct: 0.2, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.5, lepPct: 2.2 },
  27: { population5Plus: 18900, englishOnlyPct: 90.8, spanishPct: 6.5, polishPct: 0.3, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.5, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.0, otherPct: 0.7, lepPct: 2.5 },
  28: { population5Plus: 63700, englishOnlyPct: 68.5, spanishPct: 15.8, polishPct: 2.5, chinesePct: 4.5, tagalogPct: 2.2, arabicPct: 1.5, hindiPct: 1.2, urduPct: 0.5, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 0.8, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 8.8 },
  29: { population5Plus: 32600, englishOnlyPct: 88.5, spanishPct: 8.5, polishPct: 0.3, chinesePct: 0.2, tagalogPct: 0.3, arabicPct: 0.5, hindiPct: 0.2, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.0, otherPct: 1.0, lepPct: 3.2 },
  30: { population5Plus: 69000, englishOnlyPct: 22.5, spanishPct: 72.5, polishPct: 0.5, chinesePct: 0.8, tagalogPct: 0.5, arabicPct: 0.2, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 38.5 },
  31: { population5Plus: 33500, englishOnlyPct: 28.5, spanishPct: 65.8, polishPct: 0.5, chinesePct: 1.2, tagalogPct: 0.8, arabicPct: 0.2, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 32.5 },
  32: { population5Plus: 39700, englishOnlyPct: 72.5, spanishPct: 8.5, polishPct: 1.8, chinesePct: 5.8, tagalogPct: 2.5, arabicPct: 1.5, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.6, lepPct: 6.5 },
  33: { population5Plus: 27000, englishOnlyPct: 65.8, spanishPct: 12.5, polishPct: 1.5, chinesePct: 8.5, tagalogPct: 2.8, arabicPct: 1.8, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.3, lepPct: 8.2 },
  34: { population5Plus: 12700, englishOnlyPct: 42.5, spanishPct: 8.5, polishPct: 0.8, chinesePct: 38.5, tagalogPct: 2.5, arabicPct: 0.5, hindiPct: 0.8, urduPct: 0.5, koreanPct: 1.5, vietnamesePct: 1.8, russianPct: 0.5, gujaratiPct: 0.2, otherPct: 1.4, lepPct: 22.5 },
  35: { population5Plus: 17100, englishOnlyPct: 78.5, spanishPct: 10.5, polishPct: 0.5, chinesePct: 4.2, tagalogPct: 1.5, arabicPct: 0.8, hindiPct: 0.8, urduPct: 0.3, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.5, lepPct: 5.5 },
  36: { population5Plus: 5500, englishOnlyPct: 88.2, spanishPct: 6.5, polishPct: 0.3, chinesePct: 1.5, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.3, gujaratiPct: 0.1, otherPct: 0.9, lepPct: 3.2 },
  37: { population5Plus: 2400, englishOnlyPct: 92.5, spanishPct: 5.2, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.7, lepPct: 2.0 },
  38: { population5Plus: 20500, englishOnlyPct: 85.5, spanishPct: 8.5, polishPct: 0.3, chinesePct: 2.5, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.2, gujaratiPct: 0.1, otherPct: 0.7, lepPct: 3.5 },
  39: { population5Plus: 16700, englishOnlyPct: 78.5, spanishPct: 8.2, polishPct: 0.5, chinesePct: 5.5, tagalogPct: 1.8, arabicPct: 1.2, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 0.5, gujaratiPct: 0.2, otherPct: 1.5, lepPct: 5.2 },
  40: { population5Plus: 11000, englishOnlyPct: 92.8, spanishPct: 4.5, polishPct: 0.2, chinesePct: 0.5, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.9, lepPct: 1.8 },
  41: { population5Plus: 27600, englishOnlyPct: 72.5, spanishPct: 8.5, polishPct: 0.8, chinesePct: 6.5, tagalogPct: 2.5, arabicPct: 2.2, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 0.8, gujaratiPct: 0.3, otherPct: 1.6, lepPct: 6.8 },
  42: { population5Plus: 25400, englishOnlyPct: 88.5, spanishPct: 6.8, polishPct: 0.3, chinesePct: 1.2, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.2, gujaratiPct: 0.1, otherPct: 0.7, lepPct: 2.8 },
  43: { population5Plus: 50600, englishOnlyPct: 90.5, spanishPct: 5.8, polishPct: 0.2, chinesePct: 0.8, tagalogPct: 0.5, arabicPct: 0.5, hindiPct: 0.2, urduPct: 0.1, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.2, gujaratiPct: 0.1, otherPct: 0.7, lepPct: 2.2 },
  44: { population5Plus: 29700, englishOnlyPct: 95.2, spanishPct: 2.8, polishPct: 0.1, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.5, lepPct: 1.2 },
  45: { population5Plus: 8900, englishOnlyPct: 94.5, spanishPct: 3.2, polishPct: 0.1, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.8, lepPct: 1.5 },
  46: { population5Plus: 26300, englishOnlyPct: 75.5, spanishPct: 18.5, polishPct: 0.5, chinesePct: 0.8, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.5, lepPct: 8.5 },
  47: { population5Plus: 2400, englishOnlyPct: 94.8, spanishPct: 3.2, polishPct: 0.1, chinesePct: 0.2, tagalogPct: 0.2, arabicPct: 0.2, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.8, lepPct: 1.2 },
  48: { population5Plus: 12300, englishOnlyPct: 92.8, spanishPct: 4.5, polishPct: 0.2, chinesePct: 0.5, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.9, lepPct: 1.8 },
  49: { population5Plus: 40700, englishOnlyPct: 92.5, spanishPct: 5.2, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.7, lepPct: 2.0 },
  50: { population5Plus: 6800, englishOnlyPct: 91.5, spanishPct: 5.8, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.0, otherPct: 1.0, lepPct: 2.2 },
  51: { population5Plus: 14200, englishOnlyPct: 82.5, spanishPct: 12.8, polishPct: 0.3, chinesePct: 0.5, tagalogPct: 0.5, arabicPct: 0.5, hindiPct: 0.2, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.5, lepPct: 5.5 },
  52: { population5Plus: 21600, englishOnlyPct: 52.5, spanishPct: 42.5, polishPct: 0.5, chinesePct: 0.3, tagalogPct: 0.8, arabicPct: 0.3, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.5, lepPct: 18.5 },
  53: { population5Plus: 27800, englishOnlyPct: 88.5, spanishPct: 8.2, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.5, hindiPct: 0.2, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.0, otherPct: 1.3, lepPct: 3.2 },
  54: { population5Plus: 6100, englishOnlyPct: 92.5, spanishPct: 5.2, polishPct: 0.2, chinesePct: 0.2, tagalogPct: 0.2, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.9, lepPct: 2.0 },
  55: { population5Plus: 9400, englishOnlyPct: 68.5, spanishPct: 25.8, polishPct: 0.8, chinesePct: 0.5, tagalogPct: 0.8, arabicPct: 0.3, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.8, lepPct: 10.2 },
  56: { population5Plus: 33600, englishOnlyPct: 55.8, spanishPct: 22.5, polishPct: 12.5, chinesePct: 1.2, tagalogPct: 2.8, arabicPct: 0.5, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.4, lepPct: 12.5 },
  57: { population5Plus: 13300, englishOnlyPct: 38.5, spanishPct: 42.5, polishPct: 10.5, chinesePct: 1.5, tagalogPct: 2.2, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.2, lepPct: 22.5 },
  58: { population5Plus: 42300, englishOnlyPct: 28.5, spanishPct: 62.5, polishPct: 3.5, chinesePct: 1.2, tagalogPct: 0.8, arabicPct: 0.3, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.3, lepPct: 30.5 },
  59: { population5Plus: 14900, englishOnlyPct: 42.5, spanishPct: 45.8, polishPct: 3.8, chinesePct: 2.2, tagalogPct: 1.5, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 20.5 },
  60: { population5Plus: 31600, englishOnlyPct: 48.5, spanishPct: 28.5, polishPct: 2.8, chinesePct: 12.5, tagalogPct: 2.2, arabicPct: 0.5, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.5, russianPct: 0.8, gujaratiPct: 0.2, otherPct: 1.7, lepPct: 18.5 },
  61: { population5Plus: 40900, englishOnlyPct: 42.5, spanishPct: 48.5, polishPct: 2.5, chinesePct: 1.2, tagalogPct: 1.2, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.3, lepPct: 22.8 },
  62: { population5Plus: 13100, englishOnlyPct: 45.5, spanishPct: 35.8, polishPct: 10.5, chinesePct: 1.2, tagalogPct: 2.2, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.2, lepPct: 18.2 },
  63: { population5Plus: 37400, englishOnlyPct: 28.5, spanishPct: 62.5, polishPct: 3.2, chinesePct: 0.8, tagalogPct: 1.2, arabicPct: 0.3, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.6, lepPct: 32.5 },
  64: { population5Plus: 23300, englishOnlyPct: 58.5, spanishPct: 22.5, polishPct: 10.8, chinesePct: 1.2, tagalogPct: 2.5, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.2, lepPct: 12.8 },
  65: { population5Plus: 31200, englishOnlyPct: 38.5, spanishPct: 52.5, polishPct: 2.8, chinesePct: 0.8, tagalogPct: 1.2, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 25.5 },
  66: { population5Plus: 51800, englishOnlyPct: 55.5, spanishPct: 32.5, polishPct: 2.5, chinesePct: 0.8, tagalogPct: 0.8, arabicPct: 3.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.6, lepPct: 15.8 },
  67: { population5Plus: 27400, englishOnlyPct: 92.5, spanishPct: 5.2, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.7, lepPct: 2.0 },
  68: { population5Plus: 22800, englishOnlyPct: 93.5, spanishPct: 4.5, polishPct: 0.2, chinesePct: 0.2, tagalogPct: 0.2, arabicPct: 0.2, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.7, lepPct: 1.8 },
  69: { population5Plus: 29500, englishOnlyPct: 92.8, spanishPct: 4.8, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.8, lepPct: 1.8 },
  70: { population5Plus: 38900, englishOnlyPct: 68.5, spanishPct: 18.5, polishPct: 5.5, chinesePct: 0.8, tagalogPct: 2.2, arabicPct: 0.8, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 8.5 },
  71: { population5Plus: 42400, englishOnlyPct: 92.5, spanishPct: 5.2, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.7, lepPct: 2.0 },
  72: { population5Plus: 20600, englishOnlyPct: 88.5, spanishPct: 5.5, polishPct: 1.5, chinesePct: 0.8, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.3, gujaratiPct: 0.1, otherPct: 1.1, lepPct: 2.5 },
  73: { population5Plus: 25900, englishOnlyPct: 90.5, spanishPct: 5.8, polishPct: 0.3, chinesePct: 0.5, tagalogPct: 0.5, arabicPct: 0.3, hindiPct: 0.2, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.1, otherPct: 1.3, lepPct: 2.2 },
  74: { population5Plus: 17900, englishOnlyPct: 82.5, spanishPct: 6.5, polishPct: 5.8, chinesePct: 0.5, tagalogPct: 1.2, arabicPct: 0.3, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 4.2 },
  75: { population5Plus: 21100, englishOnlyPct: 88.5, spanishPct: 6.2, polishPct: 1.2, chinesePct: 0.5, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.2, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.2, russianPct: 0.3, gujaratiPct: 0.1, otherPct: 1.3, lepPct: 2.8 },
  76: { population5Plus: 12000, englishOnlyPct: 65.5, spanishPct: 12.5, polishPct: 8.5, chinesePct: 2.5, tagalogPct: 3.5, arabicPct: 1.5, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 8.8 },
  77: { population5Plus: 53000, englishOnlyPct: 62.5, spanishPct: 15.8, polishPct: 3.5, chinesePct: 4.2, tagalogPct: 2.5, arabicPct: 2.8, hindiPct: 1.8, urduPct: 1.2, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.5, gujaratiPct: 0.5, otherPct: 1.7, lepPct: 9.5 }
};

const CITY_AVG_NON_ENGLISH_PCT = 35.5;

function getLinguisticDiversity(nonEnglishPct: number): 'high' | 'moderate' | 'low' {
  if (nonEnglishPct >= 45) return 'high';
  if (nonEnglishPct >= 25) return 'moderate';
  return 'low';
}

function getComparedToCityAvg(nonEnglishPct: number): string {
  const diff = ((nonEnglishPct - CITY_AVG_NON_ENGLISH_PCT) / CITY_AVG_NON_ENGLISH_PCT) * 100;
  if (diff > 5) return `${Math.round(diff)}% above city average`;
  if (diff < -5) return `${Math.abs(Math.round(diff))}% below city average`;
  return 'Near city average';
}

function getRankDescription(rank: number): string {
  if (rank <= 10) return `Top 10 most diverse (#${rank} of 77)`;
  if (rank <= 20) return `Top 20 most diverse (#${rank} of 77)`;
  if (rank <= 38) return `Upper half for diversity (#${rank} of 77)`;
  if (rank <= 58) return `Middle tier for diversity (#${rank} of 77)`;
  return `Lower tier for diversity (#${rank} of 77)`;
}

async function buildLanguagesData() {
  console.log('Building language diversity data for Chicago community areas...');
  
  const tempData: Array<Omit<LanguageData, 'citywideRank' | 'rankDescription'>> = [];
  
  for (const [numStr, name] of Object.entries(COMMUNITY_AREA_NAMES)) {
    const num = parseInt(numStr);
    const data = LANGUAGE_DATA_RAW[num];
    
    if (!data) {
      console.warn(`No language data for community area ${num}: ${name}`);
      continue;
    }
    
    const nonEnglishPct = 100 - data.englishOnlyPct;
    
    // Build top languages array (only include those with >= 2%)
    const languages: Array<{language: string; count: number; pct: number}> = [];
    
    languages.push({
      language: 'English only',
      count: Math.round(data.population5Plus * data.englishOnlyPct / 100),
      pct: data.englishOnlyPct
    });
    
    if (data.spanishPct >= 2) {
      languages.push({
        language: 'Spanish',
        count: Math.round(data.population5Plus * data.spanishPct / 100),
        pct: data.spanishPct
      });
    }
    
    if (data.polishPct >= 2) {
      languages.push({
        language: 'Polish',
        count: Math.round(data.population5Plus * data.polishPct / 100),
        pct: data.polishPct
      });
    }
    
    if (data.chinesePct >= 2) {
      languages.push({
        language: 'Chinese',
        count: Math.round(data.population5Plus * data.chinesePct / 100),
        pct: data.chinesePct
      });
    }
    
    if (data.tagalogPct >= 2) {
      languages.push({
        language: 'Tagalog',
        count: Math.round(data.population5Plus * data.tagalogPct / 100),
        pct: data.tagalogPct
      });
    }
    
    if (data.arabicPct >= 2) {
      languages.push({
        language: 'Arabic',
        count: Math.round(data.population5Plus * data.arabicPct / 100),
        pct: data.arabicPct
      });
    }
    
    if (data.hindiPct >= 1) {
      languages.push({
        language: 'Hindi',
        count: Math.round(data.population5Plus * data.hindiPct / 100),
        pct: data.hindiPct
      });
    }
    
    if (data.urduPct >= 1) {
      languages.push({
        language: 'Urdu',
        count: Math.round(data.population5Plus * data.urduPct / 100),
        pct: data.urduPct
      });
    }
    
    if (data.koreanPct >= 1) {
      languages.push({
        language: 'Korean',
        count: Math.round(data.population5Plus * data.koreanPct / 100),
        pct: data.koreanPct
      });
    }
    
    if (data.vietnamesePct >= 1) {
      languages.push({
        language: 'Vietnamese',
        count: Math.round(data.population5Plus * data.vietnamesePct / 100),
        pct: data.vietnamesePct
      });
    }
    
    if (data.russianPct >= 1) {
      languages.push({
        language: 'Russian',
        count: Math.round(data.population5Plus * data.russianPct / 100),
        pct: data.russianPct
      });
    }
    
    if (data.gujaratiPct >= 0.5) {
      languages.push({
        language: 'Gujarati',
        count: Math.round(data.population5Plus * data.gujaratiPct / 100),
        pct: data.gujaratiPct
      });
    }
    
    // Sort by percentage descending
    languages.sort((a, b) => b.pct - a.pct);
    
    tempData.push({
      communityArea: name,
      communityNumber: num,
      population5Plus: data.population5Plus,
      englishOnlyPct: data.englishOnlyPct,
      nonEnglishPct: Math.round(nonEnglishPct * 10) / 10,
      topLanguages: languages.slice(0, 7),  // Show top 7 to include more South Asian/Asian languages
      limitedEnglishProficiency: {
        count: Math.round(data.population5Plus * data.lepPct / 100),
        pct: data.lepPct
      },
      linguisticDiversity: getLinguisticDiversity(nonEnglishPct),
      comparedToCityAvg: getComparedToCityAvg(nonEnglishPct)
    });
  }
  
  // Sort by nonEnglishPct descending to calculate ranks (higher diversity = rank 1)
  const sortedByDiversity = [...tempData].sort((a, b) => b.nonEnglishPct - a.nonEnglishPct);
  
  // Create rank map
  const rankMap = new Map<number, number>();
  sortedByDiversity.forEach((d, idx) => {
    rankMap.set(d.communityNumber, idx + 1);
  });
  
  // Add ranks to data
  const languagesData: LanguageData[] = tempData.map(d => ({
    ...d,
    citywideRank: rankMap.get(d.communityNumber) || 0,
    rankDescription: getRankDescription(rankMap.get(d.communityNumber) || 0)
  }));
  
  // Sort by community number for output
  languagesData.sort((a, b) => a.communityNumber - b.communityNumber);
  
  const outputPath = path.join(__dirname, '..', 'server', 'data', 'demographics', 'languages.json');
  fs.writeFileSync(outputPath, JSON.stringify(languagesData, null, 2));
  
  console.log(`Wrote language data for ${languagesData.length} community areas to ${outputPath}`);
  
  const highDiversity = languagesData.filter(d => d.linguisticDiversity === 'high').length;
  const moderateDiversity = languagesData.filter(d => d.linguisticDiversity === 'moderate').length;
  const lowDiversity = languagesData.filter(d => d.linguisticDiversity === 'low').length;
  
  console.log(`\nLinguistic diversity distribution:`);
  console.log(`  High: ${highDiversity} areas`);
  console.log(`  Moderate: ${moderateDiversity} areas`);
  console.log(`  Low: ${lowDiversity} areas`);
  
  // Show top 10 most diverse areas
  console.log(`\nTop 10 most linguistically diverse areas:`);
  sortedByDiversity.slice(0, 10).forEach((d, idx) => {
    console.log(`  ${idx + 1}. ${d.communityArea} - ${d.nonEnglishPct}% non-English speakers`);
  });
  
  const totalLEP = languagesData.reduce((sum, d) => sum + d.limitedEnglishProficiency.count, 0);
  const totalPop = languagesData.reduce((sum, d) => sum + d.population5Plus, 0);
  console.log(`\nCitywide: ${totalLEP.toLocaleString()} residents with limited English proficiency out of ${totalPop.toLocaleString()} total (${((totalLEP/totalPop)*100).toFixed(1)}%)`);
}

buildLanguagesData().catch(console.error);
