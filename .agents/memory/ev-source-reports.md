---
name: Illinois EV source reports
description: Official monthly PDF discovery and separate county versus place-and-ZIP records
---

Illinois SOS publishes monthly EV registration PDFs containing both county totals and place-and-ZIP totals. Discover the actual PDF links from the official Electric Vehicle Statistics index rather than assuming every filename uses the fifteenth of the month.

**Why:** The official index includes date exceptions, such as a February report dated the twenty-seventh. The PDFs contain ZIP records with a place name before the ZIP, so a parser expecting a numeric ZIP at the beginning of each line misses those rows.

**How to apply:** Extract Cook County from its official county row. Parse the separate place-and-ZIP section for ZIP history; never substitute a sum of selected Chicago ZIPs for Cook County. Check the reporting date and table structure before accepting new observations, and preserve previous verified history when retrieval or parsing fails.

## Refresh cadence and publication evidence

The user asked: “We should check monthly. If you can extract when that data is published, then we can check the next day to pull it.”

**Why:** The source’s reporting date is not necessarily its publication date. An observed September report was dated the fifteenth but had an origin Last-Modified timestamp on the eighteenth; Last-Modified itself can also reflect a later edit.

**How to apply:** Use a monthly check, with the following-day pull when publication timing is actually established. Do not describe the PDF's “as of” date or a proxy response timestamp as its upload date.

## Source access and backfill quality

Agent-side source extraction can work while runtime requests time out or are blocked. Markdown extraction can leave numeric PDF table cells blank even when the document is returned without a truncation warning.

**Why:** Backfilling February exposed unreadable ZIP count cells despite readable county totals and neighboring ZIP counts. Re-running a failed whole-file builder could erase verified history or replace missing cells with false zeros.

**How to apply:** Validate the original PDFs for automated imports. If an independently verified manual text backfill leaves count cells unreadable, keep those values unknown, flag that report as incomplete, and retry the original PDF. A working agent fetch is not proof that the scheduled runtime fetch can reach the publisher.