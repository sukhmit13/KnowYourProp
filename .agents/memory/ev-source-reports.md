---
name: Illinois EV source reports
description: Official monthly PDF discovery and separate county versus place-and-ZIP records
---

Illinois SOS publishes monthly EV registration PDFs containing both county totals and place-and-ZIP totals. Discover the actual PDF links from the official Electric Vehicle Statistics index rather than assuming every filename uses the fifteenth of the month.

**Why:** The official index includes date exceptions, such as a February report dated the twenty-seventh. The PDFs contain ZIP records with a place name before the ZIP, so a parser expecting a numeric ZIP at the beginning of each line misses those rows.

**How to apply:** Extract Cook County from its official county row. Parse the separate place-and-ZIP section for ZIP history; never substitute a sum of selected Chicago ZIPs for Cook County. Check the reporting date and table structure before accepting new observations, and preserve previous verified history when retrieval or parsing fails.