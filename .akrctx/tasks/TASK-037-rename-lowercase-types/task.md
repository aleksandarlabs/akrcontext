# Task

## Goal

Rename the three interfaces that start with a lowercase letter, so the codebase has one naming
convention instead of two.

| Current | New | Declared at | Call sites in `src/` |
|---|---|---|---|
| `akrctxConfig` | `AkrctxConfig` | `src/types.ts:104` | 42 |
| `akrctxPolicy` | `AkrctxPolicy` | `src/types.ts:136` | 13 |
| `akrctxManifest` | `AkrctxManifest` | `src/manifest.ts:13` | 7 |

Split out of TASK-028, which removes four dead exports. Mixed together, 62 mechanical edits would
have buried four one-line deletions and made both unreviewable.

## Why this is worth doing at all

It is cosmetic. No user sees it, no bug is fixed, nothing gets faster.

The reason to do it is that a lowercase interface name reads as a variable at every call site, and
this repository is read by coding agents as much as by people. Two conventions in one codebase is a
small tax on every future read, paid forever, removable once.

The reason to do it **now** is that it is currently free. All 62 references are inside `src/`.
Nothing in `tests/`, `evals/` or the documentation names them, and they are not part of the
published surface, so nothing outside this repository can break. That will stop being true the
first time a test imports one.

## Not a public API

The package is `bin`-only. `package.json` has no `main`, no `exports` and no `types` entry, and
`dist/index.d.ts` contains nothing but the shebang. No consumer can import these types, so this is
not a breaking change for anyone.

Verify that before starting rather than trusting this paragraph. If `dist/index.d.ts` has grown a
type surface since this was written, the task changes shape and `CHANGELOG.md` has to say so.

## Validation

```
pnpm lint && pnpm build && npx vitest run
```

## Out Of Scope

- Any other rename. `Target`, `Profile`, `WriteResult` and the rest already follow the convention.
- Adding, removing, renaming or retyping any member of the three interfaces.
- Adding a lint rule to prevent recurrence. Worth considering; not part of a mechanical rename.
- The four dead-export removals. TASK-028 owns those.

## Clarifications

### Session 2026-08-18

- **All three types are renamed together.** Renaming two of them would leave a reader unsure which
  convention is current, which is worse than the state this task starts from.
- The rename is **mechanical only**. No interface member changes in the same pass, so the diff can
  be read as a pure substitution and nothing else has to be checked.
- No compatibility alias is left behind. `export type akrctxConfig = AkrctxConfig` would make the
  change invisible and permanent. There is nothing to be compatible with.

## Open Questions

- Should a Biome rule enforce PascalCase on type declarations afterwards, so this cannot recur? It
  is a one-line config change and it is the only thing that makes this task worth more than the
  hour it costs. It is out of scope here because a rule that fires on other files turns a rename
  into an unbounded cleanup, and that decision deserves its own look.
