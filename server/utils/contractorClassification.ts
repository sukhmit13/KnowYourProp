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
