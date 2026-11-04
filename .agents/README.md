# Repository Agent System

This directory contains reusable prompts and operating material for a specialist-agent workflow. It is provider-agnostic: these files describe roles and handoffs; they do not configure or launch agents by themselves.

## Read order

1. Read [AGENTS.md](./AGENTS.md) first. Its repository safety, planning, testing, Graphify, documentation, and commit rules remain authoritative.
2. Read the applicable rule files in `rules/`.
3. Select the relevant workflow in `workflows/`.
4. Give each assigned specialist its prompt and only the context/artifacts it needs.
5. Store durable project knowledge in `memory/`, stable reference facts in `context/`, reusable formats in `templates/`, and task reports in `artifacts/`.

## Specialist roles

| Role | Owns |
|---|---|
| [Orchestrator](./agents/orchestrator/prompt.md) | Scope, coordination, conflict resolution, user-facing summary |
| [Architecture](./agents/architecture/prompt.md) | Boundaries, design decisions, architecture review |
| [Graphify](./agents/graphify/prompt.md) | Read-only codebase and dependency knowledge |
| [Planning](./agents/planning/prompt.md) | Executable plans, sequence, risks, dependencies |
| [Implementation](./agents/implementation/prompt.md) | Assigned production changes |
| [Review](./agents/review/prompt.md) | Independent code review |
| [Testing](./agents/testing/prompt.md) | Independent verification and test reporting |
| [Documentation](./agents/documentation/prompt.md) | Project documentation and change records |
| [DevOps](./agents/devops/prompt.md) | Build, CI, release, deployment, observability |
| [Security](./agents/security/prompt.md) | Threat analysis and security review |
| [Cost](./agents/cost/prompt.md) | Model/tool/context cost and efficiency |

## Operating model

- The orchestrator coordinates; it does not take ownership away from specialists.
- Architecture and Graphify are consulted when a task changes or depends on system boundaries. Graphify is read-only.
- Planning chooses only the specialists needed. Small tasks do not require every role or a ceremonial full pipeline.
- Implementation, review, testing, and documentation have separate ownership. Do not treat a review as a test run or a test pass as architecture approval.
- Parallel work is limited to independent tasks with clear file ownership. Integrate and review all outputs before reporting completion.
- Ask the developer when a material ambiguity affects product behavior, data safety, security, compatibility, or an irreversible action. Follow `AGENTS.md` for the required review gate.
- Do not create false status, estimates, test results, memory, or architecture facts. Mark unknowns explicitly.

## Directory map

```text
.agents/
├── agents/       # specialist prompt, checklist, and metadata
├── artifacts/    # task-scoped generated reports; avoid durable source facts here
├── context/      # stable project reference material
├── memory/       # evolving project state and decisions
├── rules/        # shared engineering standards
├── templates/    # reusable document formats
└── workflows/    # task handoff sequences
```

