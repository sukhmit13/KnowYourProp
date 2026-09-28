import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express, publicPagesBeforeAuth = false) {
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const staticFiles = express.static(distPath, {
      setHeaders: (res, filePath) => {
        // Vite outputs hashed filenames under /assets — safe to cache forever.
        // Everything else (index.html, favicons, etc.) must always revalidate,
        // otherwise browsers keep serving a stale copy of the app after a
        // republish (old design, old paywall logic).
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        }
      },
    });

  if (publicPagesBeforeAuth) {
    // Static documents and assets do not need a database-backed session.
    // Keep /api on the authenticated route stack, even when a file is missing.
    app.use((req, res, next) => {
      if (!["GET", "HEAD"].includes(req.method) || /^\/api(?:\/|$)/.test(req.path)) return next();
      staticFiles(req, res, () => {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    });
    return;
  }

  app.use(staticFiles);

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
