import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'ChicagoEligibilityScreener/1.0',
  },
});

const RSS_FEEDS: Record<string, string> = {
  block_club_west_town: 'https://blockclubchicago.org/category/wicker-park-bucktown-west-town/feed/',
  block_club_logan_square: 'https://blockclubchicago.org/category/logan-square/feed/',
  block_club_pilsen: 'https://blockclubchicago.org/category/pilsen-little-village/feed/',
  block_club_near_west: 'https://blockclubchicago.org/category/near-west-side-west-loop/feed/',
  block_club_lakeview: 'https://blockclubchicago.org/category/lake-view/feed/',
  block_club_lincoln_park: 'https://blockclubchicago.org/category/lincoln-park/feed/',
  block_club_uptown: 'https://blockclubchicago.org/category/uptown/feed/',
  block_club_humboldt: 'https://blockclubchicago.org/category/humboldt-park/feed/',
  block_club_avondale: 'https://blockclubchicago.org/category/irving-park-avondale/feed/',
  block_club_rogers_park: 'https://blockclubchicago.org/category/rogers-park-edgewater/feed/',
  block_club_bridgeport: 'https://blockclubchicago.org/category/bridgeport/feed/',
  block_club_bronzeville: 'https://blockclubchicago.org/category/south-side/feed/',
  block_club_hyde_park: 'https://blockclubchicago.org/category/hyde-park-woodlawn/feed/',
  block_club_back_of_yards: 'https://blockclubchicago.org/category/back-of-the-yards-new-city/feed/',
  block_club_south_shore: 'https://blockclubchicago.org/category/south-shore-chatham/feed/',
  block_club_austin: 'https://blockclubchicago.org/category/austin-garfield-park/feed/',
  block_club_lincoln_square: 'https://blockclubchicago.org/category/lincoln-square-ravenswood/feed/',
  block_club_citywide: 'https://blockclubchicago.org/feed/',
  eater_chicago: 'https://chicago.eater.com/rss/index.xml',
  what_now_chicago: 'https://whatnow.com/chicago/feed/',
  chicago_yimby: 'https://chicagoyimby.com/feed/',
  real_deal_chicago: 'https://therealdeal.com/chicago/feed/',
  crains_chicago: 'https://news.google.com/rss/search?q=site:chicagobusiness.com+chicago+restaurant+OR+development+OR+construction+OR+opening+OR+dining+OR+retail+OR+real+estate&hl=en-US&gl=US&ceid=US:en',
};

function buildCrainsSingleCorridorFeedUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:chicagobusiness.com "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildCrainsNeighborhoodFeedUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 5).map(a => `"${a}"`).join(' OR ');
  const query = `site:chicagobusiness.com ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildYimbyCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:chicagoyimby.com "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildBlockClubCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:blockclubchicago.org "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildRealDealNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:therealdeal.com/chicago ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildRealDealCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:therealdeal.com/chicago "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildYimbyNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:chicagoyimby.com ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildDezeenNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:dezeen.com chicago ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildDezeenCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:dezeen.com chicago "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildDwellNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:dwell.com chicago ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildDwellCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:dwell.com chicago "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildArchDailyNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:archdaily.com chicago ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildArchDailyCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:archdaily.com chicago "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildInfatuationNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:theinfatuation.com chicago ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildInfatuationCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:theinfatuation.com chicago "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildTimeoutNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:timeout.com/chicago ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildTimeoutCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:timeout.com/chicago "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildChicagoReaderNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:chicagoreader.com ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildUrbanizeNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:urbanize.city/chicago ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}


function buildBisnowNeighborhoodSearchUrl(neighborhood: string): string {
  const aliases = NEIGHBORHOOD_ALIASES[neighborhood.toLowerCase()] || [neighborhood.toLowerCase()];
  const quotedTerms = aliases.slice(0, 3).map(a => `"${a}"`).join(' OR ');
  const query = `site:bisnow.com/chicago ${quotedTerms}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function buildChicagoReaderCorridorSearchUrl(corridorKey: string): string {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return '';
  const query = `site:chicagoreader.com "${corridor.names[0]}"`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

const NEIGHBORHOOD_FEED_MAP: Record<string, string[]> = {
  'west town': ['block_club_west_town'],
  'wicker park': ['block_club_west_town'],
  'bucktown': ['block_club_west_town'],
  'ukrainian village': ['block_club_west_town'],
  'logan square': ['block_club_logan_square'],
  'humboldt park': ['block_club_humboldt'],
  'pilsen': ['block_club_pilsen'],
  'little village': ['block_club_pilsen'],
  'west loop': ['block_club_near_west'],
  'near west side': ['block_club_near_west'],
  'lakeview': ['block_club_lakeview'],
  'lake view': ['block_club_lakeview'],
  'lincoln park': ['block_club_lincoln_park'],
  'uptown': ['block_club_uptown'],
};

const NEIGHBORHOOD_ALIASES: Record<string, string[]> = {
  'west town': ['west town', 'chicago avenue', 'chicago ave', 'noble square', 'smith park', 'east village'],
  'wicker park': ['wicker park', 'milwaukee ave', 'division st', 'damen ave'],
  'bucktown': ['bucktown', 'armitage ave', 'western ave'],
  'logan square': ['logan square', 'logan blvd', 'fullerton ave', 'kedzie'],
  'humboldt park': ['humboldt park', 'humboldt blvd', 'paseo boricua'],
  'pilsen': ['pilsen', '18th street', 'halsted st'],
  'little village': ['little village', '26th street'],
  'west loop': ['west loop', 'randolph st', 'fulton market', 'restaurant row'],
  'near west side': ['near west side', 'west loop', 'greektown', 'uic'],
  'lakeview': ['lakeview', 'lake view', 'wrigleyville', 'boystown', 'southport'],
  'lincoln park': ['lincoln park', 'armitage', 'halsted', 'clybourn'],
  'uptown': ['uptown', 'argyle', 'broadway'],
  'hyde park': ['hyde park', 'kenwood', '53rd st'],
  'bronzeville': ['bronzeville', 'king drive', 'cottage grove'],
  'avondale': ['avondale', 'belmont ave'],
  'irving park': ['irving park'],
  'portage park': ['portage park'],
  'albany park': ['albany park', 'kedzie ave'],
  'rogers park': ['rogers park', 'morse ave'],
  'edgewater': ['edgewater', 'bryn mawr'],
};

export const CORRIDOR_KEYWORDS: Record<string, {
  names: string[];
  tier: number;
  description: string;
  lat_min: number;
  lat_max: number;
  lng_min: number;
  lng_max: number;
  line?: { lat1: number; lng1: number; lat2: number; lng2: number };
}> = {
  chicago_avenue: {
    names: ['chicago avenue', 'w chicago avenue', 'w. chicago avenue', 'west chicago avenue', 'w chicago ave', 'w. chicago ave', 'west chicago ave', 'chicago ave.'],
    tier: 1,
    description: 'Major West Town dining corridor',
    lat_min: 41.894, lat_max: 41.90, lng_min: -87.70, lng_max: -87.64,
  },
  milwaukee_avenue: {
    names: ['milwaukee avenue', 'milwaukee ave', 'n milwaukee ave', 'north milwaukee avenue'],
    tier: 1,
    description: 'Wicker Park/Logan Square main artery',
    lat_min: 41.89, lat_max: 41.95, lng_min: -87.72, lng_max: -87.66,
    line: { lat1: 41.876, lng1: -87.655, lat2: 41.955, lng2: -87.722 },
  },
  randolph_street: {
    names: ['randolph street', 'randolph st', 'w randolph st', 'west randolph'],
    tier: 1,
    description: 'West Loop/Fulton Market corridor',
    lat_min: 41.88, lat_max: 41.89, lng_min: -87.66, lng_max: -87.63,
  },
  division_street: {
    names: ['division street', 'division st', 'w division st', 'west division'],
    tier: 1,
    description: 'Wicker Park nightlife corridor',
    lat_min: 41.90, lat_max: 41.91, lng_min: -87.68, lng_max: -87.66,
  },
  armitage_avenue: {
    names: ['armitage avenue', 'armitage ave', 'w armitage ave', 'west armitage'],
    tier: 1,
    description: 'Major east-west corridor through Humboldt Park, Logan Square, Bucktown, and Lincoln Park',
    lat_min: 41.916, lat_max: 41.919, lng_min: -87.72, lng_max: -87.63,
  },
  halsted_street: {
    names: ['halsted street', 'halsted st', 'n halsted st', 'n. halsted st', 's halsted st', 'south halsted'],
    tier: 1,
    description: 'Major north-south corridor through West Loop, Greektown, Lincoln Park, and Lakeview',
    lat_min: 41.87, lat_max: 41.95, lng_min: -87.649, lng_max: -87.644,
  },
  california_avenue: {
    names: ['california avenue', 'california ave', 'n california ave', 'south california avenue', 's california ave'],
    tier: 2,
    description: 'North-south commercial corridor through Humboldt Park and Logan Square',
    lat_min: 41.85, lat_max: 41.93, lng_min: -87.697, lng_max: -87.692,
  },
  grand_avenue: {
    names: ['grand avenue', 'grand ave', 'w grand ave'],
    tier: 2,
    description: 'Emerging West Town corridor',
    lat_min: 41.889, lat_max: 41.893, lng_min: -87.70, lng_max: -87.64,
  },
  '18th_street': {
    names: ['18th street', '18th st', 'west 18th', 'w 18th st'],
    tier: 2,
    description: 'Pilsen cultural corridor',
    lat_min: 41.85, lat_max: 41.86, lng_min: -87.68, lng_max: -87.64,
  },
  damen_avenue: {
    names: ['damen avenue', 'damen ave', 'n damen ave'],
    tier: 2,
    description: 'Wicker Park/Bucktown corridor',
    lat_min: 41.90, lat_max: 41.93, lng_min: -87.68, lng_max: -87.67,
  },
  '53rd_street': {
    names: ['53rd street', '53rd st', 'east 53rd', 'e 53rd st'],
    tier: 1,
    description: 'Hyde Park commercial corridor',
    lat_min: 41.79, lat_max: 41.80, lng_min: -87.61, lng_max: -87.58,
  },
  '57th_street': {
    names: ['57th street', '57th st', 'east 57th', 'e 57th st'],
    tier: 1,
    description: 'Hyde Park shopping and dining corridor',
    lat_min: 41.79, lat_max: 41.80, lng_min: -87.61, lng_max: -87.58,
  },
  cottage_grove: {
    names: ['cottage grove', 'cottage grove avenue', 'cottage grove ave', 's cottage grove'],
    tier: 2,
    description: 'South Side corridor through Bronzeville and Woodlawn',
    lat_min: 41.80, lat_max: 41.85, lng_min: -87.61, lng_max: -87.60,
  },
  north_avenue: {
    names: ['north avenue', 'north ave', 'w north ave', 'w. north ave', 'west north avenue', 'west north ave', 'north ave.'],
    tier: 1,
    description: 'Major east-west corridor through Wicker Park, Bucktown, and Humboldt Park',
    lat_min: 41.908, lat_max: 41.912, lng_min: -87.72, lng_max: -87.63,
  },
  fullerton_avenue: {
    names: ['fullerton avenue', 'fullerton ave', 'w fullerton ave', 'w. fullerton ave', 'west fullerton avenue', 'west fullerton ave', 'fullerton ave.'],
    tier: 1,
    description: 'Major east-west corridor through Lincoln Park, Bucktown, and Logan Square',
    lat_min: 41.923, lat_max: 41.927, lng_min: -87.72, lng_max: -87.63,
  },
  ashland_avenue: {
    names: ['ashland avenue', 'ashland ave', 'n ashland ave', 'n. ashland ave', 'north ashland avenue', 's ashland ave', 'south ashland avenue'],
    tier: 1,
    description: 'Major north-south corridor through West Town, Wicker Park, and Bucktown',
    lat_min: 41.85, lat_max: 41.95, lng_min: -87.670, lng_max: -87.665,
  },
  western_avenue: {
    names: ['western avenue', 'western ave', 'n western ave', 'n. western ave', 'north western avenue', 's western ave', 'south western avenue'],
    tier: 1,
    description: 'Major north-south corridor spanning the city through multiple neighborhoods',
    lat_min: 41.82, lat_max: 41.97, lng_min: -87.690, lng_max: -87.685,
  },
  lake_street: {
    names: ['lake street', 'lake st', 'w lake st', 'w. lake st', 'west lake street', 'west lake st'],
    tier: 1,
    description: 'West Loop/Fulton Market dining and nightlife corridor',
    lat_min: 41.884, lat_max: 41.887, lng_min: -87.67, lng_max: -87.63,
  },
  fulton_street: {
    names: ['fulton street', 'fulton st', 'w fulton st', 'w. fulton st', 'west fulton street', 'west fulton st', 'fulton market'],
    tier: 1,
    description: 'Fulton Market district — premier restaurant and tech corridor',
    lat_min: 41.886, lat_max: 41.889, lng_min: -87.67, lng_max: -87.63,
  },
  madison_street: {
    names: ['madison street', 'madison st', 'w madison st', 'w. madison st', 'west madison street', 'west madison st'],
    tier: 1,
    description: 'Major east-west corridor through West Loop and Near West Side',
    lat_min: 41.880, lat_max: 41.883, lng_min: -87.68, lng_max: -87.63,
  },
  washington_street: {
    names: ['washington street', 'washington st', 'w washington st', 'w. washington st', 'west washington street', 'west washington st', 'washington blvd', 'w washington blvd'],
    tier: 1,
    description: 'West Loop corridor connecting the Loop to the Near West Side',
    lat_min: 41.882, lat_max: 41.885, lng_min: -87.67, lng_max: -87.63,
  },
  kedzie_avenue: {
    names: ['kedzie avenue', 'kedzie ave', 'n kedzie ave', 'n. kedzie ave', 'north kedzie avenue', 's kedzie ave', 'south kedzie avenue', 'kedzie ave.'],
    tier: 1,
    description: 'Major north-south corridor through Logan Square, Avondale, and Humboldt Park',
    lat_min: 41.85, lat_max: 41.96, lng_min: -87.710, lng_max: -87.705,
  },
  diversey_avenue: {
    names: ['diversey avenue', 'diversey ave', 'w diversey ave', 'w. diversey ave', 'west diversey avenue', 'west diversey ave', 'diversey ave.', 'diversey pkwy', 'diversey parkway'],
    tier: 1,
    description: 'Major east-west corridor through Logan Square, Avondale, and Lakeview',
    lat_min: 41.931, lat_max: 41.934, lng_min: -87.74, lng_max: -87.63,
  },
  belmont_avenue: {
    names: ['belmont avenue', 'belmont ave', 'w belmont ave', 'w. belmont ave', 'west belmont avenue', 'west belmont ave', 'belmont ave.'],
    tier: 1,
    description: 'Major east-west corridor through Avondale, Lakeview, and Belmont Cragin',
    lat_min: 41.938, lat_max: 41.941, lng_min: -87.74, lng_max: -87.63,
  },
  irving_park_road: {
    names: ['irving park road', 'irving park rd', 'w irving park rd', 'w. irving park rd', 'west irving park', 'irving park'],
    tier: 1,
    description: 'Major east-west corridor through Irving Park, Avondale, and Old Irving Park',
    lat_min: 41.952, lat_max: 41.955, lng_min: -87.76, lng_max: -87.63,
  },
  lincoln_avenue: {
    names: ['lincoln avenue', 'lincoln ave', 'n lincoln ave', 'n. lincoln ave', 'north lincoln avenue', 'north lincoln ave'],
    tier: 1,
    description: 'Diagonal corridor through Lincoln Park, Lincoln Square, and North Center',
    lat_min: 41.91, lat_max: 41.97, lng_min: -87.71, lng_max: -87.64,
    line: { lat1: 41.914, lng1: -87.645, lat2: 41.968, lng2: -87.709 },
  },
  clark_street: {
    names: ['clark street', 'clark st', 'n clark st', 'n. clark st', 'north clark street', 's clark st', 'south clark street'],
    tier: 1,
    description: 'Major north-south corridor through Lakeview, Andersonville, and Rogers Park',
    lat_min: 41.932, lat_max: 41.99, lng_min: -87.670, lng_max: -87.663,
  },
  broadway: {
    names: ['broadway', 'n broadway', 'north broadway', 'broadway ave', 'broadway street'],
    tier: 1,
    description: 'Major north-south corridor through Uptown, Edgewater, and Lakeview',
    lat_min: 41.94, lat_max: 41.99, lng_min: -87.662, lng_max: -87.656,
  },
  lawrence_avenue: {
    names: ['lawrence avenue', 'lawrence ave', 'w lawrence ave', 'w. lawrence ave', 'west lawrence avenue', 'west lawrence ave'],
    tier: 1,
    description: 'Major east-west corridor through Albany Park, Lincoln Square, and Ravenswood',
    lat_min: 41.967, lat_max: 41.970, lng_min: -87.74, lng_max: -87.63,
  },
  devon_avenue: {
    names: ['devon avenue', 'devon ave', 'w devon ave', 'w. devon ave', 'west devon avenue', 'west devon ave'],
    tier: 1,
    description: 'Multicultural corridor through Rogers Park and West Ridge',
    lat_min: 41.997, lat_max: 42.000, lng_min: -87.72, lng_max: -87.65,
  },
  cermak_road: {
    names: ['cermak road', 'cermak rd', 'w cermak rd', 'w. cermak rd', 'west cermak road', 'west cermak rd', 'cermak'],
    tier: 1,
    description: 'Major east-west corridor through Chinatown, Pilsen, and Little Village',
    lat_min: 41.851, lat_max: 41.854, lng_min: -87.70, lng_max: -87.62,
  },
  roosevelt_road: {
    names: ['roosevelt road', 'roosevelt rd', 'w roosevelt rd', 'w. roosevelt rd', 'west roosevelt road', 'west roosevelt rd'],
    tier: 1,
    description: 'Major east-west corridor through Near West Side, University Village, and South Loop',
    lat_min: 41.866, lat_max: 41.868, lng_min: -87.70, lng_max: -87.62,
  },
  archer_avenue: {
    names: ['archer avenue', 'archer ave', 's archer ave', 's. archer ave', 'south archer avenue', 'south archer ave'],
    tier: 2,
    description: 'Diagonal corridor through Bridgeport, Brighton Park, and Chinatown',
    lat_min: 41.81, lat_max: 41.86, lng_min: -87.70, lng_max: -87.63,
    line: { lat1: 41.856, lng1: -87.634, lat2: 41.813, lng2: -87.697 },
  },
  pulaski_road: {
    names: ['pulaski road', 'pulaski rd', 'n pulaski rd', 'n. pulaski rd', 'north pulaski road', 's pulaski rd', 'south pulaski road'],
    tier: 2,
    description: 'Major north-south corridor spanning the city through multiple neighborhoods',
    lat_min: 41.82, lat_max: 41.97, lng_min: -87.728, lng_max: -87.723,
  },
  '63rd_street': {
    names: ['63rd street', '63rd st', 'west 63rd', 'w 63rd st', 'e 63rd st', 'east 63rd'],
    tier: 1,
    description: 'Major south side commercial corridor through Woodlawn, Englewood, and West Englewood',
    lat_min: 41.778, lat_max: 41.781, lng_min: -87.67, lng_max: -87.58,
  },
  '79th_street': {
    names: ['79th street', '79th st', 'west 79th', 'w 79th st', 'e 79th st', 'east 79th'],
    tier: 1,
    description: 'Major south side corridor through Auburn Gresham, Chatham, and South Shore',
    lat_min: 41.749, lat_max: 41.752, lng_min: -87.68, lng_max: -87.57,
  },
  stony_island_avenue: {
    names: ['stony island avenue', 'stony island ave', 's stony island ave', 's. stony island ave', 'stony island'],
    tier: 2,
    description: 'Major south side north-south corridor through Hyde Park, Woodlawn, and South Shore',
    lat_min: 41.76, lat_max: 41.83, lng_min: -87.589, lng_max: -87.583,
  },
  king_drive: {
    names: ['king drive', 'martin luther king drive', 'mlk drive', 'dr martin luther king jr drive', 's king dr', 'martin luther king jr drive', 'king dr'],
    tier: 2,
    description: 'Historic corridor through Bronzeville, Douglas, and Grand Boulevard',
    lat_min: 41.79, lat_max: 41.85, lng_min: -87.619, lng_max: -87.613,
  },
  '95th_street': {
    names: ['95th street', '95th st', 'west 95th', 'w 95th st', 'e 95th st', 'east 95th'],
    tier: 1,
    description: 'Major far south side corridor through Beverly, Washington Heights, and Roseland',
    lat_min: 41.721, lat_max: 41.724, lng_min: -87.68, lng_max: -87.57,
  },
  '47th_street': {
    names: ['47th street', '47th st', 'west 47th', 'w 47th st', 'e 47th st', 'east 47th'],
    tier: 1,
    description: 'Major south side commercial corridor through Bronzeville, Kenwood, and Back of the Yards',
    lat_min: 41.808, lat_max: 41.811, lng_min: -87.66, lng_max: -87.58,
  },
  '35th_street': {
    names: ['35th street', '35th st', 'west 35th', 'w 35th st', 'e 35th st', 'east 35th'],
    tier: 2,
    description: 'Corridor through Bridgeport, Bronzeville, and IIT/Comiskey Park area',
    lat_min: 41.829, lat_max: 41.832, lng_min: -87.67, lng_max: -87.60,
  },
  cicero_avenue: {
    names: ['cicero avenue', 'cicero ave', 'n cicero ave', 'n. cicero ave', 'north cicero avenue', 's cicero ave', 'south cicero avenue'],
    tier: 2,
    description: 'Major north-south corridor along Chicago western boundary',
    lat_min: 41.82, lat_max: 41.96, lng_min: -87.748, lng_max: -87.743,
  },
};

function pointToSegmentDistMiles(
  pLat: number, pLng: number,
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const cosLat = Math.cos(pLat * Math.PI / 180);
  const px = (pLng - lng1) * cosLat;
  const py = pLat - lat1;
  const dx = (lng2 - lng1) * cosLat;
  const dy = lat2 - lat1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px * dx + py * dy) / lenSq);
  t = Math.max(0, Math.min(1, t));
  const closestX = (lng1 + t * (lng2 - lng1)) * cosLat;
  const closestY = lat1 + t * (lat2 - lat1);
  const ex = pLng * cosLat - closestX;
  const ey = pLat - closestY;
  return Math.sqrt(ex * ex + ey * ey) * 69.0;
}

function distanceToCorridorMiles(lat: number, lng: number, corridorKey: string): number {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return Infinity;

  if (corridor.line) {
    return pointToSegmentDistMiles(lat, lng, corridor.line.lat1, corridor.line.lng1, corridor.line.lat2, corridor.line.lng2);
  }

  const latRange = corridor.lat_max - corridor.lat_min;
  const lngRange = corridor.lng_max - corridor.lng_min;
  const cosLat = Math.cos(lat * Math.PI / 180);
  const latRangeMi = latRange * 69.0;
  const lngRangeMi = lngRange * 69.0 * cosLat;

  if (latRangeMi > 3 * lngRangeMi) {
    const centerLng = (corridor.lng_min + corridor.lng_max) / 2;
    return pointToSegmentDistMiles(lat, lng, corridor.lat_min, centerLng, corridor.lat_max, centerLng);
  } else {
    const centerLat = (corridor.lat_min + corridor.lat_max) / 2;
    return pointToSegmentDistMiles(lat, lng, centerLat, corridor.lng_min, centerLat, corridor.lng_max);
  }
}

const NON_CHICAGO_KEYWORDS = [
  'wauconda', 'naperville', 'evanston', 'schaumburg', 'oak park',
  'skokie', 'arlington heights', 'aurora', 'elgin', 'joliet',
  'plainfield', 'bolingbrook', 'orland park', 'tinley park',
  'downers grove', 'wheaton', 'glen ellyn', 'lombard', 'elmhurst',
  'des plaines', 'park ridge', 'niles', 'morton grove',
  'highland park', 'lake forest', 'winnetka', 'wilmette',
  'glenview', 'northbrook', 'libertyville', 'mundelein',
  'barrington', 'crystal lake', 'mchenry', 'woodstock',
  'st. charles', 'geneva', 'batavia', 'oak brook',
  'hinsdale', 'la grange', 'western springs', 'clarendon hills',
  'downtown wauconda', 'suburban', 'indiana', 'milwaukee, wi',
];

function articleIsAboutSuburbs(combined: string): boolean {
  return NON_CHICAGO_KEYWORDS.some(kw => combined.includes(kw));
}

// Terms that, if present, indicate an article is about the wrong stretch of a multi-neighborhood street.
// A corridorNameMatch is rejected if any exclusion term appears alongside it.
const CORRIDOR_EXCLUSION_TERMS: Record<string, string[]> = {
  // Chicago Ave is West Town here; reject articles about the downtown/River North/Gold Coast stretch
  chicago_avenue: ['river north', 'gold coast', 'streeterville', 'near north', 'magnificent mile', 'mag mile', 'old town', 'lincoln park', 'lakeview'],
  // Division St corridor is Wicker Park / Noble Square; reject Near North / Gold Coast mentions
  division_street: ['river north', 'gold coast', 'near north', 'old town', 'lincoln park'],
  // Halsted here is Wicker Park/Bucktown; reject Pilsen, Boys Town, West Loop pulls
  halsted_street: ['pilsen', 'chinatown', 'boys town', 'boystown', 'lakeview', 'wrigleyville'],
  // Clark St corridor is Andersonville/Lincoln Square; reject downtown, River North mentions
  clark_street: ['loop', 'river north', 'wicker park', 'gold coast'],
  // Milwaukee Ave is Logan Square / Wicker Park; reject far-north suburb-adjacent pulls
  milwaukee_avenue: ['northwest side', 'jefferson park', 'norwood park'],
  // Grand Ave corridor is West Town; reject downtown / River North where Grand also runs
  grand_avenue: ['river north', 'streeterville', 'near north', 'gold coast', 'grand rapids', 'grand jury', 'grand opening', 'grand prize', 'grand hotel'],
};

export function articleMentionsCorridor(article: NewsArticle, corridorKey: string): boolean {
  const corridor = CORRIDOR_KEYWORDS[corridorKey];
  if (!corridor) return false;
  const combined = `${article.title} ${article.summary}`.toLowerCase();

  if (articleIsAboutSuburbs(combined)) return false;

  const exclusions = CORRIDOR_EXCLUSION_TERMS[corridorKey] || [];
  const hasExcludedContext = exclusions.some(term => combined.includes(term));

  const corridorNameMatch = corridor.names.some(name => {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(combined);
  });
  if (corridorNameMatch && !hasExcludedContext) return true;

  const keyParts: Record<string, string[]> = {
    chicago_avenue: ['chicago ave', 'chicago avenue dining', 'chicago avenue corridor', 'chicago ave corridor'],
    milwaukee_avenue: ['milwaukee ave', 'milwaukee corridor', 'hipster highway'],
    division_street: ['division st', 'division street', 'puerto rico town'],
    damen_avenue: ['damen ave', 'damen corridor'],
    california_avenue: ['california ave', 'california corridor'],
    armitage_avenue: ['armitage ave', 'armitage corridor'],
    randolph_street: ['randolph st', 'restaurant row', 'fulton market'],
    halsted_street: ['halsted st', 'halsted corridor'],
    grand_avenue: ['w grand ave', 'grand avenue chicago', 'west grand ave'],
    '18th_street': ['18th st', 'pilsen corridor'],
    '53rd_street': ['53rd st', 'hyde park corridor'],
    '57th_street': ['57th st'],
    cottage_grove: ['cottage grove'],
    kedzie_avenue: ['kedzie ave', 'kedzie corridor', 'kedzie blvd', 'n kedzie'],
    diversey_avenue: ['diversey ave', 'diversey corridor', 'diversey pkwy', 'diversey parkway'],
    belmont_avenue: ['belmont ave', 'belmont corridor', 'belmont cragin'],
    irving_park_road: ['irving park rd', 'irving park road', 'old irving park'],
    lincoln_avenue: ['lincoln ave', 'lincoln corridor', 'lincoln square'],
    clark_street: ['clark st', 'clark street', 'andersonville'],
    broadway: ['n broadway', 'broadway corridor', 'broadway uptown'],
    lawrence_avenue: ['lawrence ave', 'lawrence corridor', 'albany park'],
    devon_avenue: ['devon ave', 'devon corridor', 'west ridge'],
    cermak_road: ['cermak rd', 'cermak road', 'chinatown'],
    roosevelt_road: ['roosevelt rd', 'roosevelt road', 'university village'],
    archer_avenue: ['archer ave', 'archer corridor', 'bridgeport'],
    pulaski_road: ['pulaski rd', 'pulaski road', 'pulaski corridor'],
    '63rd_street': ['63rd st', 'woodlawn corridor', 'englewood'],
    '79th_street': ['79th st', 'auburn gresham', 'chatham'],
    stony_island_avenue: ['stony island', 'stony island ave'],
    king_drive: ['king drive', 'mlk drive', 'bronzeville corridor'],
    '95th_street': ['95th st', 'roseland', 'beverly'],
    '47th_street': ['47th st', 'kenwood corridor', 'bronzeville'],
    '35th_street': ['35th st', 'bridgeport corridor', 'comiskey'],
    cicero_avenue: ['cicero ave', 'cicero corridor'],
  };
  const extras = keyParts[corridorKey];
  if (extras) return !hasExcludedContext && extras.some(term => combined.includes(term));
  return false;
}

// Neighborhood/sub-area terms used for direct neighborhood article matching (not street names)
const NEIGHBORHOOD_SUBAREAS: Record<string, string[]> = {
  'west town':      ['noble square', 'east village', 'smith park'],
  'wicker park':    ['wicker park'],
  'bucktown':       ['bucktown'],
  'logan square':   ['logan square', 'palmer square'],
  'humboldt park':  ['humboldt park', 'paseo boricua'],
  'pilsen':         ['pilsen', 'lower west side'],
  'little village': ['little village', 'south lawndale'],
  'west loop':      ['west loop', 'fulton market', 'greektown'],
  'near west side': ['near west side', 'greek town'],
  'lakeview':       ['lakeview', 'wrigleyville', 'boystown', 'southport corridor'],
  'lincoln park':   ['lincoln park', 'old town'],
  'uptown':         ['uptown', 'argyle'],
  'hyde park':      ['hyde park', 'kenwood'],
  'bronzeville':    ['bronzeville', 'douglas'],
  'avondale':       ['avondale'],
  'irving park':    ['irving park', 'old irving park'],
  'portage park':   ['portage park'],
  'albany park':    ['albany park'],
  'rogers park':    ['rogers park', 'morse avenue'],
  'edgewater':      ['edgewater', 'andersonville'],
  'andersonville':  ['andersonville', 'edgewater'],
  'ravenswood':     ['ravenswood'],
  'lincoln square': ['lincoln square'],
  'ukrainian village': ['ukrainian village', 'west town'],
  'river north':    ['river north'],
  'gold coast':     ['gold coast'],
  'streeterville':  ['streeterville'],
  'south loop':     ['south loop', 'printer\'s row'],
  'bridgeport':     ['bridgeport'],
  'back of the yards': ['back of the yards', 'back of yards'],
  'south shore':    ['south shore'],
  'woodlawn':       ['woodlawn'],
  'englewood':      ['englewood', 'west englewood'],
  'austin':         ['austin'],
  'north lawndale': ['north lawndale', 'lawndale'],
  'east garfield park': ['east garfield park', 'garfield park'],
  'west garfield park': ['west garfield park', 'garfield park'],
};

export function articleMentionsNeighborhood(
  article: NewsArticle,
  neighborhood: string,
  communityArea: string,
): boolean {
  const combined = `${article.title} ${article.summary}`.toLowerCase();
  if (articleIsAboutSuburbs(combined)) return false;

  const terms = new Set<string>();
  if (neighborhood) terms.add(neighborhood.toLowerCase());
  if (communityArea && communityArea.toLowerCase() !== neighborhood?.toLowerCase()) {
    terms.add(communityArea.toLowerCase());
  }
  // Add sub-area terms (specific place names, not generic streets)
  const subareas = NEIGHBORHOOD_SUBAREAS[neighborhood?.toLowerCase()] || NEIGHBORHOOD_SUBAREAS[communityArea?.toLowerCase()] || [];
  subareas.forEach(s => terms.add(s));

  return [...terms].some(term => term && combined.includes(term));
}

// Chicago community area adjacency map (bidirectional)
const COMMUNITY_AREA_ADJACENCY: Record<string, string[]> = {
  'avondale':             ['logan square', 'irving park', 'hermosa', 'humboldt park'],
  'logan square':         ['avondale', 'irving park', 'hermosa', 'humboldt park', 'wicker park', 'bucktown', 'west town'],
  'wicker park':          ['logan square', 'bucktown', 'west town', 'ukrainian village'],
  'bucktown':             ['logan square', 'wicker park', 'lincoln park', 'north center'],
  'west town':            ['wicker park', 'ukrainian village', 'near west side', 'east village'],
  'ukrainian village':    ['west town', 'wicker park'],
  'humboldt park':        ['avondale', 'logan square', 'hermosa', 'west garfield park', 'east garfield park'],
  'hermosa':              ['avondale', 'humboldt park', 'portage park', 'belmont cragin'],
  'irving park':          ['avondale', 'portage park', 'albany park', 'north center'],
  'north center':         ['lincoln square', 'lakeview', 'irving park', 'avondale', 'bucktown'],
  'lakeview':             ['lincoln park', 'north center', 'uptown', 'lincoln square'],
  'lincoln park':         ['lakeview', 'north center', 'bucktown', 'near north side'],
  'lincoln square':       ['ravenswood', 'north center', 'albany park', 'lakeview'],
  'ravenswood':           ['lincoln square', 'andersonville', 'north center'],
  'uptown':               ['lakeview', 'edgewater', 'lincoln square', 'andersonville'],
  'edgewater':            ['uptown', 'rogers park', 'andersonville'],
  'andersonville':        ['edgewater', 'uptown', 'ravenswood'],
  'rogers park':          ['edgewater'],
  'albany park':          ['irving park', 'lincoln square', 'north park', 'portage park'],
  'portage park':         ['irving park', 'hermosa', 'belmont cragin', 'albany park'],
  'belmont cragin':       ['portage park', 'hermosa', 'austin', 'montclare'],
  'austin':               ['west garfield park', 'humboldt park', 'belmont cragin'],
  'near west side':       ['west town', 'near south side', 'east garfield park', 'west loop'],
  'west loop':            ['near west side', 'near north side'],
  'river north':          ['near north side', 'west loop', 'streeterville'],
  'near north side':      ['lincoln park', 'gold coast', 'river north', 'streeterville'],
  'gold coast':           ['near north side', 'lincoln park'],
  'streeterville':        ['near north side', 'gold coast'],
  'south loop':           ['near south side', 'bridgeport'],
  'near south side':      ['south loop', 'near west side', 'bronzeville'],
  'north lawndale':       ['little village', 'east garfield park', 'west garfield park'],
  'east garfield park':   ['north lawndale', 'humboldt park', 'near west side', 'west garfield park'],
  'west garfield park':   ['east garfield park', 'humboldt park', 'austin', 'north lawndale'],
  'little village':       ['pilsen', 'north lawndale'],
  'pilsen':               ['little village', 'near west side', 'bridgeport', 'lower west side'],
  'bridgeport':           ['pilsen', 'back of the yards', 'bronzeville', 'south loop'],
  'back of the yards':    ['bridgeport', 'englewood', 'new city'],
  'bronzeville':          ['kenwood', 'douglas', 'bridgeport', 'near south side'],
  'douglas':              ['bronzeville', 'near south side', 'kenwood'],
  'kenwood':              ['hyde park', 'bronzeville', 'woodlawn', 'douglas'],
  'hyde park':            ['kenwood', 'woodlawn', 'south shore', 'bridgeport'],
  'woodlawn':             ['hyde park', 'kenwood', 'south shore', 'englewood'],
  'south shore':          ['hyde park', 'woodlawn', 'greater grand crossing', 'chatham'],
  'englewood':            ['woodlawn', 'back of the yards', 'west englewood', 'greater grand crossing'],
  'chatham':              ['south shore', 'greater grand crossing', 'auburn gresham'],
  'roseland':             ['auburn gresham', 'pullman', 'chatham'],
  'auburn gresham':       ['chatham', 'roseland', 'englewood'],
};

export function getBorderingAreas(neighborhood: string, communityArea: string): string[] {
  const key = (neighborhood || communityArea || '').toLowerCase().trim();
  const direct = COMMUNITY_AREA_ADJACENCY[key] || [];
  // Also try community area separately
  const caKey = (communityArea || '').toLowerCase().trim();
  const fromCA = caKey && caKey !== key ? (COMMUNITY_AREA_ADJACENCY[caKey] || []) : [];
  return [...new Set([...direct, ...fromCA])];
}

/**
 * Returns true if the article explicitly names a Chicago neighborhood/community area
 * that is NOT in the allowedAreas set. Used to filter out geographically irrelevant articles.
 */
export function articleMentionsExplicitNonLocalNeighborhood(
  article: NewsArticle,
  allowedAreas: Set<string>,
): boolean {
  const combined = `${article.title} ${article.summary}`.toLowerCase();

  // If the article mentions any local area, keep it regardless
  const mentionsLocal = [...allowedAreas].some(area => area && combined.includes(area));
  if (mentionsLocal) return false;

  // Check if article explicitly names a known non-local Chicago neighborhood
  for (const [neighborhoodKey, terms] of Object.entries(NEIGHBORHOOD_SUBAREAS)) {
    if (allowedAreas.has(neighborhoodKey)) continue;
    if (terms.some(term => combined.includes(term.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

const CORRIDOR_PROXIMITY_MILES = 0.5;

function addressMatchesCorridor(address: string, corridorInfo: typeof CORRIDOR_KEYWORDS[string]): boolean {
  if (!address) return false;
  const streetPart = address.split(',')[0]?.toLowerCase().trim() || '';
  if (!streetPart) return false;
  
  const streetVariants = corridorInfo.names.map(n => n.toLowerCase());
  
  for (const variant of streetVariants) {
    const variantWords = variant.replace(/\./g, '').split(/\s+/);
    const streetWords = streetPart.replace(/\./g, '').split(/\s+/);
    
    const streetSuffix = variantWords[variantWords.length - 1];
    const streetName = variantWords.filter(w => 
      !['n', 's', 'e', 'w', 'north', 'south', 'east', 'west'].includes(w) && w !== streetSuffix
    ).join(' ');
    
    if (!streetName) continue;
    
    const streetPartNorm = streetPart.replace(/\./g, '');
    
    const suffixAbbrevs: Record<string, string[]> = {
      'avenue': ['ave', 'av'],
      'street': ['st'],
      'road': ['rd'],
      'drive': ['dr'],
      'boulevard': ['blvd'],
      'parkway': ['pkwy', 'pky'],
      'place': ['pl'],
    };
    const allSuffixes = [streetSuffix];
    for (const [full, abbrs] of Object.entries(suffixAbbrevs)) {
      if (streetSuffix === full) allSuffixes.push(...abbrs);
      if (abbrs.includes(streetSuffix)) allSuffixes.push(full);
    }
    
    for (const suf of allSuffixes) {
      if (streetPartNorm.includes(streetName) && streetPartNorm.includes(suf)) {
        return true;
      }
    }
  }
  return false;
}

export function findNearbyCorridors(
  lat: number,
  lng: number,
  address?: string
): { corridorKey: string; corridorName: string; tier: number; description: string; distanceMiles: number }[] {
  const nearby: { corridorKey: string; corridorName: string; tier: number; description: string; distanceMiles: number }[] = [];
  for (const [key, info] of Object.entries(CORRIDOR_KEYWORDS)) {
    const geoDist = distanceToCorridorMiles(lat, lng, key);
    const onCorridor = address ? addressMatchesCorridor(address, info) : false;
    const dist = onCorridor ? 0 : geoDist;
    if (dist <= CORRIDOR_PROXIMITY_MILES) {
      const displayName = info.names[0].replace(/\b\w/g, c => c.toUpperCase());
      nearby.push({
        corridorKey: key,
        corridorName: displayName,
        tier: info.tier,
        description: info.description,
        distanceMiles: Math.round(dist * 100) / 100,
      });
    }
  }
  nearby.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return nearby;
}

export async function findCorridorArticles(
  corridorKeys: string[],
  days = 90
): Promise<NewsArticle[]> {
  return (await findCorridorArticlesWithCoverage(corridorKeys, days)).articles;
}

export async function findCorridorArticlesWithCoverage(
  corridorKeys: string[],
  days = 90,
): Promise<{ articles: NewsArticle[]; coverage: { status: NewsFeedState; successfulFeeds: number; totalFeeds: number } }> {
  if (corridorKeys.length === 0) {
    return { articles: [], coverage: { status: "unavailable", successfulFeeds: 0, totalFeeds: 0 } };
  }

  const CORRIDOR_FEED_MAP: Record<string, string[]> = {
    chicago_avenue: ['block_club_west_town'],
    grand_avenue: ['block_club_west_town'],
    milwaukee_avenue: ['block_club_west_town', 'block_club_logan_square'],
    division_street: ['block_club_west_town'],
    damen_avenue: ['block_club_west_town'],
    armitage_avenue: ['block_club_humboldt', 'block_club_logan_square', 'block_club_lincoln_park'],
    halsted_street: ['block_club_lincoln_park', 'block_club_lakeview'],
    california_avenue: ['block_club_humboldt', 'block_club_logan_square'],
    randolph_street: ['block_club_near_west'],
    '18th_street': ['block_club_pilsen'],
    '53rd_street': [],
    '57th_street': [],
    cottage_grove: [],
    north_avenue: ['block_club_west_town', 'block_club_humboldt'],
    fullerton_avenue: ['block_club_lincoln_park', 'block_club_logan_square'],
    ashland_avenue: ['block_club_west_town', 'block_club_lakeview'],
    western_avenue: ['block_club_humboldt', 'block_club_logan_square', 'block_club_west_town'],
    lake_street: ['block_club_near_west'],
    fulton_street: ['block_club_near_west'],
    madison_street: ['block_club_near_west'],
    washington_street: ['block_club_near_west'],
    kedzie_avenue: ['block_club_logan_square', 'block_club_humboldt'],
    diversey_avenue: ['block_club_logan_square', 'block_club_lakeview'],
    belmont_avenue: ['block_club_avondale', 'block_club_lakeview'],
    irving_park_road: ['block_club_avondale'],
    lincoln_avenue: ['block_club_lincoln_park', 'block_club_lincoln_square', 'block_club_lakeview'],
    clark_street: ['block_club_lakeview', 'block_club_rogers_park', 'block_club_lincoln_park'],
    broadway: ['block_club_uptown', 'block_club_rogers_park', 'block_club_lakeview'],
    lawrence_avenue: ['block_club_lincoln_square', 'block_club_uptown'],
    devon_avenue: ['block_club_rogers_park'],
    cermak_road: ['block_club_pilsen', 'block_club_bridgeport'],
    roosevelt_road: ['block_club_near_west', 'block_club_pilsen'],
    archer_avenue: ['block_club_bridgeport'],
    pulaski_road: ['block_club_humboldt', 'block_club_austin', 'block_club_avondale'],
    '63rd_street': ['block_club_hyde_park', 'block_club_south_shore'],
    '79th_street': ['block_club_south_shore'],
    stony_island_avenue: ['block_club_hyde_park', 'block_club_south_shore'],
    king_drive: ['block_club_bronzeville'],
    '95th_street': ['block_club_south_shore'],
    '47th_street': ['block_club_bronzeville', 'block_club_back_of_yards'],
    '35th_street': ['block_club_bridgeport', 'block_club_bronzeville'],
    cicero_avenue: ['block_club_austin'],
  };

  const neighborhoodFeedSet = new Set<string>();
  for (const key of corridorKeys) {
    const feeds = CORRIDOR_FEED_MAP[key] || [];
    feeds.forEach(f => neighborhoodFeedSet.add(f));
  }

  const feedNames = [
    'eater_chicago',
    'what_now_chicago',
    'chicago_yimby',
    'real_deal_chicago',
    'block_club_citywide',
    ...Array.from(neighborhoodFeedSet),
  ];

  const feedPromises: Promise<NewsArticle[]>[] = [];
  const feedStates: NewsFeedState[] = [];
  const addFeed = (name: string, url: string) => {
    const index = feedPromises.length;
    feedStates[index] = "unavailable";
    feedPromises.push(fetchFeed(name, url, state => { feedStates[index] = state; }));
  };
  for (const name of feedNames.filter(feedName => RSS_FEEDS[feedName])) {
    addFeed(name, RSS_FEEDS[name]);
  }

  const crainsPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildCrainsSingleCorridorFeedUrl(key);
    if (!url) continue;
    const cacheKey = `crains_corridor_${key}`;
    crainsPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(cacheKey, url);
  }

  const yimbyPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildYimbyCorridorSearchUrl(key);
    if (!url) continue;
    yimbyPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`yimby_corridor_${key}`, url);
  }

  const blockClubPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildBlockClubCorridorSearchUrl(key);
    if (!url) continue;
    blockClubPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`blockclub_corridor_${key}`, url);
  }

  const realDealPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildRealDealCorridorSearchUrl(key);
    if (!url) continue;
    realDealPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`real_deal_corridor_${key}`, url);
  }

  const dezeenPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildDezeenCorridorSearchUrl(key);
    if (!url) continue;
    dezeenPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`dezeen_corridor_${key}`, url);
  }

  const dwellPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildDwellCorridorSearchUrl(key);
    if (!url) continue;
    dwellPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`dwell_corridor_${key}`, url);
  }

  const archDailyPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildArchDailyCorridorSearchUrl(key);
    if (!url) continue;
    archDailyPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`archdaily_corridor_${key}`, url);
  }

  const infatuationPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildInfatuationCorridorSearchUrl(key);
    if (!url) continue;
    infatuationPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`infatuation_corridor_${key}`, url);
  }

  const timeoutPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildTimeoutCorridorSearchUrl(key);
    if (!url) continue;
    timeoutPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`timeout_corridor_${key}`, url);
  }

  const chicagoReaderPerCorridor: { key: string; promiseIndex: number }[] = [];
  for (const key of corridorKeys) {
    const url = buildChicagoReaderCorridorSearchUrl(key);
    if (!url) continue;
    chicagoReaderPerCorridor.push({ key, promiseIndex: feedPromises.length });
    addFeed(`chicagoreader_corridor_${key}`, url);
  }

  const results = await Promise.allSettled(feedPromises);
  const regularFeedCount = feedNames.filter(name => RSS_FEEDS[name]).length;
  const regularArticles: NewsArticle[] = [];
  for (let i = 0; i < regularFeedCount; i++) {
    if (results[i].status === 'fulfilled') regularArticles.push(...(results[i] as PromiseFulfilledResult<NewsArticle[]>).value);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Google News searches index older content — allow up to 180 days for supplemental sources
  const extendedCutoff = new Date();
  extendedCutoff.setDate(extendedCutoff.getDate() - 180);

  const seenUrls = new Set<string>();
  const filtered: NewsArticle[] = [];

  for (const { key, promiseIndex } of crainsPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      const mentionsThisCorridor = articleMentionsCorridor(article, key);
      const mentionsAnyNearbyCorridor = !mentionsThisCorridor && corridorKeys.some(k => articleMentionsCorridor(article, k));
      if (!mentionsThisCorridor && !mentionsAnyNearbyCorridor) continue;
      seenUrls.add(article.url);
      filtered.push(article);
    }
  }

  for (const { key, promiseIndex } of yimbyPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      const mentionsThisCorridor = articleMentionsCorridor(article, key);
      const mentionsAnyNearbyCorridor = !mentionsThisCorridor && corridorKeys.some(k => articleMentionsCorridor(article, k));
      if (!mentionsThisCorridor && !mentionsAnyNearbyCorridor) continue;
      seenUrls.add(article.url);
      filtered.push(article);
    }
  }

  for (const { key, promiseIndex } of blockClubPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      const mentionsThisCorridor = articleMentionsCorridor(article, key);
      const mentionsAnyNearbyCorridor = !mentionsThisCorridor && corridorKeys.some(k => articleMentionsCorridor(article, k));
      if (!mentionsThisCorridor && !mentionsAnyNearbyCorridor) continue;
      seenUrls.add(article.url);
      filtered.push(article);
    }
  }

  for (const { key, promiseIndex } of realDealPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      const mentionsThisCorridor = articleMentionsCorridor(article, key);
      const mentionsAnyNearbyCorridor = !mentionsThisCorridor && corridorKeys.some(k => articleMentionsCorridor(article, k));
      if (!mentionsThisCorridor && !mentionsAnyNearbyCorridor) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'The Real Deal Chicago' });
    }
  }

  for (const { key, promiseIndex } of dezeenPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      // Google News query already scoped to site:dezeen.com + chicago + corridor name.
      // Trust the search result rather than re-checking the excerpt for those terms.
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Dezeen' });
    }
  }

  for (const { key, promiseIndex } of dwellPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      // Google News query already scoped to site:dwell.com + chicago + corridor name.
      // Trust the search result rather than re-checking the excerpt for those terms.
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Dwell' });
    }
  }

  for (const { key, promiseIndex } of archDailyPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'ArchDaily' });
    }
  }

  for (const { key, promiseIndex } of infatuationPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'The Infatuation' });
    }
  }

  for (const { key, promiseIndex } of timeoutPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Timeout Chicago' });
    }
  }

  for (const { key, promiseIndex } of chicagoReaderPerCorridor) {
    const result = results[promiseIndex];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Chicago Reader' });
    }
  }

  for (const article of regularArticles) {
    if (!article.url || seenUrls.has(article.url)) continue;
    const pubDate = new Date(article.published);
    if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
    const matchesAnyCorridor = corridorKeys.some(key => articleMentionsCorridor(article, key));
    if (!matchesAnyCorridor) continue;
    seenUrls.add(article.url);
    const isRealDeal = article.url.includes('therealdeal.com');
    filtered.push(isRealDeal ? { ...article, source: 'The Real Deal Chicago' } : article);
  }

  filtered.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  const successfulFeeds = feedStates.filter(state => state === "available").length;
  const status = deriveNewsFeedCoverageStatus(feedStates);
  return {
    articles: filtered.slice(0, 12),
    coverage: { status, successfulFeeds, totalFeeds: feedStates.length },
  };
}

const SIGNAL_KEYWORDS = [
  'opening', 'opens', 'open soon', 'coming soon', 'new restaurant',
  'new bar', 'new shop', 'new store', 'new cafe', 'new coffee',
  'debut', 'launching', 'launch', 'grand opening', 'development',
  'construction', 'renovation', 'redevelopment', 'mixed-use',
  'apartment', 'retail', 'lease', 'signed', 'chef', 'restaurateur',
  'bartender', 'baker', 'concept', 'building permit',
  'restaurant', 'dining', 'best', 'food hall', 'brewery', 'distillery',
  'sells', 'sale', 'sold', 'buys', 'purchased', 'acquisition',
  'investment', 'multifamily', 'commercial real estate', 'cre',
  'zoning', 'rezoning', 'permit', 'groundbreaking', 'project',
  'developer', 'landlord', 'tenant', 'vacancy', 'office', 'industrial',
  'affordable housing', 'tif', 'opportunity zone', 'nmtc',
];

interface NewsArticle {
  title: string;
  url: string;
  summary: string;
  published: string;
  source: string;
}

export type NewsFeedState = "available" | "partial" | "unavailable";

export function deriveNewsFeedCoverageStatus(states: NewsFeedState[]): NewsFeedState {
  if (states.length > 0 && states.every(state => state === "available")) return "available";
  if (states.some(state => state === "available" || state === "partial")) return "partial";
  return "unavailable";
}

interface CacheEntry {
  articles: NewsArticle[];
  timestamp: number;
}

const feedCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 3600 * 1000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchFeed(
  feedName: string,
  url: string,
  reportState?: (state: NewsFeedState) => void,
): Promise<NewsArticle[]> {
  const cached = feedCache.get(feedName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    reportState?.('available');
    return cached.articles;
  }

  try {
    const feed = await parser.parseURL(url);
    const isGoogleNews = url.includes('news.google.com');
    const articles: NewsArticle[] = (feed.items || []).map(item => {
      let title = item.title || '';
      let source = feed.title || feedName;
      if (isGoogleNews) {
        const dashIdx = title.lastIndexOf(' - ');
        if (dashIdx > 0) {
          source = title.substring(dashIdx + 3).trim();
          title = title.substring(0, dashIdx).trim();
        }
      }
      return {
        title,
        url: item.link || '',
        summary: stripHtml(item.contentSnippet || item.content || item.summary || '').substring(0, 400),
        published: item.isoDate || item.pubDate || '',
        source,
      };
    });

    feedCache.set(feedName, { articles, timestamp: Date.now() });
    reportState?.('available');
    return articles;
  } catch (err) {
    console.error(`[NEWS] Error fetching feed ${feedName}:`, (err as Error).message);
    reportState?.(cached ? 'partial' : 'unavailable');
    return cached?.articles || [];
  }
}

export async function findRelevantArticles(neighborhood: string, days = 90, limit = 12): Promise<NewsArticle[]> {
  const neighborhoodLower = neighborhood.toLowerCase().trim();

  const feedNames = new Set<string>(NEIGHBORHOOD_FEED_MAP[neighborhoodLower] || []);
  feedNames.add('block_club_citywide');
  feedNames.add('eater_chicago');
  feedNames.add('what_now_chicago');
  feedNames.add('chicago_yimby');
  feedNames.add('real_deal_chicago');

  const feedPromises: Promise<NewsArticle[]>[] = Array.from(feedNames)
    .filter(name => RSS_FEEDS[name])
    .map(name => fetchFeed(name, RSS_FEEDS[name]));

  const crainsNeighborhoodUrl = buildCrainsNeighborhoodFeedUrl(neighborhoodLower);
  const crainsCacheKey = `crains_neighborhood_${neighborhoodLower}`;
  feedPromises.push(fetchFeed(crainsCacheKey, crainsNeighborhoodUrl));
  const crainsIndex = feedPromises.length - 1;

  const yimbyNeighborhoodUrl = buildYimbyNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`yimby_neighborhood_${neighborhoodLower}`, yimbyNeighborhoodUrl));
  const yimbyIndex = feedPromises.length - 1;

  const realDealNeighborhoodUrl = buildRealDealNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`real_deal_neighborhood_${neighborhoodLower}`, realDealNeighborhoodUrl));
  const realDealIndex = feedPromises.length - 1;

  const dezeenNeighborhoodUrl = buildDezeenNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`dezeen_neighborhood_${neighborhoodLower}`, dezeenNeighborhoodUrl));
  const dezeenIndex = feedPromises.length - 1;

  const dwellNeighborhoodUrl = buildDwellNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`dwell_neighborhood_${neighborhoodLower}`, dwellNeighborhoodUrl));
  const dwellIndex = feedPromises.length - 1;

  const archDailyNeighborhoodUrl = buildArchDailyNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`archdaily_neighborhood_${neighborhoodLower}`, archDailyNeighborhoodUrl));
  const archDailyIndex = feedPromises.length - 1;

  const infatuationNeighborhoodUrl = buildInfatuationNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`infatuation_neighborhood_${neighborhoodLower}`, infatuationNeighborhoodUrl));
  const infatuationIndex = feedPromises.length - 1;

  const timeoutNeighborhoodUrl = buildTimeoutNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`timeout_neighborhood_${neighborhoodLower}`, timeoutNeighborhoodUrl));
  const timeoutIndex = feedPromises.length - 1;

  const chicagoReaderNeighborhoodUrl = buildChicagoReaderNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`chicagoreader_neighborhood_${neighborhoodLower}`, chicagoReaderNeighborhoodUrl));
  const chicagoReaderIndex = feedPromises.length - 1;

  const urbanizeNeighborhoodUrl = buildUrbanizeNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`urbanize_neighborhood_${neighborhoodLower}`, urbanizeNeighborhoodUrl));
  const urbanizeIndex = feedPromises.length - 1;

  const bisnowNeighborhoodUrl = buildBisnowNeighborhoodSearchUrl(neighborhoodLower);
  feedPromises.push(fetchFeed(`bisnow_neighborhood_${neighborhoodLower}`, bisnowNeighborhoodUrl));
  const bisnowIndex = feedPromises.length - 1;

  const results = await Promise.allSettled(feedPromises);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const extendedCutoff = new Date();
  extendedCutoff.setDate(extendedCutoff.getDate() - 180);

  const seenUrls = new Set<string>();
  const filtered: NewsArticle[] = [];

  const aliases = NEIGHBORHOOD_ALIASES[neighborhoodLower] || [neighborhoodLower];

  const crainsResult = results[crainsIndex];
  if (crainsResult.status === 'fulfilled') {
    for (const article of crainsResult.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const matchesNeighborhood = aliases.some(alias => text.includes(alias));
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push(article);
    }
  }

  const yimbyResult = results[yimbyIndex];
  if (yimbyResult.status === 'fulfilled') {
    for (const article of (yimbyResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
      const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
      const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
        urlText.includes(neighborhoodLower) ||
        article.url.toLowerCase().includes(neighborhoodHyphenated);
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push(article);
    }
  }

  const realDealResult = results[realDealIndex];
  if (realDealResult.status === 'fulfilled') {
    for (const article of (realDealResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
      const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
      const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
        urlText.includes(neighborhoodLower) ||
        article.url.toLowerCase().includes(neighborhoodHyphenated);
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'The Real Deal Chicago' });
    }
  }

  const dezeenResult = results[dezeenIndex];
  if (dezeenResult.status === 'fulfilled') {
    for (const article of (dezeenResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      // Google News query already scoped to site:dezeen.com + chicago + neighborhood terms.
      // Trust the search result — don't require the excerpt to repeat the neighborhood name.
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Dezeen' });
    }
  }

  const dwellResult = results[dwellIndex];
  if (dwellResult.status === 'fulfilled') {
    for (const article of (dwellResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      // Google News query already scoped to site:dwell.com + chicago + neighborhood terms.
      // Trust the search result — don't require the excerpt to repeat the neighborhood name.
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Dwell' });
    }
  }

  const archDailyResult = results[archDailyIndex];
  if (archDailyResult.status === 'fulfilled') {
    for (const article of (archDailyResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
      const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
      const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
        urlText.includes(neighborhoodLower) ||
        article.url.toLowerCase().includes(neighborhoodHyphenated);
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'ArchDaily' });
    }
  }

  const infatuationResult = results[infatuationIndex];
  if (infatuationResult.status === 'fulfilled') {
    for (const article of (infatuationResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
      const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
      const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
        urlText.includes(neighborhoodLower) ||
        article.url.toLowerCase().includes(neighborhoodHyphenated);
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'The Infatuation' });
    }
  }

  const timeoutResult = results[timeoutIndex];
  if (timeoutResult.status === 'fulfilled') {
    for (const article of (timeoutResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
      const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
      const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
        urlText.includes(neighborhoodLower) ||
        article.url.toLowerCase().includes(neighborhoodHyphenated);
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Timeout Chicago' });
    }
  }

  const chicagoReaderResult = results[chicagoReaderIndex];
  if (chicagoReaderResult.status === 'fulfilled') {
    for (const article of (chicagoReaderResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
      const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
      const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
        urlText.includes(neighborhoodLower) ||
        article.url.toLowerCase().includes(neighborhoodHyphenated);
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Chicago Reader' });
    }
  }

  const urbanizeResult = results[urbanizeIndex];
  if (urbanizeResult.status === 'fulfilled') {
    for (const article of (urbanizeResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < extendedCutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
      const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
      const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
        urlText.includes(neighborhoodLower) ||
        article.url.toLowerCase().includes(neighborhoodHyphenated);
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Urbanize Chicago' });
    }
  }

  const bisnowResult = results[bisnowIndex];
  if (bisnowResult.status === 'fulfilled') {
    for (const article of (bisnowResult as PromiseFulfilledResult<NewsArticle[]>).value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      const text = `${article.title} ${article.summary}`.toLowerCase();
      const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
      const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
      const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
        urlText.includes(neighborhoodLower) ||
        article.url.toLowerCase().includes(neighborhoodHyphenated);
      if (!matchesNeighborhood) continue;
      seenUrls.add(article.url);
      filtered.push({ ...article, source: 'Bisnow Chicago' });
    }
  }

  const regularArticles: NewsArticle[] = [];
  for (let i = 0; i < results.length; i++) {
    if (i === crainsIndex || i === yimbyIndex || i === realDealIndex || i === dezeenIndex || i === dwellIndex || i === archDailyIndex || i === infatuationIndex || i === timeoutIndex || i === chicagoReaderIndex || i === urbanizeIndex || i === bisnowIndex) continue;
    if (results[i].status === 'fulfilled') regularArticles.push(...(results[i] as PromiseFulfilledResult<NewsArticle[]>).value);
  }

  for (const article of regularArticles) {
    if (!article.url || seenUrls.has(article.url)) continue;

    const pubDate = new Date(article.published);
    if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;

    const text = `${article.title} ${article.summary}`.toLowerCase();
    const urlText = article.url.toLowerCase().replace(/[-_]/g, ' ');
    const neighborhoodHyphenated = neighborhoodLower.replace(/\s+/g, '-');
    const matchesNeighborhood = aliases.some(alias => text.includes(alias)) ||
      urlText.includes(neighborhoodLower) ||
      article.url.toLowerCase().includes(neighborhoodHyphenated);
    if (!matchesNeighborhood) continue;

    const isRealDeal = article.url.includes('therealdeal.com');
    const hasSignal = isRealDeal || SIGNAL_KEYWORDS.some(kw => text.includes(kw));
    if (!hasSignal) continue;

    seenUrls.add(article.url);
    filtered.push(isRealDeal ? { ...article, source: 'The Real Deal Chicago' } : article);
  }

  filtered.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  return filtered.slice(0, limit);
}

export function calculateMomentumScore(articles: NewsArticle[]): number {
  return Math.min(100, 20 + articles.length * 15);
}

// ---------- Address-specific article search ----------

/**
 * Parse a street address into its searchable components.
 * Input:  "2232 W Homer St, Chicago, IL 60647"
 * Output: { abbrev: "2232 W Homer", full: "2232 West Homer" }
 */
function parseAddressForSearch(address: string): { abbrev: string; full: string } | null {
  const directionMap: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' };
  const suffixes = new Set(['AVE', 'ST', 'BLVD', 'DR', 'RD', 'CT', 'PL', 'WAY', 'LN', 'TER', 'PKWY', 'CIR', 'HWY', 'EXPY', 'FWY']);

  // Strip city/state/zip — everything after the first comma
  const streetPart = address.toUpperCase().split(',')[0].replace(/[.]/g, '').trim();
  const parts = streetPart.split(/\s+/);
  if (parts.length < 2) return null;

  const streetNum = parts[0];
  if (!/^\d+/.test(streetNum)) return null;

  let dirLetter = '';
  let nameStart = 1;
  if (parts[1] && directionMap[parts[1]]) {
    dirLetter = parts[1];
    nameStart = 2;
  }

  // Collect street name words up to (but not including) a suffix
  const nameWords: string[] = [];
  for (let i = nameStart; i < parts.length; i++) {
    if (suffixes.has(parts[i]) && nameWords.length > 0) break;
    nameWords.push(parts[i].charAt(0) + parts[i].slice(1).toLowerCase());
  }
  if (nameWords.length === 0) return null;

  const streetName = nameWords.join(' ');
  const abbrev = [streetNum, dirLetter, streetName].filter(Boolean).join(' ');
  const fullDir = dirLetter ? directionMap[dirLetter] : '';
  const full = fullDir ? `${streetNum} ${fullDir} ${streetName}` : '';

  return { abbrev, full };
}

/**
 * Search Google News RSS for articles that explicitly mention the property address.
 * Covers: Block Club, Crain's, The Real Deal, Chicago YIMBY, Tribune, Sun-Times,
 * Courthouse News, and a broad all-sources search — all via Google News RSS (no API key needed).
 */
export async function findAddressArticles(address: string, days = 1095): Promise<NewsArticle[]> {
  const parsed = parseAddressForSearch(address);
  if (!parsed) return [];

  const { abbrev, full } = parsed;
  const buildUrl = (query: string) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  // Broad queries (abbrev + full direction) + site-specific for each key publication.
  // Each publication gets both the abbreviated and full-direction form so we catch
  // "801 W Madison" and "801 West Madison" style variants.
  const sites = [
    ['blockclub', 'blockclubchicago.org'],
    ['crain',     'chicagobusiness.com'],
    ['realdeal',  'therealdeal.com'],
    ['yimby',     'chicagoyimby.com'],
    ['trib',      'chicagotribune.com'],
    ['suntimes',  'suntimes.com'],
    ['courthousenews', 'courthousenews.com'],
    ['bisnow',    'bisnow.com'],
  ];

  const queries: Array<[string, string, boolean]> = [
    // [cacheKey, query, isSiteSpecific]
    [`addr_broad_${abbrev}`, `"${abbrev}" Chicago`, false],
    ...(full ? [[`addr_full_${full}`, `"${full}" Chicago`, false] as [string, string, boolean]] : []),
    ...sites.flatMap(([slug, domain]) => [
      [`addr_${slug}_abbrev_${abbrev}`, `"${abbrev}" site:${domain}`, true],
      ...(full ? [[`addr_${slug}_full_${full}`, `"${full}" site:${domain}`, true] as [string, string, boolean]] : []),
    ]),
  ];

  const results = await Promise.allSettled(
    queries.map(([key, q]) => fetchFeed(key, buildUrl(q)))
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Normalize text for matching: strip periods after direction letters so
  // "801 W. Madison" and "801 W Madison" both match "801 w madison".
  const normalizeText = (s: string) =>
    s.toLowerCase().replace(/\b([nsewNSEW])\./g, '$1').replace(/\s+/g, ' ');

  const abbrevNorm = normalizeText(abbrev);
  const fullNorm   = full ? normalizeText(full) : '';
  const seenUrls   = new Set<string>();
  const filtered: NewsArticle[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const isSiteSpecific = queries[i][2];
    if (result.status !== 'fulfilled') continue;
    for (const article of result.value) {
      if (!article.url || seenUrls.has(article.url)) continue;
      const pubDate = new Date(article.published);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;

      if (!isSiteSpecific) {
        // For broad searches, require the address to appear in title/summary
        // (Google RSS snippets can be noisy for non-site-specific queries)
        const text = normalizeText(`${article.title} ${article.summary}`);
        if (!text.includes(abbrevNorm) && !(fullNorm && text.includes(fullNorm))) continue;
      }
      // For site-specific queries, trust Google's exact-phrase match —
      // the RSS snippet is often truncated and may not repeat the address.

      seenUrls.add(article.url);
      filtered.push(article);
    }
  }

  filtered.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  return filtered.slice(0, 20);
}

// -------- Podcast Aggregation --------

const PODCAST_FEEDS_LIST: Array<{ name: string; url: string; category: 'entertainment_culture' | 'business_development' }> = [
  { name: "Crain's Chicago Daily Gist", url: 'https://feeds.megaphone.fm/crainschicagobusiness', category: 'business_development' },
  { name: 'Reset (WBEZ)', url: 'https://feeds.feedburner.com/WBEZReset', category: 'entertainment_culture' },
  { name: "Eater's The Digest", url: 'https://www.eater.com/rss/the-eater-podcast.xml', category: 'entertainment_culture' },
  { name: 'Good Beer Hunting', url: 'https://www.goodbeerhunting.com/blog?format=rss', category: 'entertainment_culture' },
  { name: 'BiggerPockets Real Estate Podcast', url: 'https://feeds.simplecast.com/XA_851k3', category: 'business_development' },
];

export async function findRelevantPodcasts(neighborhood: string, days = 90): Promise<NewsArticle[]> {
  const neighborhoodLower = neighborhood.toLowerCase().trim();
  const aliases = NEIGHBORHOOD_ALIASES[neighborhoodLower] || [neighborhoodLower];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const results = await Promise.allSettled(
    PODCAST_FEEDS_LIST.map(f => fetchFeed(`podcast_${f.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`, f.url))
  );

  const filtered: NewsArticle[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const { name } = PODCAST_FEEDS_LIST[i];
    for (const ep of r.value) {
      if (!ep.url || seenUrls.has(ep.url)) continue;
      const pubDate = new Date(ep.published);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      const text = `${ep.title} ${ep.summary}`.toLowerCase();
      if (!aliases.some(a => text.includes(a.toLowerCase()))) continue;
      seenUrls.add(ep.url);
      filtered.push({ ...ep, source: name });
    }
  }

  filtered.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  return filtered.slice(0, 8);
}

export async function findCorridorPodcasts(corridorKeys: string[], days = 90): Promise<NewsArticle[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const results = await Promise.allSettled(
    PODCAST_FEEDS_LIST.map(f => fetchFeed(`podcast_${f.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`, f.url))
  );

  const filtered: NewsArticle[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled') continue;
    const { name } = PODCAST_FEEDS_LIST[i];
    for (const ep of r.value) {
      if (!ep.url || seenUrls.has(ep.url)) continue;
      const pubDate = new Date(ep.published);
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue;
      const text = `${ep.title} ${ep.summary}`.toLowerCase();
      const mentionsCorridor = corridorKeys.some(key => {
        const corridor = CORRIDOR_KEYWORDS[key];
        if (!corridor) return false;
        return corridor.names.some((n: string) => text.includes(n.toLowerCase()));
      });
      if (!mentionsCorridor) continue;
      seenUrls.add(ep.url);
      filtered.push({ ...ep, source: name });
    }
  }

  filtered.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  return filtered.slice(0, 8);
}

export function summarizeNewsForAi(articles: NewsArticle[], neighborhood: string): string {
  if (articles.length === 0) return 'No recent news coverage found.';

  const lines = [`RECENT NEWS (${neighborhood}, last 90 days):`];
  for (const a of articles.slice(0, 5)) {
    lines.push(`- [${a.source}] ${a.title}`);
    if (a.summary) lines.push(`  → ${a.summary.substring(0, 200)}`);
    if (a.url) lines.push(`  URL: ${a.url}`);
  }
  return lines.join('\n');
}
