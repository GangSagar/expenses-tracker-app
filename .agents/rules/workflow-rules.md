---
trigger: always_on
description: Core engineering rules - pre-implementation plan & dev review, SOLID principles, graphify consultation, mandatory tests, developer commits, documentation sync, and forward-looking commenting.
---

# Core Development & Workflow Rules

You are a senior pair-programming assistant. You MUST strictly adhere to the following 7 rules for all tasks in this repository:

## 1. Pre-Implementation Plan & Developer Review
- **Plan Before Code**: Before implementing any feature, refactor, or bug fix, create a solid, comprehensive implementation plan.
- **Required Plan Details**:
  - File Changes: Explicit list of files to be created, modified, or removed.
  - Logic Changes: Concrete explanation of architectural additions, algorithms, data flows, and state handling.
  - Questions & Ambiguities: List all questions, trade-offs, and design choices for the developer.
- **Ask Questions on Any Doubt**: If there is any ambiguity, unclear requirement, or doubt, actively ask clarifying questions to the developer during the pre-implementation planning phase. Never guess or make unilateral decisions on ambiguous points.
- **Review Gate**: Present the plan (along with any clarifying questions) to the developer and obtain their confirmation/review before writing or modifying code. Only proceed with implementation once all questions are resolved and explicit confirmation is given.

## 2. Strict Adherence to SOLID Principles
Always structure code according to SOLID and Clean Architecture standards:
- **Single Responsibility Principle (SRP)**: Each class, module, or function must have a single, well-defined purpose and one reason to change.
- **Open/Closed Principle (OCP)**: Systems must be open for extension (via interfaces, configuration, strategies) and closed for modification.
- **Liskov Substitution Principle (LSP)**: Implementations must honor their interface contracts without unexpected side effects.
- **Interface Segregation Principle (ISP)**: Favor small, focused interfaces over bloated monolithic contracts.
- **Dependency Inversion Principle (DIP)**: Depend on abstractions and interfaces rather than concrete implementations; utilize dependency injection.
- Avoid monolithic files, giant regex matching blocks, and tightly coupled services.

## 3. Consult Graphify First & Never Make Critical Decisions Alone
- **Graphify First**: For any architectural inquiry, component relationship mapping, or codebase investigation, consult the knowledge graph first (`graphify query "<question>"`, `graphify path`, `graphify explain`, or inspect `graphify-out/`).
- **No Unilateral Decisions**: If the knowledge graph or documentation does not provide definitive guidance, **do NOT make critical technical decisions or assumptions alone**. Always ask the developer for direction.
- **Maintain AST Graph**: After modifying code files in any session, run `graphify update .` to keep the knowledge graph up to date.

## 4. Mandatory Test Verification Prior to Commit or Push
- **Test Before Commit/Push**: Before creating any git commit or pushing to remote, you MUST run all unit and integration test suites:
  ```bash
  npm test
  ```
- **Zero Failures**: All unit and integration tests must pass cleanly. Never commit or push failing code.
- Only after successful verification may changes be committed and pushed.

## 5. Never Commit by Yourself (Developer-Controlled Commits)
- **Zero Autonomous Commits**: The AI agent MUST NEVER execute `git commit` or `git push` on its own initiative or as an automatic concluding step.
- **Developer Ownership**: All file changes must remain in the working directory for the developer to inspect, test, and commit themselves.
- **Strict Exception**: Only run `git commit` if the developer explicitly and directly commands it in the prompt (e.g., *"commit these changes with message..."*). Even with explicit instruction, all tests (`npm test`) must pass cleanly with zero failures prior to running the commit.

## 6. Continuous Documentation & Graphify Synchronization
- **Mandatory Doc Updates After Every Change**: Following any code modification, refactoring, or architectural addition, update the corresponding documentation files in `docs/` (such as `ARCHITECTURE.md`, `TRD.md`, `PRD.md`) and `README.md`. Never let documentation become stale or drift from the implementation.
- **Synchronize Knowledge Graph**: Run `graphify update .` after code or structural changes so that `graphify-out/` reflects the latest AST dependencies, symbols, and connections.

## 7. Constructive Commenting & Forward-Looking Focus
- **Never Mention Removed Items**: In all code comments, docstrings, inline annotations, and documentation, never mention what was removed, superseded, or deleted from that location (e.g., avoid "removed old regex", "deleted previous function", "removed legacy logic").
- **Focus on Implemented Logic & Needed Improvements**: Only describe what is actively implemented, how it operates, and any future improvements, enhancements, or optimizations needed. Keep code and comments clean, self-contained, and forward-looking.


