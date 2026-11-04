# Coding Patterns

- Follow existing Clean Architecture seams: application/domain policy should not import presentation or concrete infrastructure.
- Use application composition to select concrete adapters.
- Keep transaction flows in the transaction application/use-case boundary and persistence behind repository contracts.
- Prefer focused services and typed contracts over catch-all service modules.
- Use deterministic parser rules as the current baseline; do not assume local model inference is active.
- Use Graphify for relationship discovery, then confirm important behavior in source and tests.

These are orientation points from current architecture docs. Recheck the implementation before applying a pattern to a new module.

