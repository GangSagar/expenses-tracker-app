# Refactor Workflow

1. **Architecture** and **Graphify** establish the current boundaries, dependencies, and behavior to preserve.
2. **Planning** defines small migration steps and explicit behavior/contract invariants.
3. Follow the developer review gate in `.agents/AGENTS.md`.
4. **Implementation** refactors in scoped increments without bundling unrelated behavior changes.
5. **Review** checks dependency direction and accidental behavior changes.
6. **Testing** verifies preserved behavior with relevant checks.
7. **Documentation** updates architecture guidance if the resulting design materially changed.
8. **Orchestrator** reports completed steps, checks, and any remaining migration.

