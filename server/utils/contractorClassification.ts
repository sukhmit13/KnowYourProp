export const SPECIALTY_KEYWORDS: Record<string, string[]> = {
  'new-construction': [
    'new construction', 'new single family', 'new home',
    'new building', 'new residential', 'new structure'
  ],
  'gut-rehab': [
    'gut rehab', 'gut renovation', 'complete renovation',
    'full renovation', 'total renovation', 'gut remodel', 'entire interior'
  ],
  'kitchen': [
    'kitchen', 'kitch', 'cabinets', 'countertop', 'countertops',
    'granite', 'quartz', 'backsplash', 'island', 'pantry'
  ],
  'bathroom': [
    'bathroom', 'bath', 'toilet', 'shower', 'tub', 'bathtub',
    'vanity', 'fixture', 'master bath', 'powder room'
  ],
  'roofing': [
    'roof', 'roofing', 'reroof', 'shingle', 'shingles', 'gutter',
    'gutters', 'soffit', 'fascia', 'flashing', 'skylight'
  ],
  'hvac': [
    'hvac', 'furnace', 'boiler', 'air conditioning', 'a/c', 'ac unit',
    'heating', 'cooling', 'ductwork', 'thermostat', 'heat pump', 'mechanical'
  ],
  'electrical': [
    'electrical', 'electric', 'wiring', 'rewire', 'panel',
    'circuit', 'outlet', 'service upgrade', 'amp upgrade'
  ],
  'plumbing': [
    'plumbing', 'plumb', 'water heater', 'pipe', 'pipes',
    'drain', 'sewer', 'water line', 'gas line', 'sump pump'
  ],
  'deck-porch': [
    'deck', 'porch', 'patio', 'pergola', 'gazebo', 'outdoor'
  ],
  'windows-doors': [
    'window', 'windows', 'door', 'doors', 'sliding door',
    'french door', 'entry door', 'patio door', 'storm door'
  ],
  'siding-exterior': [
    'siding', 'vinyl siding', 'brick', 'stucco', 'hardie board',
    'exterior', 'facade', 'cladding'
  ],
  'flooring': [
    'flooring', 'floor', 'hardwood', 'laminate', 'tile floor',
    'carpet', 'refinish floor', 'sand floor', 'vinyl plank'
  ],
  'addition': [
    'addition', 'extend', 'extension', 'bump out',
    'second floor', 'third floor', 'sunroom'
  ],
  'basement': [
    'basement', 'lower level', 'cellar', 'foundation',
    'basement finish', 'egress window'
  ],
  'general': [
    'renovation', 'remodel', 'alteration', 'repair', 'improvement'
  ]
};

export const SPECIALTY_DISPLAY_NAMES: Record<string, string> = {
  'new-construction': 'New Construction',
  'gut-rehab': 'Gut Rehab',
  'kitchen': 'Kitchen Remodeling',
  'bathroom': 'Bathroom Renovation',
  'roofing': 'Roofing',
  'hvac': 'HVAC/Mechanical',
  'electrical': 'Electrical',
  'plumbing': 'Plumbing',
  'deck-porch': 'Deck/Porch',
  'windows-doors': 'Windows/Doors',
  'siding-exterior': 'Siding/Exterior',
  'flooring': 'Flooring',
  'addition': 'Additions',
  'basement': 'Basement',
  'general': 'General Renovation'
};

export const WORK_TYPE_KEYWORDS: Record<string, string[]> = {
  bathroom: ['bathroom', 'bath', 'toilet', 'shower', 'tub', 'bathtub', 'vanity', 'powder room'],
  tile: ['tile', 'tiles', 'tiling'],
  kitchen: ['kitchen', 'kitch', 'cabinet', 'countertop', 'backsplash', 'island', 'pantry'],
  flooring: ['flooring', 'floor', 'hardwood', 'laminate', 'carpet', 'vinyl plank'],
  roofing: ['roof', 'roofing', 'reroof', 'shingle', 'gutter', 'soffit', 'fascia', 'flashing'],
  hvac: ['hvac', 'furnace', 'boiler', 'air conditioning', 'heating', 'cooling', 'ductwork', 'thermostat'],
  electrical: ['electrical', 'electric', 'wiring', 'rewire', 'panel', 'circuit', 'outlet'],
  plumbing: ['plumbing', 'plumb', 'water heater', 'pipe', 'drain', 'sewer', 'water line', 'gas line'],
  windows: ['window', 'windows', 'door', 'doors', 'sliding door', 'entry door', 'patio door'],
  deck: ['deck', 'porch', 'patio', 'pergola', 'gazebo']
};

export type PermitProjectScope =
  | 'ground-up'
  | 'gut-rehab'
  | 'bathroom'
  | 'kitchen'
  | 'kitchen-bath'
  | 'addition'
  | 'simple-residential'
  | 'commercial-industrial'
  | 'other';

export interface PermitScopeClassification {
  primary: PermitProjectScope;
  all: PermitProjectScope[];
  strictBathroom: boolean;
  strictKitchen: boolean;
  propertyContext: PermitPropertyContext;
}

export type PermitPropertyContext =
  | 'single-family'
  | 'condo'
  | 'multi-family'
  | 'residential-unspecified'
  | 'commercial-industrial'
  | 'unknown';

/**
 * Classify the scale and intent of a permitted project. This deliberately
 * favors a narrower label over a broad one: a bathroom mention inside a gut
 * rehab is not counted as a standalone bathroom remodel.
 */
export function classifyPermitProjectScope(permit: {
  work_description?: string;
  permit_type?: string;
  workDescription?: string;
  permitType?: string;
}): PermitScopeClassification {
  const description = (permit.work_description || permit.workDescription || '').toLowerCase();
  const permitType = (permit.permit_type || permit.permitType || '').toLowerCase();
  const text = `${description} ${permitType}`;
  const has = (terms: string[]) => terms.some(term => text.includes(term));
  const isGroundUp = has([
    'new construction', 'new building', 'new structure', 'new single family',
    'new residential', 'ground up', 'ground-up',
  ]);
  const isGutRehab = has([
    'gut rehab', 'gut renovation', 'complete renovation', 'full renovation',
    'total renovation', 'gut remodel', 'entire interior', 'whole house',
    'whole-house', 'interior buildout',
  ]);
  const hasBathroom = has(['bathroom', 'bath', 'toilet', 'shower', 'tub', 'bathtub', 'vanity', 'powder room']);
  const hasKitchen = has(['kitchen', 'kitch', 'cabinet', 'countertop', 'backsplash', 'island', 'pantry']);
  const hasAddition = has(['addition', 'extend', 'extension', 'bump out', 'second floor', 'third floor', 'sunroom']);
  const isCommercial = has(['commercial', 'industrial', 'warehouse', 'manufacturing', 'retail', 'office', 'storefront']);
  const isSingleFamily = has(['single family', 'single-family', '1 dwelling unit', 'one dwelling unit', '1du']) ||
    /\b1\s*(?:du|dwelling units?)\b/.test(text);
  const isCondo = has(['condo', 'condominium']);
  const isMultiFamily = has(['multi-family', 'multifamily', 'multi family', 'apartment', 'dwelling units', '2du', '3du', '4du']) ||
    /\b(?:2|3|4)\s*(?:du|dwelling units?)\b/.test(text);
  const isResidential = isSingleFamily || isCondo || isMultiFamily || has(['residential', 'townhouse', 'dwelling unit']);
  const isSimpleWork = has([
    'interior alteration', 'interior renovation', 'interior remodel',
    'nonstructural alteration', 'non-structural alteration',
    'repair and replace', 'repairs to existing',
  ]);
  const hasBroadScope = isGroundUp || isGutRehab || hasAddition || has(['basement', 'foundation', 'structural', 'whole property']);

  const strictBathroom = hasBathroom && !hasKitchen && !hasBroadScope && !isCommercial;
  const strictKitchen = hasKitchen && !hasBathroom && !hasBroadScope && !isCommercial;
  const all: PermitProjectScope[] = [];

  if (isGroundUp) all.push('ground-up');
  else if (isGutRehab) all.push('gut-rehab');
  else if (isCommercial) all.push('commercial-industrial');
  else if (hasAddition) all.push('addition');
  else if (hasBathroom && hasKitchen) all.push('kitchen-bath');
  else if (strictBathroom || hasBathroom) all.push('bathroom');
  else if (strictKitchen || hasKitchen) all.push('kitchen');
  else if (isResidential && isSimpleWork) all.push('simple-residential');
  else all.push('other');

  let propertyContext: PermitPropertyContext = 'unknown';
  if (isCommercial) propertyContext = 'commercial-industrial';
  else if (isSingleFamily) propertyContext = 'single-family';
  else if (isCondo) propertyContext = 'condo';
  else if (isMultiFamily) propertyContext = 'multi-family';
  else if (isResidential) propertyContext = 'residential-unspecified';

  return {
    primary: all[0],
    all,
    strictBathroom,
    strictKitchen,
    propertyContext,
  };
}

export function classifyPermitWorkTypes(permit: {
  work_description?: string;
  permit_type?: string;
  workDescription?: string;
  permitType?: string;
}): string[] {
  const text = `${permit.work_description || permit.workDescription || ''} ${permit.permit_type || permit.permitType || ''}`.toLowerCase();
  return Object.entries(WORK_TYPE_KEYWORDS)
    .filter(([, keywords]) => keywords.some(keyword => text.includes(keyword)))
    .map(([workType]) => workType);
}

export interface SpecialtyClassification {
  primary: string;
  all: string[];
  score: number;
}

export function classifyPermitSpecialty(permit: { 
  work_description?: string; 
  permit_type?: string;
  workDescription?: string;
  permitType?: string;
}): SpecialtyClassification {
  const description = (permit.work_description || permit.workDescription || '').toLowerCase();
  const permitType = (permit.permit_type || permit.permitType || '').toLowerCase();
  
  const matchedSpecialties: string[] = [];
  
  if (permitType.includes('new construction') || 
      SPECIALTY_KEYWORDS['new-construction'].some(kw => description.includes(kw))) {
    matchedSpecialties.push('new-construction');
  }
  
  if (SPECIALTY_KEYWORDS['gut-rehab'].some(kw => description.includes(kw))) {
    matchedSpecialties.push('gut-rehab');
  }
  
  const specialties = ['kitchen', 'bathroom', 'roofing', 'hvac', 'electrical', 
                       'plumbing', 'deck-porch', 'windows-doors', 'siding-exterior', 
                       'flooring', 'addition', 'basement'];
  
  for (const specialty of specialties) {
    const keywords = SPECIALTY_KEYWORDS[specialty];
    if (keywords.some(kw => description.includes(kw))) {
      if (!matchedSpecialties.includes(specialty)) {
        matchedSpecialties.push(specialty);
      }
    }
  }
  
  if (matchedSpecialties.length === 0) {
    if (SPECIALTY_KEYWORDS['general'].some(kw => description.includes(kw))) {
      matchedSpecialties.push('general');
    } else {
      matchedSpecialties.push('general');
    }
  }
  
  let score: number;
  if (matchedSpecialties.length === 1) {
    score = 1;
  } else if (matchedSpecialties.length <= 3) {
    score = 0.5;
  } else {
    score = 0.3;
  }
  
  return {
    primary: matchedSpecialties[0],
    all: matchedSpecialties,
    score
  };
}

export function normalizeContractorName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function generateContractorSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}
