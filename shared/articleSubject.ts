const DEVELOPMENT_TERMS = [
  'unit', 'units', 'apartment', 'apartments', 'condo', 'condos',
  'mixed-use', 'mixed use', 'tower', 'stories', 'story building',
  'development', 'developer', 'new construction', 'construction starts',
  'breaks ground', 'groundbreaking', 'rendering', 'new building',
  'residential building', 'affordable housing', 'demolition', 'adaptive reuse',
  'permit filed', 'building permit', 'zoning', 'rezoning', 'upzoning',
  'map amendment', 'transit-oriented', 'plans revealed', 'plans for',
  'city council approved', 'alderman approved', 'square feet', 'sq ft',
];

export type ArticleSubject = 'development' | 'culture';

/** Development needs positive evidence; articles without it remain culture. */
export function classifyArticle(title: string, summary = '', url = ''): ArticleSubject {
  const hay = `${title} ${summary} ${url}`.toLowerCase();
  return DEVELOPMENT_TERMS.some(term =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(hay)
  ) ? 'development' : 'culture';
}