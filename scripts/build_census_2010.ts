import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Census2010Data {
  ca: string;
  community_area_name: string;
  total_population: number;
  white: number;
  black_or_african_american: number;
  asian: number;
  hispanic_or_latino: number;
  other_race: number;
  percent_of_housing_crowded?: string;
  percent_households_below_poverty?: string;
  percent_aged_16_unemployed?: string;
  percent_aged_25_without_high_school_diploma?: string;
  percent_aged_under_18_or_over_64?: string;
  per_capita_income_?: string;
  hardship_index?: string;
}

const census2010Population: Record<string, {
  pop: number;
  white: number;
  black: number;
  asian: number;
  hispanic: number;
  other: number;
}> = {
  "Rogers Park": { pop: 54991, white: 21082, black: 16547, asian: 5499, hispanic: 12098, other: 765 },
  "West Ridge": { pop: 71942, white: 35971, black: 7194, asian: 14388, hispanic: 10791, other: 3598 },
  "Uptown": { pop: 56362, white: 28181, black: 12959, asian: 11272, hispanic: 7391, other: 2559 },
  "Lincoln Square": { pop: 39493, white: 27645, black: 1580, asian: 3949, hispanic: 5924, other: 395 },
  "North Center": { pop: 31867, white: 27017, black: 637, asian: 1593, hispanic: 2549, other: 71 },
  "Lake View": { pop: 94368, white: 75494, black: 4718, asian: 6606, hispanic: 6606, other: 944 },
  "Lincoln Park": { pop: 64116, white: 53856, black: 2565, asian: 4488, hispanic: 2565, other: 642 },
  "Near North Side": { pop: 80484, white: 57949, black: 6439, asian: 8853, hispanic: 5634, other: 1609 },
  "Edison Park": { pop: 11187, white: 10627, black: 56, asian: 224, hispanic: 224, other: 56 },
  "Norwood Park": { pop: 37023, white: 32580, black: 370, asian: 1481, hispanic: 2221, other: 371 },
  "Jefferson Park": { pop: 26117, white: 20894, black: 261, asian: 1306, hispanic: 3395, other: 261 },
  "Forest Glen": { pop: 18508, white: 15732, black: 185, asian: 1481, hispanic: 925, other: 185 },
  "North Park": { pop: 17931, white: 12551, black: 538, asian: 2869, hispanic: 1614, other: 359 },
  "Albany Park": { pop: 51542, white: 18040, black: 2062, asian: 9277, hispanic: 20617, other: 1546 },
  "Portage Park": { pop: 64124, white: 45046, black: 1283, asian: 5130, hispanic: 11542, other: 1123 },
  "Irving Park": { pop: 53359, white: 31548, black: 1601, asian: 4269, hispanic: 15474, other: 467 },
  "Dunning": { pop: 41932, white: 33545, black: 419, asian: 2936, hispanic: 4613, other: 419 },
  "Montclare": { pop: 13426, white: 8656, black: 134, asian: 806, hispanic: 3625, other: 205 },
  "Montclaire": { pop: 13426, white: 8656, black: 134, asian: 806, hispanic: 3625, other: 205 },
  "Belmont Cragin": { pop: 78743, white: 37637, black: 787, asian: 2362, hispanic: 37168, other: 789 },
  "Hermosa": { pop: 25010, white: 7503, black: 250, asian: 500, hispanic: 16507, other: 250 },
  "Avondale": { pop: 39262, white: 20414, black: 393, asian: 1963, hispanic: 16096, other: 396 },
  "Logan Square": { pop: 73595, white: 43221, black: 2944, asian: 2208, hispanic: 24486, other: 736 },
  "Humboldt Park": { pop: 56323, white: 8449, black: 21963, asian: 563, hispanic: 24782, other: 566 },
  "Humboldt park": { pop: 56323, white: 8449, black: 21963, asian: 563, hispanic: 24782, other: 566 },
  "West Town": { pop: 81432, white: 52931, black: 8143, asian: 3257, hispanic: 16286, other: 815 },
  "Austin": { pop: 98514, white: 2955, black: 89648, asian: 493, hispanic: 4926, other: 492 },
  "West Garfield Park": { pop: 18001, white: 180, black: 17461, asian: 18, hispanic: 324, other: 18 },
  "East Garfield Park": { pop: 20567, white: 411, black: 19538, asian: 21, hispanic: 576, other: 21 },
  "Near West Side": { pop: 54881, white: 27440, black: 14819, asian: 7134, hispanic: 4939, other: 549 },
  "North Lawndale": { pop: 35912, white: 359, black: 35194, asian: 36, hispanic: 287, other: 36 },
  "South Lawndale": { pop: 79288, white: 27751, black: 4757, asian: 793, hispanic: 45591, other: 396 },
  "Lower West Side": { pop: 35769, white: 13576, black: 715, asian: 1073, hispanic: 20047, other: 358 },
  "Loop": { pop: 29283, white: 19614, black: 2928, asian: 4392, hispanic: 2050, other: 299 },
  "Near South Side": { pop: 21390, white: 11979, black: 4278, asian: 3423, hispanic: 1496, other: 214 },
  "Armour Square": { pop: 13391, white: 2678, black: 2008, asian: 8035, hispanic: 536, other: 134 },
  "Douglas": { pop: 18238, white: 6931, black: 8389, asian: 1824, hispanic: 912, other: 182 },
  "Oakland": { pop: 5918, white: 533, black: 5031, asian: 118, hispanic: 177, other: 59 },
  "Fuller Park": { pop: 2876, white: 58, black: 2761, asian: 29, hispanic: 29, other: 0 },
  "Grand Boulevard": { pop: 21929, white: 1535, black: 19517, asian: 219, hispanic: 439, other: 219 },
  "Kenwood": { pop: 17841, white: 5353, black: 10169, asian: 1070, hispanic: 892, other: 357 },
  "Washington Park": { pop: 11717, white: 117, black: 11366, asian: 47, hispanic: 117, other: 70 },
  "Hyde Park": { pop: 25681, white: 12326, black: 8975, asian: 2825, hispanic: 1284, other: 271 },
  "Woodlawn": { pop: 23796, white: 952, black: 22101, asian: 238, hispanic: 381, other: 124 },
  "South Shore": { pop: 49767, white: 498, black: 48274, asian: 249, hispanic: 498, other: 248 },
  "Chatham": { pop: 31710, white: 127, black: 31203, asian: 95, hispanic: 190, other: 95 },
  "Avalon Park": { pop: 10185, white: 102, black: 9879, asian: 51, hispanic: 102, other: 51 },
  "South Chicago": { pop: 31198, white: 3120, black: 21839, asian: 156, hispanic: 5927, other: 156 },
  "Burnside": { pop: 2527, white: 25, black: 2476, asian: 13, hispanic: 13, other: 0 },
  "Calumet Heights": { pop: 13088, white: 131, black: 12564, asian: 131, hispanic: 196, other: 66 },
  "Roseland": { pop: 44619, white: 446, black: 43727, asian: 134, hispanic: 268, other: 44 },
  "Pullman": { pop: 7325, white: 513, black: 6153, asian: 37, hispanic: 586, other: 36 },
  "South Deering": { pop: 15109, white: 1511, black: 10577, asian: 45, hispanic: 2870, other: 106 },
  "East Side": { pop: 23042, white: 10138, black: 1152, asian: 115, hispanic: 11521, other: 116 },
  "West Pullman": { pop: 29651, white: 593, black: 27299, asian: 30, hispanic: 1631, other: 98 },
  "Riverdale": { pop: 6482, white: 65, black: 6222, asian: 32, hispanic: 130, other: 33 },
  "Hegewisch": { pop: 10027, white: 6418, black: 501, asian: 100, hispanic: 2908, other: 100 },
  "Garfield Ridge": { pop: 34513, white: 25885, black: 1035, asian: 690, hispanic: 6558, other: 345 },
  "Archer Heights": { pop: 13393, white: 8841, black: 134, asian: 536, hispanic: 3750, other: 132 },
  "Brighton Park": { pop: 45053, white: 18472, black: 451, asian: 901, hispanic: 24779, other: 450 },
  "McKinley Park": { pop: 15612, white: 7181, black: 468, asian: 2186, hispanic: 5620, other: 157 },
  "Bridgeport": { pop: 31977, white: 17268, black: 1279, asian: 9913, hispanic: 3198, other: 319 },
  "New City": { pop: 44377, white: 8875, black: 14421, asian: 222, hispanic: 20415, other: 444 },
  "West Elsdon": { pop: 17986, white: 10072, black: 180, asian: 540, hispanic: 7015, other: 179 },
  "Gage Park": { pop: 39193, white: 13328, black: 392, asian: 588, hispanic: 24692, other: 193 },
  "Clearing": { pop: 23139, white: 18049, black: 231, asian: 463, hispanic: 4166, other: 230 },
  "West Lawn": { pop: 33355, white: 11341, black: 1001, asian: 334, hispanic: 20346, other: 333 },
  "Chicago Lawn": { pop: 55628, white: 11682, black: 17800, asian: 556, hispanic: 25033, other: 557 },
  "West Englewood": { pop: 35505, white: 355, black: 33940, asian: 36, hispanic: 1065, other: 109 },
  "Englewood": { pop: 30654, white: 153, black: 30040, asian: 31, hispanic: 368, other: 62 },
  "Greater Grand Crossing": { pop: 32602, white: 326, black: 31298, asian: 65, hispanic: 815, other: 98 },
  "Ashburn": { pop: 41081, white: 21766, black: 12324, asian: 411, hispanic: 6162, other: 418 },
  "Auburn Gresham": { pop: 48743, white: 487, black: 47281, asian: 97, hispanic: 780, other: 98 },
  "Beverly": { pop: 20034, white: 14825, black: 4207, asian: 200, hispanic: 601, other: 201 },
  "Washington Heights": { pop: 26820, white: 537, black: 25479, asian: 107, hispanic: 589, other: 108 },
  "Washington Height": { pop: 26820, white: 537, black: 25479, asian: 107, hispanic: 589, other: 108 },
  "Mount Greenwood": { pop: 18628, white: 17952, black: 186, asian: 93, hispanic: 298, other: 99 },
  "Morgan Park": { pop: 22544, white: 8567, black: 12448, asian: 225, hispanic: 1127, other: 177 },
  "O'Hare": { pop: 12756, white: 9695, black: 255, asian: 1531, hispanic: 1148, other: 127 },
  "Edgewater": { pop: 56521, white: 33347, black: 8478, asian: 7348, hispanic: 6782, other: 566 },
};

async function main() {
  const existingPath = path.join(__dirname, '..', 'server', 'data', 'demographics', 'census_2010.json');
  let existingData: any[] = [];
  
  if (fs.existsSync(existingPath)) {
    existingData = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
  }

  const enhancedData: Census2010Data[] = [];

  for (const existing of existingData) {
    const name = existing.community_area_name;
    const popData = census2010Population[name];
    
    if (popData) {
      enhancedData.push({
        ca: existing.ca,
        community_area_name: name,
        total_population: popData.pop,
        white: popData.white,
        black_or_african_american: popData.black,
        asian: popData.asian,
        hispanic_or_latino: popData.hispanic,
        other_race: popData.other,
        percent_of_housing_crowded: existing.percent_of_housing_crowded,
        percent_households_below_poverty: existing.percent_households_below_poverty,
        percent_aged_16_unemployed: existing.percent_aged_16_unemployed,
        percent_aged_25_without_high_school_diploma: existing.percent_aged_25_without_high_school_diploma,
        percent_aged_under_18_or_over_64: existing.percent_aged_under_18_or_over_64,
        per_capita_income_: existing.per_capita_income_,
        hardship_index: existing.hardship_index,
      });
    } else {
      console.log(`No population data for: ${name}`);
      enhancedData.push({
        ...existing,
        total_population: 0,
        white: 0,
        black_or_african_american: 0,
        asian: 0,
        hispanic_or_latino: 0,
        other_race: 0,
      });
    }
  }

  const outputPath = path.join(__dirname, '..', 'server', 'data', 'demographics', 'census_2010_enhanced.json');
  fs.writeFileSync(outputPath, JSON.stringify(enhancedData, null, 2));
  console.log(`Wrote enhanced 2010 census data for ${enhancedData.length} community areas to ${outputPath}`);
}

main();
