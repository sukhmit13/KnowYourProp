import { SPECIALTY_DISPLAY_NAMES, WORK_TYPE_KEYWORDS } from './contractorClassification';

export interface SearchableContractor {
  name: string;
  primarySpecialty?: string;
  secondarySpecialties?: string[];
  specialtyBreakdown?: Record<string, number>;
  workTypeCounts?: Record<string, number>;
  roleCounts?: Record<string, number>;
  projectScopeCounts?: Record<string, number>;
  strictProjectScopeCounts?: Record<string, number>;
  topNeighborhoods?: { name: string }[];
  recentProjects?: { address?: string; specialty?: string; description?: string }[];
}

export interface ContractorSearchMatch {
  matches: boolean;
  count: number;
  labels: string[];
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ');
}

function workTypesForQuery(query: string): string[] {
  const normalized = normalize(query);
  return Object.entries(WORK_TYPE_KEYWORDS)
    .filter(([workType, keywords]) =>
      normalized === workType ||
      normalized.includes(workType) ||
      keywords.some(keyword => normalized.includes(normalize(keyword)))
    )
    .map(([workType]) => workType);
}

export function getContractorSearchMatch(
  contractor: SearchableContractor,
  query: string,
): ContractorSearchMatch {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { matches: true, count: 0, labels: [] };

  const workTypes = workTypesForQuery(normalizedQuery);
  const projectText = (contractor.recentProjects || [])
    .map(project => `${project.address || ''} ${project.specialty || ''} ${project.description || ''}`)
    .join(' ');
  const searchableText = normalize([
    contractor.name,
    contractor.primarySpecialty || '',
    ...(contractor.secondarySpecialties || []),
    ...Object.keys(contractor.specialtyBreakdown || {}).map(key => SPECIALTY_DISPLAY_NAMES[key] || key),
    ...Object.keys(contractor.roleCounts || {}),
    ...Object.keys(contractor.projectScopeCounts || {}),
    ...(contractor.topNeighborhoods || []).map(neighborhood => neighborhood.name),
    projectText,
  ].join(' '));

  let count = 0;
  const labels: string[] = [];

  for (const workType of workTypes) {
    let workCount = contractor.workTypeCounts?.[workType] || 0;
    if (!workCount) {
      workCount = Object.entries(contractor.roleCounts || {})
        .filter(([role]) => role.includes(workType) || workType.includes(role))
        .reduce((sum, [, roleCount]) => sum + roleCount, 0);
    }
    if (!workCount && workType !== 'tile') {
      workCount = contractor.specialtyBreakdown?.[workType] || 0;
    }
    if (!workCount) {
      const keywords = WORK_TYPE_KEYWORDS[workType];
      workCount = (contractor.recentProjects || []).filter(project => {
        const text = `${project.specialty || ''} ${project.description || ''}`.toLowerCase();
        return keywords.some(keyword => text.includes(keyword));
      }).length;
    }
    if (workCount > 0) {
      count += workCount;
      labels.push(`${workType} · ${workCount.toLocaleString()} permit${workCount === 1 ? '' : 's'}`);
    }
  }

  if (searchableText.includes(normalizedQuery)) {
    count = Math.max(count, 1) + (workTypes.length ? 0 : 1);
  }

  return { matches: count > 0, count, labels };
}