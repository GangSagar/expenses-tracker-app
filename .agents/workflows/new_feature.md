# New Feature Workflow

Use only the stages needed for the feature size and risk. The repository review gate in `.agents/AGENTS.md` applies.

1. **Orchestrator** captures the desired behavior, constraints, and completion criteria.
2. **Graphify** maps relevant modules, current behavior, tests, and documentation when this saves discovery work.
3. **Architecture** assesses boundary or contract changes; skip for a contained change with no architectural effect.
4. **Planning** creates the file-by-file implementation and verification plan and surfaces decisions.
5. **Developer review** resolves required questions/approval before implementation.
6. **Implementation** makes the scoped change; split independent work only when file ownership is clear.
7. **Review** and **Testing** independently inspect and verify as appropriate to risk and user direction.
8. **Documentation** updates canonical docs affected by verified behavior.
9. **Orchestrator** checks evidence and presents the integrated result and remaining risks.

Do not deploy, publish, commit, or contact external parties without explicit authorization.

