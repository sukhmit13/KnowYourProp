import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LanguageZipData {
  zipCode: string;
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

const CHICAGO_ZIPS = [
  '60601', '60602', '60603', '60604', '60605', '60606', '60607', '60608',
  '60609', '60610', '60611', '60612', '60613', '60614', '60615', '60616',
  '60617', '60618', '60619', '60620', '60621', '60622', '60623', '60624',
  '60625', '60626', '60628', '60629', '60630', '60631', '60632', '60633',
  '60634', '60636', '60637', '60638', '60639', '60640', '60641', '60642',
  '60643', '60644', '60645', '60646', '60647', '60649', '60651', '60652',
  '60653', '60654', '60655', '60656', '60657', '60659', '60660'
];

const LANGUAGE_ZIP_RAW: { [key: string]: {
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
  lepPct: number;
} } = {
  '60601': { population5Plus: 17200, englishOnlyPct: 72.5, spanishPct: 8.5, polishPct: 1.8, chinesePct: 5.8, tagalogPct: 2.5, arabicPct: 1.5, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.6, lepPct: 6.5 },
  '60602': { population5Plus: 2600, englishOnlyPct: 71.8, spanishPct: 9.2, polishPct: 2.0, chinesePct: 5.5, tagalogPct: 2.2, arabicPct: 1.8, hindiPct: 1.8, urduPct: 0.8, koreanPct: 1.0, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.6, lepPct: 7.0 },
  '60603': { population5Plus: 1100, englishOnlyPct: 73.5, spanishPct: 8.0, polishPct: 1.5, chinesePct: 6.2, tagalogPct: 2.0, arabicPct: 1.5, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.0, vietnamesePct: 0.8, russianPct: 1.0, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 6.0 },
  '60604': { population5Plus: 850, englishOnlyPct: 74.0, spanishPct: 7.5, polishPct: 1.5, chinesePct: 6.0, tagalogPct: 2.2, arabicPct: 1.5, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.0, gujaratiPct: 0.2, otherPct: 0.8, lepPct: 5.8 },
  '60605': { population5Plus: 30800, englishOnlyPct: 68.5, spanishPct: 12.5, polishPct: 1.5, chinesePct: 7.5, tagalogPct: 2.2, arabicPct: 1.5, hindiPct: 1.2, urduPct: 0.5, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.0, gujaratiPct: 0.2, otherPct: 1.4, lepPct: 8.2 },
  '60606': { population5Plus: 8000, englishOnlyPct: 70.5, spanishPct: 10.2, polishPct: 1.8, chinesePct: 6.2, tagalogPct: 2.5, arabicPct: 1.5, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.5, lepPct: 7.2 },
  '60607': { population5Plus: 26500, englishOnlyPct: 68.2, spanishPct: 15.5, polishPct: 2.2, chinesePct: 4.5, tagalogPct: 2.0, arabicPct: 1.2, hindiPct: 1.2, urduPct: 0.5, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.7, lepPct: 9.5 },
  '60608': { population5Plus: 77500, englishOnlyPct: 38.5, spanishPct: 48.5, polishPct: 2.5, chinesePct: 4.2, tagalogPct: 1.5, arabicPct: 0.5, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.5, russianPct: 0.8, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 22.5 },
  '60609': { population5Plus: 52900, englishOnlyPct: 42.5, spanishPct: 48.8, polishPct: 2.0, chinesePct: 1.5, tagalogPct: 1.2, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.2, lepPct: 24.5 },
  '60610': { population5Plus: 33000, englishOnlyPct: 75.8, spanishPct: 8.5, polishPct: 2.2, chinesePct: 3.5, tagalogPct: 1.8, arabicPct: 1.2, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 5.5 },
  '60611': { population5Plus: 49200, englishOnlyPct: 74.2, spanishPct: 7.8, polishPct: 2.5, chinesePct: 4.5, tagalogPct: 2.2, arabicPct: 1.5, hindiPct: 1.8, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 5.8 },
  '60612': { population5Plus: 35900, englishOnlyPct: 72.5, spanishPct: 15.8, polishPct: 1.8, chinesePct: 2.5, tagalogPct: 1.5, arabicPct: 0.8, hindiPct: 1.0, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.5, russianPct: 1.0, gujaratiPct: 0.2, otherPct: 1.4, lepPct: 8.5 },
  '60613': { population5Plus: 52900, englishOnlyPct: 78.5, spanishPct: 8.2, polishPct: 2.5, chinesePct: 2.5, tagalogPct: 1.8, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.5, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.3, lepPct: 4.8 },
  '60614': { population5Plus: 68000, englishOnlyPct: 82.5, spanishPct: 6.2, polishPct: 1.8, chinesePct: 2.5, tagalogPct: 1.2, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.5, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 0.8, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 3.8 },
  '60615': { population5Plus: 39700, englishOnlyPct: 75.5, spanishPct: 10.2, polishPct: 0.8, chinesePct: 5.5, tagalogPct: 1.8, arabicPct: 1.5, hindiPct: 1.2, urduPct: 0.5, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 0.5, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 6.2 },
  '60616': { population5Plus: 45400, englishOnlyPct: 52.5, spanishPct: 12.5, polishPct: 0.8, chinesePct: 28.5, tagalogPct: 1.5, arabicPct: 0.5, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 0.3, gujaratiPct: 0.1, otherPct: 0.7, lepPct: 18.5 },
  '60617': { population5Plus: 70900, englishOnlyPct: 68.5, spanishPct: 25.8, polishPct: 0.5, chinesePct: 0.8, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.5, lepPct: 12.5 },
  '60618': { population5Plus: 80300, englishOnlyPct: 58.5, spanishPct: 28.5, polishPct: 5.2, chinesePct: 1.5, tagalogPct: 1.5, arabicPct: 0.5, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.0, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 12.8 },
  '60619': { population5Plus: 49200, englishOnlyPct: 92.5, spanishPct: 4.8, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 1.1, lepPct: 1.8 },
  '60620': { population5Plus: 54800, englishOnlyPct: 92.8, spanishPct: 4.5, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 1.1, lepPct: 1.5 },
  '60621': { population5Plus: 30200, englishOnlyPct: 92.5, spanishPct: 5.2, polishPct: 0.2, chinesePct: 0.2, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.1, gujaratiPct: 0.0, otherPct: 0.8, lepPct: 2.0 },
  '60622': { population5Plus: 49200, englishOnlyPct: 62.5, spanishPct: 25.8, polishPct: 3.5, chinesePct: 1.5, tagalogPct: 1.5, arabicPct: 0.8, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 0.9, lepPct: 10.5 },
  '60623': { population5Plus: 73700, englishOnlyPct: 22.5, spanishPct: 72.5, polishPct: 0.5, chinesePct: 0.8, tagalogPct: 0.5, arabicPct: 0.2, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 38.5 },
  '60624': { population5Plus: 24600, englishOnlyPct: 90.5, spanishPct: 6.8, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.0, otherPct: 1.0, lepPct: 2.5 },
  '60625': { population5Plus: 73700, englishOnlyPct: 48.5, spanishPct: 22.5, polishPct: 4.8, chinesePct: 4.5, tagalogPct: 6.2, arabicPct: 3.5, hindiPct: 2.5, urduPct: 1.5, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.8, gujaratiPct: 0.8, otherPct: 1.4, lepPct: 16.5 },
  '60626': { population5Plus: 54800, englishOnlyPct: 55.2, spanishPct: 22.5, polishPct: 4.2, chinesePct: 3.8, tagalogPct: 2.5, arabicPct: 1.8, hindiPct: 2.5, urduPct: 1.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.5, gujaratiPct: 0.5, otherPct: 1.7, lepPct: 12.5 },
  '60628': { population5Plus: 42500, englishOnlyPct: 91.5, spanishPct: 5.8, polishPct: 0.2, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.3, hindiPct: 0.1, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.0, otherPct: 1.0, lepPct: 2.2 },
  '60629': { population5Plus: 108700, englishOnlyPct: 28.5, spanishPct: 62.5, polishPct: 3.2, chinesePct: 0.8, tagalogPct: 1.2, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 32.5 },
  '60630': { population5Plus: 45400, englishOnlyPct: 58.5, spanishPct: 15.8, polishPct: 12.5, chinesePct: 1.8, tagalogPct: 3.2, arabicPct: 1.2, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 2.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 11.8 },
  '60631': { population5Plus: 20800, englishOnlyPct: 65.2, spanishPct: 8.5, polishPct: 15.8, chinesePct: 1.2, tagalogPct: 2.8, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.2, lepPct: 8.5 },
  '60632': { population5Plus: 77500, englishOnlyPct: 28.5, spanishPct: 62.5, polishPct: 3.5, chinesePct: 1.2, tagalogPct: 0.8, arabicPct: 0.3, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.3, lepPct: 30.5 },
  '60633': { population5Plus: 11300, englishOnlyPct: 68.5, spanishPct: 25.8, polishPct: 0.8, chinesePct: 0.5, tagalogPct: 0.8, arabicPct: 0.3, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.5, gujaratiPct: 0.1, otherPct: 1.8, lepPct: 10.2 },
  '60634': { population5Plus: 64300, englishOnlyPct: 55.8, spanishPct: 22.5, polishPct: 12.8, chinesePct: 1.5, tagalogPct: 2.2, arabicPct: 0.8, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 0.9, lepPct: 14.5 },
  '60636': { population5Plus: 35900, englishOnlyPct: 88.5, spanishPct: 8.5, polishPct: 0.3, chinesePct: 0.2, tagalogPct: 0.3, arabicPct: 0.5, hindiPct: 0.2, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.0, otherPct: 1.0, lepPct: 3.2 },
  '60637': { population5Plus: 45400, englishOnlyPct: 78.5, spanishPct: 8.2, polishPct: 0.5, chinesePct: 5.5, tagalogPct: 1.8, arabicPct: 1.2, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 0.5, gujaratiPct: 0.2, otherPct: 1.5, lepPct: 5.2 },
  '60638': { population5Plus: 49200, englishOnlyPct: 55.8, spanishPct: 22.5, polishPct: 12.5, chinesePct: 1.2, tagalogPct: 2.5, arabicPct: 0.5, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.7, lepPct: 12.5 },
  '60639': { population5Plus: 80300, englishOnlyPct: 32.5, spanishPct: 55.8, polishPct: 5.2, chinesePct: 0.8, tagalogPct: 1.5, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.2, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.0, lepPct: 28.5 },
  '60640': { population5Plus: 58600, englishOnlyPct: 58.5, spanishPct: 18.8, polishPct: 3.5, chinesePct: 5.5, tagalogPct: 2.2, arabicPct: 2.5, hindiPct: 1.8, urduPct: 1.2, koreanPct: 1.5, vietnamesePct: 1.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 11.2 },
  '60641': { population5Plus: 68000, englishOnlyPct: 52.5, spanishPct: 25.8, polishPct: 12.5, chinesePct: 1.5, tagalogPct: 2.2, arabicPct: 0.8, hindiPct: 0.8, urduPct: 0.5, koreanPct: 0.5, vietnamesePct: 0.3, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 1.2, lepPct: 15.2 },
  '60642': { population5Plus: 17000, englishOnlyPct: 68.5, spanishPct: 15.8, polishPct: 4.5, chinesePct: 2.5, tagalogPct: 1.8, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.5, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 1.5, gujaratiPct: 0.2, otherPct: 1.4, lepPct: 8.8 },
  '60643': { population5Plus: 35900, englishOnlyPct: 88.5, spanishPct: 6.2, polishPct: 1.2, chinesePct: 0.5, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.3, gujaratiPct: 0.1, otherPct: 1.0, lepPct: 2.5 },
  '60644': { population5Plus: 42500, englishOnlyPct: 88.5, spanishPct: 8.5, polishPct: 0.3, chinesePct: 0.3, tagalogPct: 0.3, arabicPct: 0.5, hindiPct: 0.2, urduPct: 0.1, koreanPct: 0.1, vietnamesePct: 0.1, russianPct: 0.2, gujaratiPct: 0.0, otherPct: 0.9, lepPct: 3.0 },
  '60645': { population5Plus: 39700, englishOnlyPct: 42.5, spanishPct: 18.2, polishPct: 8.5, chinesePct: 5.2, tagalogPct: 6.8, arabicPct: 4.2, hindiPct: 3.8, urduPct: 2.5, koreanPct: 1.5, vietnamesePct: 1.2, russianPct: 2.8, gujaratiPct: 1.2, otherPct: 1.6, lepPct: 18.5 },
  '60646': { population5Plus: 26500, englishOnlyPct: 65.5, spanishPct: 12.5, polishPct: 8.5, chinesePct: 2.5, tagalogPct: 3.5, arabicPct: 1.5, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 8.8 },
  '60647': { population5Plus: 80300, englishOnlyPct: 55.9, spanishPct: 32.4, polishPct: 6.6, chinesePct: 0.8, tagalogPct: 0.5, arabicPct: 0.3, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.2, russianPct: 1.2, gujaratiPct: 0.2, otherPct: 0.8, lepPct: 8.5 },
  '60649': { population5Plus: 39700, englishOnlyPct: 90.5, spanishPct: 5.8, polishPct: 0.2, chinesePct: 0.8, tagalogPct: 0.5, arabicPct: 0.5, hindiPct: 0.2, urduPct: 0.1, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.2, gujaratiPct: 0.1, otherPct: 0.7, lepPct: 2.2 },
  '60651': { population5Plus: 54800, englishOnlyPct: 42.5, spanishPct: 48.5, polishPct: 2.8, chinesePct: 0.8, tagalogPct: 1.2, arabicPct: 0.5, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 22.5 },
  '60652': { population5Plus: 30200, englishOnlyPct: 68.5, spanishPct: 18.5, polishPct: 5.5, chinesePct: 0.8, tagalogPct: 2.2, arabicPct: 0.8, hindiPct: 0.5, urduPct: 0.3, koreanPct: 0.3, vietnamesePct: 0.3, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 8.5 },
  '60653': { population5Plus: 26500, englishOnlyPct: 85.5, spanishPct: 8.5, polishPct: 0.3, chinesePct: 2.5, tagalogPct: 0.8, arabicPct: 0.5, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.2, gujaratiPct: 0.1, otherPct: 0.7, lepPct: 3.5 },
  '60654': { population5Plus: 20800, englishOnlyPct: 75.8, spanishPct: 8.5, polishPct: 2.2, chinesePct: 3.5, tagalogPct: 1.8, arabicPct: 1.2, hindiPct: 1.5, urduPct: 0.8, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 5.5 },
  '60655': { population5Plus: 26500, englishOnlyPct: 82.5, spanishPct: 6.5, polishPct: 5.8, chinesePct: 0.5, tagalogPct: 1.2, arabicPct: 0.3, hindiPct: 0.3, urduPct: 0.2, koreanPct: 0.2, vietnamesePct: 0.2, russianPct: 0.8, gujaratiPct: 0.1, otherPct: 1.4, lepPct: 4.2 },
  '60656': { population5Plus: 17000, englishOnlyPct: 65.5, spanishPct: 12.5, polishPct: 8.5, chinesePct: 2.5, tagalogPct: 3.5, arabicPct: 1.5, hindiPct: 1.2, urduPct: 0.8, koreanPct: 0.8, vietnamesePct: 0.5, russianPct: 1.2, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 8.8 },
  '60657': { population5Plus: 68000, englishOnlyPct: 78.2, spanishPct: 8.5, polishPct: 2.2, chinesePct: 2.8, tagalogPct: 1.5, arabicPct: 0.8, hindiPct: 1.2, urduPct: 0.5, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 0.8, gujaratiPct: 0.3, otherPct: 1.2, lepPct: 4.5 },
  '60659': { population5Plus: 45400, englishOnlyPct: 48.5, spanishPct: 22.5, polishPct: 5.8, chinesePct: 4.5, tagalogPct: 5.2, arabicPct: 3.2, hindiPct: 2.2, urduPct: 1.5, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 2.2, gujaratiPct: 0.8, otherPct: 1.6, lepPct: 15.8 },
  '60660': { population5Plus: 42500, englishOnlyPct: 62.5, spanishPct: 15.8, polishPct: 3.5, chinesePct: 4.2, tagalogPct: 2.5, arabicPct: 2.8, hindiPct: 1.8, urduPct: 1.2, koreanPct: 1.2, vietnamesePct: 0.8, russianPct: 1.5, gujaratiPct: 0.5, otherPct: 1.7, lepPct: 9.5 }
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

function getRankDescription(rank: number, total: number): string {
  if (rank <= Math.ceil(total * 0.13)) return `Top 10% most diverse (#${rank} of ${total} ZIP codes)`;
  if (rank <= Math.ceil(total * 0.26)) return `Top 25% most diverse (#${rank} of ${total})`;
  if (rank <= Math.ceil(total * 0.5)) return `Upper half for diversity (#${rank} of ${total})`;
  if (rank <= Math.ceil(total * 0.75)) return `Middle tier for diversity (#${rank} of ${total})`;
  return `Lower tier for diversity (#${rank} of ${total})`;
}

async function buildLanguagesZipData() {
  console.log('Building language diversity data for Chicago ZIP codes...');
  
  const tempData: Array<Omit<LanguageZipData, 'citywideRank' | 'rankDescription'>> = [];
  
  for (const zip of CHICAGO_ZIPS) {
    const data = LANGUAGE_ZIP_RAW[zip];
    
    if (!data) {
      console.warn(`No language data for ZIP ${zip}`);
      continue;
    }
    
    const nonEnglishPct = 100 - data.englishOnlyPct;
    
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
    
    if (data.hindiPct >= 2) {
      languages.push({
        language: 'Hindi',
        count: Math.round(data.population5Plus * data.hindiPct / 100),
        pct: data.hindiPct
      });
    }
    
    if (data.urduPct >= 2) {
      languages.push({
        language: 'Urdu',
        count: Math.round(data.population5Plus * data.urduPct / 100),
        pct: data.urduPct
      });
    }
    
    if (data.koreanPct >= 2) {
      languages.push({
        language: 'Korean',
        count: Math.round(data.population5Plus * data.koreanPct / 100),
        pct: data.koreanPct
      });
    }
    
    if (data.vietnamesePct >= 2) {
      languages.push({
        language: 'Vietnamese',
        count: Math.round(data.population5Plus * data.vietnamesePct / 100),
        pct: data.vietnamesePct
      });
    }
    
    if (data.russianPct >= 2) {
      languages.push({
        language: 'Russian',
        count: Math.round(data.population5Plus * data.russianPct / 100),
        pct: data.russianPct
      });
    }
    
    if (data.gujaratiPct >= 2) {
      languages.push({
        language: 'Gujarati',
        count: Math.round(data.population5Plus * data.gujaratiPct / 100),
        pct: data.gujaratiPct
      });
    }
    
    languages.sort((a, b) => b.pct - a.pct);
    
    tempData.push({
      zipCode: zip,
      population5Plus: data.population5Plus,
      englishOnlyPct: data.englishOnlyPct,
      nonEnglishPct: parseFloat(nonEnglishPct.toFixed(1)),
      topLanguages: languages.slice(0, 7),
      limitedEnglishProficiency: {
        count: Math.round(data.population5Plus * data.lepPct / 100),
        pct: data.lepPct
      },
      linguisticDiversity: getLinguisticDiversity(nonEnglishPct),
      comparedToCityAvg: getComparedToCityAvg(nonEnglishPct)
    });
  }
  
  const sortedByDiversity = [...tempData].sort((a, b) => b.nonEnglishPct - a.nonEnglishPct);
  
  const rankMap = new Map<string, number>();
  sortedByDiversity.forEach((d, idx) => {
    rankMap.set(d.zipCode, idx + 1);
  });
  
  const total = tempData.length;
  const languagesData: LanguageZipData[] = tempData.map(d => ({
    ...d,
    citywideRank: rankMap.get(d.zipCode) || 0,
    rankDescription: getRankDescription(rankMap.get(d.zipCode) || 0, total)
  }));
  
  languagesData.sort((a, b) => a.zipCode.localeCompare(b.zipCode));
  
  const outputPath = path.join(__dirname, '..', 'server', 'data', 'demographics', 'languages_zip.json');
  fs.writeFileSync(outputPath, JSON.stringify(languagesData, null, 2));
  
  console.log(`Wrote language data for ${languagesData.length} ZIP codes to ${outputPath}`);
  
  const highDiversity = languagesData.filter(d => d.linguisticDiversity === 'high').length;
  const moderateDiversity = languagesData.filter(d => d.linguisticDiversity === 'moderate').length;
  const lowDiversity = languagesData.filter(d => d.linguisticDiversity === 'low').length;
  
  console.log(`\nLinguistic diversity distribution:`);
  console.log(`  High: ${highDiversity} ZIPs`);
  console.log(`  Moderate: ${moderateDiversity} ZIPs`);
  console.log(`  Low: ${lowDiversity} ZIPs`);
  
  console.log(`\nTop 10 most linguistically diverse ZIP codes:`);
  sortedByDiversity.slice(0, 10).forEach((d, idx) => {
    console.log(`  ${idx + 1}. ${d.zipCode} - ${d.nonEnglishPct}% non-English speakers`);
  });
}

buildLanguagesZipData().catch(console.error);
