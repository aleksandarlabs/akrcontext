# Acceptance Criteria

- AC-1: `akrctx impl start`, `impl log` and `impl status` called with `TASK-NNN` and with `TASK-NNN-<slug>` of the same capsule read and write the same file, `.akrctx/local/impl/TASK-NNN/log.md`.
- AC-2: The attempt count and budget are shared across both input forms.
- AC-3: Tests cover both input forms for all three commands.
- AC-4: `impl start`, `impl log` and `impl status` reject an argument that matches no capsule, with a named error: a wrong slug, an unpadded `TASK-72`, and an ID with no capsule directory.
- AC-5: The log header records the resolved short ID, whichever form the caller passed.
- AC-6: `akrctx impl start`, `impl log` and `impl status` reject an argument that is not a task ID, including `../../../../tmp/pwn`, with a named error. They write no file outside `.akrctx/local/impl/`.
- AC-7: A test proves that a traversal argument creates nothing outside `.akrctx/local/impl/`.
- AC-8: TASK-023's capsule records that TASK-074 absorbed it, and names the delivery.
- AC-9: A capsule whose only log is slug-named keeps working: `impl status` reads that log and reports its real attempt count.
- AC-10: A capsule with both a short-ID log and a slug-named log makes `impl start`, `impl log` and `impl status` refuse, with an error that names the surplus file.
- AC-11: `impl` moves, copies and deletes no file under `.akrctx/local/impl/`. A test pins this for the refusal case.
- AC-12: Build, full tests, lint, init dry-run and Doctor pass.
