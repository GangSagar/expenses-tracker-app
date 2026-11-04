# Project Structure

- `src/app/`: application wiring and composition
- `src/core/`: parser, classifier, confidence, deduplication, learning, security, settings, and transaction logic
- `src/services/`: grouped application-facing services such as advisor, AI, messaging, notifications, security, settings, and transactions
- `src/infrastructure/`: AI, learning, native, observability, and persistence adapters
- `src/presentation/`: UI and legacy presentation modules; confirm exact screen/component locations in the current tree
- `src/hooks/`: React hooks and input/presentation integration
- `src/__tests__/`: automated behavior and regression tests
- `android/`: Android application and native integrations
- `docs/`: architecture, phase plans, product requirements, and implementation records
- `.agents/`: agent prompts, rules, workflows, context, memory, templates, and task artifacts

This map is approximate and should be checked against the current tree. See `docs/ARCHITECTURE.md` for module boundaries.

