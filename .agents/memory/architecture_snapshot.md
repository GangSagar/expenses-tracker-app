# Architecture Snapshot

SpendWise is an offline-first React Native application. Android SMS and notification integrations deliver message inputs into application services. Parsing produces structured candidates; transaction decision policy determines save/review/reject behavior; transaction application/use cases coordinate persistence through repository adapters backed by SQLite. Composition code selects concrete adapters. UI state and screens are presentation concerns.

Local model management groundwork exists, but no inference adapter is active while the catalog is empty. Verify this statement against current architecture docs/source before making model-related decisions.

This is a short orientation snapshot. The maintained design is [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md); query Graphify and verify source for change-specific work.

