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
  'tile': [
    'tile', 'tiling', 'ceramic tile', 'porcelain tile', 'stone tile'
  ],
  'framing': [
    'framing', 'rough framing', 'wood frame', 'metal stud', 'stud framing',
    'frame walls', 'framed wall'
  ],
  'excavation': [
    'excavation', 'excavate', 'underpinning', 'lower basement',
    'basement lowering', 'dig basement', 'foundation excavation'
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
  'tile': 'Tile',
  'framing': 'Framing',
  'excavation': 'Excavation/Foundation',
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
  deck: ['deck', 'porch', 'patio', 'pergola', 'gazebo'],
  framing: ['framing', 'rough framing', 'wood frame', 'metal stud', 'stud framing', 'frame walls', 'framed wall'],
  excavation: ['excavation', 'excavate', 'underpinning', 'lower basement', 'basement lowering', 'dig basement', 'foundation excavation'],
  basement: ['basement', 'cellar', 'lower level', 'underpinning', 'basement lowering']
};

export type PermitProjectScope =
  | 'ground-up'
  | 'gut-rehab'
  | 'bathroom'
  | 'kitchen'
  | 'kitchen-bath'
  | 'addition'
  | 'basement-excavation'
  | 'simple-residential'
  | 'commercial-industrial'
  | 'other';

export interface PermitScopeClassification {
  primary: PermitProjectScope;
  all: PermitProjectScope[];
  strictBathroom: boolean;
  strictKitchen: boolean;
  propertyContext: PermitPropertyContext;
  propertyContextSource: 'permit-description' | 'permit-unit-count' | 'unknown';
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
  work_type?: string;
  workType?: string;
}): PermitScopeClassification {
  const description = (permit.work_description || permit.workDescription || '').toLowerCase();
  const permitType = (permit.permit_type || permit.permitType || '').toLowerCase();
  const workType = (permit.work_type || permit.workType || '').toLowerCase();
  const text = `${description} ${permitType} ${workType}`;
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
  const hasBasementExcavation = has(['underpinning', 'lower basement', 'basement lowering', 'dig basement', 'foundation excavation', 'excavate basement']);
  const isCommercial = has(['commercial', 'industrial', 'warehouse', 'manufacturing', 'retail', 'office', 'storefront']);
  const isSingleFamily = has(['single family', 'single-family', '1 dwelling unit', 'one dwelling unit', '1du']) ||
    /\b1\s*(?:du|dwelling units?)\b/.test(text);
  const isCondo = has(['condo', 'condominium']);
  const isMultiFamily = has(['multi-family', 'multifamily', 'multi family', 'apartment', 'dwelling units', '2du', '3du', '4du']) ||
    /\b(?:2|3|4)\s*(?:du|dwelling units?)\b/.test(text);
  const isResidential = isSingleFamily || isCondo || isMultiFamily || has(['residential', 'townhouse', 'dwelling unit']);
  const residentialUnitMatch = text.match(/\b(\d+)\s+residential units?\b/);
  const statedResidentialUnits = residentialUnitMatch ? Number(residentialUnitMatch[1]) : null;
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
  else if (hasBasementExcavation) all.push('basement-excavation');
  else if (hasBathroom && hasKitchen) all.push('kitchen-bath');
  else if (strictBathroom || hasBathroom) all.push('bathroom');
  else if (strictKitchen || hasKitchen) all.push('kitchen');
  else if (isResidential && isSimpleWork) all.push('simple-residential');
  else all.push('other');

  let propertyContext: PermitPropertyContext = 'unknown';
  let propertyContextSource: PermitScopeClassification['propertyContextSource'] = 'unknown';
  if (isCommercial) propertyContext = 'commercial-industrial';
  else if (isSingleFamily) propertyContext = 'single-family';
  else if (isCondo) propertyContext = 'condo';
  else if (isMultiFamily) propertyContext = 'multi-family';
  else if (statedResidentialUnits != null && statedResidentialUnits > 1) propertyContext = 'multi-family';
  else if (statedResidentialUnits === 1) propertyContext = 'residential-unspecified';
  else if (isResidential) propertyContext = 'residential-unspecified';
  if (propertyContext !== 'unknown') {
    propertyContextSource = statedResidentialUnits != null && !isResidential && !isCommercial
      ? 'permit-unit-count'
      : 'permit-description';
  }

  return {
    primary: all[0],
    all,
    strictBathroom,
    strictKitchen,
    propertyContext,
    propertyContextSource,
  };
}

export function classifyPermitWorkTypes(permit: {
  work_description?: string;
  permit_type?: string;
  workDescription?: string;
  permitType?: string;
  work_type?: string;
  workType?: string;
}): string[] {
  const text = `${permit.work_description || permit.workDescription || ''} ${permit.permit_type || permit.permitType || ''} ${permit.work_type || permit.workType || ''}`.toLowerCase();
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
  work_type?: string;
  workType?: string;
}): SpecialtyClassification {
  const description = (permit.work_description || permit.workDescription || '').toLowerCase();
  const permitType = (permit.permit_type || permit.permitType || '').toLowerCase();
  const workType = (permit.work_type || permit.workType || '').toLowerCase();
  const classificationText = `${description} ${workType}`;
  
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
                       'flooring', 'tile', 'framing', 'excavation', 'addition', 'basement'];
  
  for (const specialty of specialties) {
    const keywords = SPECIALTY_KEYWORDS[specialty];
    if (keywords.some(kw => classificationText.includes(kw))) {
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

export function classifyContractorRole(contactType: string): string {
  const type = contactType.toUpperCase();
  if (type.includes('ELECTRICAL')) return 'electrical';
  if (type.includes('PLUMB')) return 'plumbing';
  if (type.includes('HVAC') || type.includes('MECHANICAL') || type.includes('HEATING') ||
      type.includes('VENTILATION') || type.includes('REFRIGERATION')) return 'hvac/mechanical';
  if (type.includes('ROOF')) return 'roofing';
  if (type.includes('MASON')) return 'masonry';
  if (type.includes('CARPENT') || type.includes('FRAM')) return 'carpentry/framing';
  if (type.includes('TILE')) return 'tile';
  if (type.includes('CONCRETE')) return 'concrete';
  if (type.includes('ELEVATOR')) return 'elevator';
  if (type.includes('ALARM')) return 'alarm';
  if (type.includes('SIGN')) return 'sign';
  if (type.includes('TENT')) return 'tent';
  if (type.includes('WRECK') || type.includes('DEMOLITION')) return 'wrecking/demolition';
  if (type.includes('GENERAL')) return 'general';
  return 'contractor';
}

export function extractContractorContacts(
  permit: Record<string, string | undefined>,
): { name: string; roles: string[]; rawContactTypes: string[] }[] {
  const found = new Map<string, { roles: Set<string>; rawContactTypes: Set<string> }>();
  for (let i = 1; i <= 15; i++) {
    const contactType = (permit[`contact_${i}_type`] || '').toUpperCase();
    const contactName = permit[`contact_${i}_name`] || null;
    if (!contactType.includes('CONTRACTOR') || contactType.includes('OWNER AS') || !contactName) continue;
    const name = normalizeContractorName(contactName);
    if (!name) continue;
    if (!found.has(name)) found.set(name, { roles: new Set(), rawContactTypes: new Set() });
    found.get(name)!.roles.add(classifyContractorRole(contactType));
    found.get(name)!.rawContactTypes.add(contactType);
  }
  return Array.from(found, ([name, evidence]) => ({
    name,
    roles: Array.from(evidence.roles),
    rawContactTypes: Array.from(evidence.rawContactTypes),
  }));
}

const WORK_TYPE_ROLES: Record<string, string[]> = {
  electrical: ['electrical'],
  plumbing: ['plumbing'],
  hvac: ['hvac/mechanical'],
  roofing: ['roofing', 'general', 'contractor'],
  framing: ['carpentry/framing', 'general', 'contractor'],
  tile: ['tile', 'general', 'contractor'],
  excavation: ['masonry', 'concrete', 'general', 'contractor'],
  basement: ['masonry', 'concrete', 'plumbing', 'general', 'contractor'],
  bathroom: ['plumbing', 'tile', 'general', 'contractor'],
  kitchen: ['plumbing', 'general', 'contractor'],
  flooring: ['tile', 'general', 'contractor'],
  windows: ['general', 'contractor'],
  deck: ['carpentry/framing', 'general', 'contractor'],
};

export function isRoleRelevantToWorkType(role: string, workType: string): boolean {
  return (WORK_TYPE_ROLES[workType] || ['general', 'contractor']).includes(role);
}
