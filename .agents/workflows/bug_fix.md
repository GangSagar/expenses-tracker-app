# Bug Fix Workflow

1. **Graphify** and the **Orchestrator** locate the failing path, affected callers, and existing coverage.
2. **Planning** states the reproduction, likely cause, narrow fix, and regression acceptance criterion.
3. Follow the developer review gate in `.agents/AGENTS.md`.
4. **Implementation** fixes the root cause and adds focused regression coverage when authorized.
5. **Review** checks the diff and plausible adjacent failures.
6. **Testing** runs the relevant authorized checks and reports exact outcomes.
7. **Documentation** updates only if supported behavior or guidance changed.
8. **Orchestrator** summarizes cause, fix, evidence, and residual risk.

