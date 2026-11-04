# Architecture Rules

- Consult Graphify and current architecture documentation before changing module boundaries.
- Keep domain and application policy separate from UI and platform-specific infrastructure.
- Put framework, storage, native, and network details behind existing ports/adapters when appropriate.
- Treat `src/app/composition/` as the application composition boundary; avoid reaching into it from lower-level modules.
- Preserve documented contracts and migration compatibility; call out any breaking change before implementation.
- Prefer a modular monolith and existing seams over introducing services, event buses, or layers without a concrete need.
- Record material long-lived decisions using `templates/ADR.md` and update architecture documentation when the actual design changes.

