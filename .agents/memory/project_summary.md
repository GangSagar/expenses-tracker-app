# Project Summary

SpendWise is an offline-first personal expense tracker built with React Native and TypeScript. Android receives SMS and notification events; the app parses supported financial messages, applies transaction decision policy, and persists transactions locally in SQLite.

## Stack (verified from repository files)

- React Native 0.85, React 19, TypeScript 5.8, Node.js >= 22.11
- SQLite through `react-native-quick-sqlite`; Zustand for transitional presentation state
- Jest for automated tests; Android native modules provide message and notification integration
- Local-model libraries are present, but the app’s model catalog is empty and no model inference adapter is active per `docs/ARCHITECTURE.md`.

## Architecture orientation

Application composition selects adapters. Core transaction use cases and repositories own transaction persistence; parser and decision policy are separate stages. The UI is being treated as replaceable presentation. See [architecture](../../docs/ARCHITECTURE.md), the [restructuring plan](../../docs/v2.0%20-%20improvement_plan/ARCHITECTURE_RESTRUCTURING_PLAN.md), and the [implementation changelog](../../docs/v2.0%20-%20improvement_plan/IMPLEMENTATION_CHANGELOG.md).

## Maintenance

Refresh this summary only when source or canonical docs change. It is orientation, not a substitute for source inspection or Graphify.

