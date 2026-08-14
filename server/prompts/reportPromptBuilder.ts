// reportPromptBuilder.ts

import { REPORT_LOGIC_MASTER_PROMPT } from './reportLogic';
import { REPORT_DESIGN } from './reportDesign';

// Shape this to match your actual property_context
export interface PropertyContext {
  property_id: string;
  report_id: string;
  property_snapshot: any;
  sections: any;
  ui_context?: any;
  onepager_context?: any;
  source_index?: any;
}

export interface ThemeOverride {
  // optional runtime theme object
  [key: string]: any;
}

/**
 * Build the full prompt Claude should see for one-page report generation.
 * This combines:
 * - the logic master prompt (analysis rules)
 * - the design-system prompt (visual rules)
 * - the structured property_context
 * - an optional runtime theme override
 */
export function buildPropertyInsightPrompt(
  context: PropertyContext,
  themeOverride?: ThemeOverride
): string {
  const contextJson = JSON.stringify(context, null, 2);
  const themeJson = themeOverride ? JSON.stringify(themeOverride, null, 2) : null;

  return [
    'SYSTEM / LOGIC INSTRUCTIONS:',
    REPORT_LOGIC_MASTER_PROMPT.trim(),

    '\n\nDESIGN SYSTEM INSTRUCTIONS:',
    REPORT_DESIGN.trim(),

    '\n\nRUNTIME PROPERTY CONTEXT (STRUCTURED EVIDENCE):',
    // The model must treat this as the only factual source of truth about the property.
    // It should not use external world knowledge for property-specific claims.
    contextJson,

    themeJson
      ? '\n\nRUNTIME THEME OVERRIDE (OPTIONAL, OVERRIDES DESIGN TOKENS WHERE PROVIDED):\n' +
        themeJson
      : '',
  ].join('\n\n');
}

// ============================================================================
// CONTENT-ONLY PIPELINE (current)
// The design/layout lives in a fixed server-side template
// (server/insightReportTemplate.ts). The model returns ONLY structured JSON
// content — no HTML, no CSS — which cuts generation time dramatically and
// guarantees a pixel-identical design on every run.
// ============================================================================

const CONTENT_OUTPUT_CONTRACT = `
==================================================
OUTPUT FORMAT — SUPERSEDES ALL EARLIER OUTPUT RULES
==================================================

IMPORTANT: Ignore any earlier instruction to produce HTML or to avoid JSON.
You produce NO HTML and NO markdown. The application owns the visual design;
you supply ONLY the content, as a single raw JSON object (no code fences, no
commentary before or after). All analytical, evidence, confidence, headline,
sentiment, and safeguard rules above still apply in full.

Return exactly this JSON shape:

{
  "property_line": string,
    // One compact line for under the address, joining the key identity facts
    // with " · " separators, e.g.:
    // "Irving Park · Chicago, IL 60618 · Zoned B3-1 (Community Shopping) · 6,085 SF building / 2 stories on 5,850 SF lot · Built 1915"
    // Use only facts present in the evidence; omit segments you cannot support. <= 140 characters.

  "our_take": {
    "headline": string,   // the OUR TAKE verdict line (per OUR TAKE RULES)
    "body": string        // 2-3 sentences, plain text, <= 380 characters
  },

  "metadata": {
    // The five metadata cells. Short values — these render large.
    "last_sold":      { "value": string, "date": string | null },
      // value = exact sale price, e.g. "$411,000"; date = short date, e.g. "4/24/2014"; null if unknown
    "zoning":         { "value": string },                        // e.g. "B3-1"
    "property_taxes": { "value": string, "year": string | null }, // value = amount, e.g. "$16,290"; year e.g. "2024" (per the stat strip tax rules)
    "title_status":   { "value": string, "flagged": boolean },
      // value e.g. "Flagged" or "No flags"; flagged=true only when the evidence shows a title issue (lis pendens, foreclosure, lien)
    "landmark":       { "value": string }                         // e.g. "Not Designated", "Orange", "District"
  },

  "findings": [
    // 6 to 8 cards, ordered by priority (most decision-relevant first).
    // status uses the traffic-light classes: risk -> "red", caution -> "yellow", strength -> "green".
    // HARD LENGTH LIMITS (over-length output is REJECTED and the run fails):
    // title <= 90 characters; body 2-3 short sentences and <= 250 characters.
    // Cut detail before cutting cards — a clipped page is a failed report.
    { "status": "red" | "yellow" | "green", "title": string, "body": string }
  ],

  "steps": [
    // Exactly 3 "before you move forward" actions.
    // title <= 50 characters; body <= 190 characters.
    { "title": string, "body": string }
  ],

  "sources": string
    // One sentence listing the public sources relied on, e.g.
    // "Sources: Cook County Assessor and Treasurer records, Cook County Recorder of Deeds, City of Chicago zoning and landmark data, and Chicago permit records."
    // <= 380 characters. The application appends its own disclaimer — do not include one.
}

Strings are plain text (no HTML tags, no markdown). Keep card bodies tight —
the fixed layout fits 6-8 cards on one page only when bodies stay 2-4 short
sentences. Do NOT wrap the JSON in \`\`\` fences.
`;

/**
 * Build the content-only prompt: full analytical rules + JSON output contract.
 * No design-system prompt — the template owns all visuals.
 */
export function buildPropertyInsightContentPrompt(context: PropertyContext): string {
  const contextJson = JSON.stringify(context, null, 2);
  return [
    'SYSTEM / LOGIC INSTRUCTIONS:',
    REPORT_LOGIC_MASTER_PROMPT.trim(),

    CONTENT_OUTPUT_CONTRACT.trim(),

    '\n\nRUNTIME PROPERTY CONTEXT (STRUCTURED EVIDENCE):',
    // The model must treat this as the only factual source of truth about the property.
    // It should not use external world knowledge for property-specific claims.
    contextJson,
  ].join('\n\n');
}
