import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, cp } from "fs/promises";
import { execSync } from "child_process";
import path from "path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "exceljs",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  console.log("copying server data files...");
  // Exclude extracted GTFS directories (regenerable from the zips at runtime).
  // They add ~365MB of raw text files that bloat the deployment image.
  const extractedGtfsDir = /gtfs[\/\\](cta_gtfs|metra_gtfs)([\/\\]|$)/;
  await cp("server/data", "dist/data", {
    recursive: true,
    filter: (src) => !extractedGtfsDir.test(src),
  });

  console.log("copying scraper scripts...");
  await cp("server/recorder-scraper.mjs", "dist/recorder-scraper.mjs");
  await cp("server/recorder-name-scraper.mjs", "dist/recorder-name-scraper.mjs");
  await cp("server/treasurer-scraper.mjs", "dist/treasurer-scraper.mjs");

  console.log("installing playwright browsers...");
  const browsersDir = path.join(process.cwd(), "playwright-browsers");
  execSync("npx playwright install chromium", {
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir },
  });

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.js",
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
