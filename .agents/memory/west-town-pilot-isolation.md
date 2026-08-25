---
name: West Town pilot isolation
description: Keep Market Discovery's West Town tax-delinquency pilot independent from individual property-report tax data.
---

The West Town pilot belongs exclusively to Market Discovery: its scanner should begin only after an authorized Market Discovery request and should use its own queue, snapshots, and Treasurer results.

**Why:** Starting the scanner at application boot and reusing the individual-report tax cache made Market Discovery settings and data affect ordinary property runs. The product boundary is explicit: the pilot is not part of individual reports.

**How to apply:** Do not schedule the pilot in general application startup. Do not read from or write to the report tax cache in pilot code. Legacy report-derived pilot rows must remain excluded until independently rechecked by the pilot.