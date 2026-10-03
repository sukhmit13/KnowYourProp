import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const numberedSubsectionConsumers = [
  "client/src/pages/RunDetail.tsx",
  "client/src/components/HMDAStats.tsx",
  "client/src/components/CorridorIntelligenceView.tsx",
  "client/src/components/SBALoansView.tsx",
  "client/src/components/report/OwnershipTitleSection.tsx",
  "client/src/components/report/CountyRecordSection.tsx",
  "client/src/components/report/DevelopmentSection.tsx",
  "client/src/components/report/OwnerLiensSection.tsx",
  "client/src/components/report/NewBusinessLicensesSection.tsx",
  "client/src/components/report/ProfessionalRecordSection.tsx",
  "client/src/components/report/DaycareAnalysis.tsx",
  "client/src/components/report/ProjectUseDomainPanels.tsx",
  "client/src/components/report/NewConstructionSection.tsx",
];

test("numbered subsection body wrappers across report consumers have no extra horizontal inset", () => {
  const violations: string[] = [];
  let adjacentBodyCount = 0;
  const horizontalUtility = /(?:^|\s)(?:px|pl|pr)-\d+(?:\/\d+)?(?:\s|$)/;
  const inlineHorizontalSpacing = /\b(?:paddingLeft|paddingRight|marginLeft|marginRight)\s*:/;

  for (const path of numberedSubsectionConsumers) {
    const source = readFileSync(path, "utf8");
    const bodyWrapper = /<\/KypSubhead>\s*<div\b([^>]*)>/g;
    for (const match of source.matchAll(bodyWrapper)) {
      adjacentBodyCount += 1;
      const attributes = match[1];
      const className = attributes.match(/\bclassName="([^"]*)"/)?.[1] ?? "";
      if (horizontalUtility.test(className) || inlineHorizontalSpacing.test(attributes)) {
        violations.push(`${path}: ${attributes.trim()}`);
      }
    }
  }

  assert.ok(adjacentBodyCount >= 40, "the audit should cover the active numbered-subsection body wrappers");
  assert.deepEqual(violations, [], `subsection bodies should align flush with headings:\n${violations.join("\n")}`);
});