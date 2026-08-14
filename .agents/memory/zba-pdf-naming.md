---
name: ZBA PDF naming variants
description: Chicago ZBA agenda/decision/minutes PDF filenames switch between abbreviated and full month names — always try both.
---

# ZBA PDF naming variants

The city posts ZBA PDFs at `.../Administrative_Reviews_and_Approvals/Agendas/ZBA_<Month>_<YYYY>_<Agenda|Decisions|Minutes>.pdf`, but `<Month>` is inconsistent: Jan–May 2026 used abbreviations (`ZBA_Apr_2026_Minutes.pdf`), June/July 2026 switched to full names (`ZBA_July_2026_Decisions.pdf`). Older years mix both plus other formats.

**Why:** In Aug 2026 the feed silently went stale after April because the scraper only tried abbreviated names — all newer PDFs 404'd and the code treats 404 as "not posted yet."

**How to apply:** `monthUrlVariants()` in the ZBA scraper generates both variants for every fetch; keep that when touching the URL logic. Some months only ever get Minutes (no Decisions PDF). The generic `/depts/dcd/agendas/ZBAAgenda.pdf` URL is a stale 2012 document — never use it. An empty "upcoming" list right before a meeting usually means the city just hasn't posted the agenda yet, not a bug.
