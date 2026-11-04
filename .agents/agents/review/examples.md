# Review Example

**Finding:** `[P1] Export can include records outside the selected end date` — `path/to/file.ts:42` — A date-only end value is parsed at midnight, so transactions later that day are excluded. Use an exclusive next-day boundary or an explicit inclusive time boundary and add a regression case.

Use real paths, lines, and scenarios from the diff; this sample is illustrative.

