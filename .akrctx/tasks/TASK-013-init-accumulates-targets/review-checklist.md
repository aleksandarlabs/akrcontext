# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Tests or validation commands are defined.
- [x] Existing instructions were not overwritten.

## Accumulation

- [x] Repeat init with a new target adds it.
- [x] Repeat init with the same target changes nothing.
- [x] `--target all` lists every target.
- [x] `targets` is never shortened.

## Preservation

- [x] `defaults.target` survives.
- [x] User settings and unknown agent entries survive.
- [x] First install unchanged.

## Consistency

- [x] doctor and config agree after the reported sequence.
- [x] `doctor --fix` still works.

## Cross-cutting

- [x] `pnpm build && npx vitest run` passes in full.
- [x] `npx tsc --noEmit` adds no new error.
