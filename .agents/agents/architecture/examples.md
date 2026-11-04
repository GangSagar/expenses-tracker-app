# Architecture Example

**Question:** “Where should transaction export live?”

**Example recommendation:** Keep export formatting in an application-facing export service/use case, read records through the repository boundary, and let UI invoke the use case. Check current modules before applying this sketch.

**Trade-off to report:** streaming can reduce memory use for large histories but adds complexity; decide based on expected volume and device measurements.

