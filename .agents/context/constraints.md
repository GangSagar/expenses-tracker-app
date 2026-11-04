# Project Constraints

- Offline-first transaction processing and local persistence are core product constraints.
- SMS, notifications, contacts, transaction history, logs, and corpus data are sensitive.
- Preserve the documented transaction decision policy and compatibility unless a requirement explicitly changes them.
- Treat UI as replaceable presentation; preserve workflow/domain contracts while making UI changes.
- Local model artifacts must follow current product limits and verified adapter capabilities; inspect the active plan before AI changes.
- Do not infer platform support, device performance, or parser accuracy from host-only tests.
- Follow `.agents/AGENTS.md` and current architecture docs. Revalidate constraints when implementation or plans change.

