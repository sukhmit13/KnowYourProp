import assert from 'node:assert/strict';
import { parseUnits } from './upcomingDevelopments';
import { summarizeDevelopmentUnits } from '../shared/developmentUnitCoverage';
import { classifyArticle } from '../shared/articleSubject';

assert.deepEqual(parseUnits('replacing a 6-unit building with a 200-unit tower'), {
  units: 200, ambiguous: true,
});
assert.deepEqual(parseUnits('1,200 apartments and 2,500 units'), {
  units: 1200, ambiguous: false,
});
assert.deepEqual(parseUnits('A retail shop opens'), { units: undefined, ambiguous: false });

const articles = [
  { address: '123 N Main St', units: 6 },
  { address: '123 North Main Street', units: 200, unitsAmbiguous: true },
  { address: '123 S Main St', units: 14 },
  { address: '456 W Lake Ave', units: 30 },
  { units: 600 },
];
assert.deepEqual(summarizeDevelopmentUnits(articles), {
  total: 244, projects: 3, ambiguousProjects: 1,
});
assert.deepEqual(summarizeDevelopmentUnits(articles, ['456 West Lake Avenue']), {
  total: 214, projects: 2, ambiguousProjects: 1,
});
assert.deepEqual(summarizeDevelopmentUnits(articles, ['123 N Main St', '123 S Main St', '456 W Lake Ave']), {
  total: 0, projects: 0, ambiguousProjects: 0,
});

assert.equal(classifyArticle('New Thai spot opens on Milwaukee Avenue'), 'culture');
assert.equal(classifyArticle('Neighborhood community theater reopens'), 'culture');
assert.equal(classifyArticle('Developer plans 200 units above retail'), 'development');