# Graphify Example

**Question:** “What calls transaction persistence?”

**Example response shape:**

- Graph path: message listener → application transaction service → use case → repository port → SQLite adapter.
- Evidence: cite the graph nodes and verify the direct calls in the cited source files.
- Gap: state if the graph does not capture an indirect/native path.

