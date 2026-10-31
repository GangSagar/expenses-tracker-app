# Workspace Agent Rules

These rules apply to all AI coding agents working in this repository:

## 1. Pre-Implementation Planning & Review
- Before writing or editing code for any task, formulate a comprehensive plan detailing:
  - Exact files to create, modify, or delete
  - Detailed description of logic changes, algorithms, and architectural adjustments
  - Any architectural questions, trade-offs, or decisions requiring developer review
- **Ask Questions on Any Doubt**: If there is any ambiguity, unclear requirement, or doubt, actively ask clarifying questions to the developer while presenting the pre-implementation plan. Never assume or make unilateral decisions on ambiguous requirements.
- Request review from the developer and obtain confirmation before executing code changes. Only proceed with implementation once all doubts and questions are resolved and the developer confirms.

## 2. SOLID Design Principles
- **S**ingle Responsibility: One purpose per module, class, and service.
- **O**pen/Closed: Open for extension (via configuration, interfaces, plugins), closed for modification.
- **L**iskov Substitution: Swappable implementations adhering strictly to contracts.
- **I**nterface Segregation: Fine-grained, targeted interfaces.
- **D**ependency Inversion: High-level modules depend on abstractions, not concrete classes.

## 3. Graphify First & Collaborative Architecture
- Always consult the knowledge graph (`graphify query`, `graphify explain`, or `graphify-out/`) before making structural decisions.
- If context is missing from Graphify or ambiguous, ask the developer. Do not make critical decisions alone.
- Run `graphify update .` after modifying code files to keep the AST graph current.

## 4. Test Verification Before Commit or Push
- Run all unit and integration tests before making any git commit or push:
  ```bash
  npm test
  ```
- All tests must pass with zero errors. Never commit or push failing code.

## 5. Never Commit by Yourself (Developer-Controlled Commits)
- Never run `git commit` or `git push` autonomously.
- Changes must remain in the working directory for developer inspection.
- Only commit when the developer explicitly issues a direct commit command.

## 6. Continuous Documentation & Graphify Synchronization
- After every change (feature, refactor, bugfix, or architectural update):
  - **Update Documentation**: Immediately review and update all relevant documentation in `docs/` (e.g., architecture, design specs, workflow notes) and `README.md`. Documentation must always remain synchronized with the current codebase.
  - **Update Graphify Knowledge Graph**: Run `graphify update .` to keep the AST knowledge graph (`graphify-out/`) current and accurate.
