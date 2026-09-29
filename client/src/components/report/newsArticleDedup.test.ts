import assert from "node:assert/strict";
import { withoutRepeatedNews } from "./newsArticleDedup";

const corridor = [
  { title: "A development proposed for the former warehouse", source: "Block Club Chicago", url: "https://www.blockclubchicago.org/stories/warehouse?utm_source=rss", corridorKeys: ["chicago-ave"] },
  { title: "A new community arts space opens on the corridor", source: "Chicago Reader", url: "https://chicagoreader.com/arts/new-space", corridorKeys: ["chicago-ave"] },
  { title: "Independent report on new local construction", source: "Chicago Tribune", url: "https://chicagotribune.com/news/new-construction", corridorKeys: ["chicago-ave"] },
  { title: "Independent report on new local construction", source: "Chicago Tribune", url: "https://chicagotribune.com/news/new-construction?fbclid=tracking", corridorKeys: ["division-st"] },
];
const inNews = [
  { title: corridor[0].title, url: "https://blockclubchicago.org/stories/warehouse" },
  { title: "A new community arts space opens on the corridor - Chicago Reader", source: "Chicago Reader Archives", url: "https://another-feed.example.com/redirect" },
];
const filtered = withoutRepeatedNews(corridor, inNews);
assert.deepEqual(filtered.map(a => a.title), ["Independent report on new local construction"]);
assert.equal(corridor.length, 4, "cached corridor data must not be mutated");
assert.deepEqual(withoutRepeatedNews(corridor, []), [corridor[0], corridor[1], corridor[2]], "repeated items within corridor are shown once");
console.log("Corridor/news article dedup checks passed");