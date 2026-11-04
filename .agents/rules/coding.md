# Coding Standards

- Follow the patterns already used in the owning module; prefer small, cohesive changes.
- Keep business rules independent from React Native, SQLite, and platform adapters where the existing architecture provides a seam.
- Prefer composition, explicit dependencies, descriptive names, and typed contracts.
- Avoid duplicated policy logic, hidden global state, unnecessary dependencies, and speculative abstractions.
- Handle failure paths and preserve offline-first behavior unless the requirement says otherwise.
- Keep comments focused on why a non-obvious decision exists; keep documentation aligned with current behavior.
- Follow `.agents/AGENTS.md` for planning, developer review, Graphify, docs, test, and commit requirements.

