# Technology Stack

Verified from `package.json` and current architecture documentation; recheck before dependency or platform changes.

- Mobile: React Native 0.85.3, React 19.2.3, TypeScript 5.8.x
- Runtime: Node.js >= 22.11.0
- State/navigation: Zustand 5; React Navigation 7
- Persistence: `react-native-quick-sqlite` with local SQLite
- Android integrations: native Kotlin/JSI and Headless JS for message/notification input
- Optional local inference groundwork: `llama.rn`, ONNX Runtime React Native; no active model catalog/inference adapter according to `docs/ARCHITECTURE.md`
- Tests/lint: Jest 29; ESLint; `npm run lint` also checks import boundaries
- iOS capability and parity: verify against native source before making claims

