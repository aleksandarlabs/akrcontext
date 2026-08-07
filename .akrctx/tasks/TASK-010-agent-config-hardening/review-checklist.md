# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Tests or validation commands are defined.
- [x] Existing instructions were not overwritten.

## Point 1 — implementation log privacy

- [x] `impl enable` refuses on an unsafe or missing `.akrctx/local/.gitignore`.
- [x] `impl start`, `impl log`, and `impl status` all refuse, not only `start`.
- [x] The check lives in the store, so skipping `impl start` does not skip it.
- [x] A freshly initialised repository passes with no extra step.

## Point 2 — unknown agent entry

- [x] No command throws on an unknown entry.
- [x] The entry survives a read/write round-trip byte-identical.
- [x] Exactly one warning is reported, in status, doctor, and upgrade.
- [x] A non-object `agents` block and an invalid `maxAttempts` still throw.

## Point 3 — record validation

- [x] Every field named in the criteria is rejected when malformed, by name.
- [x] An unknown field is rejected rather than dropped.
- [x] A caller-supplied ISO timestamp is still accepted.
- [x] A supplied `round` is ignored, not honoured.

## Point 4 — judge enable

- [x] Throws on an empty resolved target set, writing nothing.
- [x] Message matches the shape used by the other two enable commands.

## Cross-cutting

- [x] Each point has a test that failed against the pre-change code.
- [x] `npx vitest run` passes in full.
- [x] `npx tsc --noEmit` adds no new error.
- [x] No comment restates what the code already says.
