# Acceptance Criteria

- `akrctx impl start`, `impl log` and `impl status` called with `TASK-NNN` and with `TASK-NNN-<slug>` of the same capsule read and write the same file, `.akrctx/local/impl/TASK-NNN/log.md`.
- The attempt count and budget are shared across both input forms.
- Tests cover both input forms for all three commands.
- `impl start`, `impl log` and `impl status` reject an argument that matches no capsule, with a named error: a wrong slug, an unpadded `TASK-72`, and an ID with no capsule directory.
- The log header records the resolved short ID, whichever form the caller passed.
- `akrctx impl start`, `impl log` and `impl status` reject an argument that is not a task ID, including `../../../../tmp/pwn`, with a named error. They write no file outside `.akrctx/local/impl/`.
- A test proves that a traversal argument creates nothing outside `.akrctx/local/impl/`.
- TASK-023's capsule records that TASK-074 absorbed it, and names the delivery.
- A capsule whose only log is slug-named keeps working: `impl status` reads that log and reports its real attempt count.
- A capsule with both a short-ID log and a slug-named log makes `impl start`, `impl log` and `impl status` refuse, with an error that names the surplus file.
- `impl` moves, copies and deletes no file under `.akrctx/local/impl/`. A test pins this for the refusal case.
- Build, full tests, lint, init dry-run and Doctor pass.
