# Task

## Goal

Centralize hardcoded `.akrctx/` path literals into exported constants from `config.ts` to eliminate duplication and drift risk.

## Problem

Multiple files hardcode path literals like `.akrctx/config.json`, `.akrctx/policy.json`, and `.akrctx/tasks`:

| File | Line | Hardcoded Path |
|------|------|----------------|
| `doctor.ts` | 59 | `.akrctx/config.json` |
| `status.ts` | 27 | `.akrctx/config.json` |
| `task.ts` | 43 | `.akrctx/tasks` |
| `judge-enforcement.ts` | 140 | `.akrctx/config.json` |
| `judge-snapshot.ts` | 26 | `.akrctx/config.json` |
| `template-apply.ts` | 231 | `.akrctx/config.json` |
| `upgrade.ts` | 121 | `.akrctx/config.json` |

`config.ts:21` defines `configPath` but doesn't export it, and other modules don't import from there.

## Root Cause

No single source of truth for akrctx directory structure. Each module that needs a path constructs it inline, leading to:
- Duplication (same string in 7+ files)
- Drift risk (if the directory structure changes, many files need updates)
- Inconsistency (some use variables, some hardcode)

## Solution

1. Export path constants from `config.ts`:

```typescript
// config.ts
export const AKRCTX_ROOT = ".akrctx";
export const CONFIG_PATH = `${AKRCTX_ROOT}/config.json`;
export const POLICY_PATH = `${AKRCTX_ROOT}/policy.json`;
export const TASKS_ROOT = `${AKRCTX_ROOT}/tasks`;
export const LOCAL_ROOT = `${AKRCTX_ROOT}/local`;
```

2. Update all files to import these constants instead of hardcoding:

```typescript
// Before
const configPath = ".akrctx/config.json";

// After  
import { CONFIG_PATH } from "./config.js";
```

## Validation

```bash
# Verify no hardcoded paths remain
grep -r '"\.akrctx/' src/ --include="*.ts" | grep -v "import.*config"
# Should only show constant definitions, not usages

# Verify all tests pass
pnpm test
```

## Out Of Scope

- Changing the actual directory structure
- Moving other constants (like template paths) — focus on config/policy/tasks only

## Acceptance Criteria

- [ ] All `.akrctx/` path literals centralized to `config.ts`
- [ ] No hardcoded path strings remain in consuming files
- [ ] All existing tests pass
- [ ] No functional changes

## Clarifications

### Session 2026-08-18

- Only **path construction** is centralized. Occurrences inside user-facing message strings keep
  their literal text. Most `.akrctx/policy.json` and `.akrctx/config.json` hits in `doctor.ts`
  (lines 259-295, 312, 361-379) are message text, and replacing them with a template
  concatenation is harder to read than the literal it replaces, for no structural gain.
- `manifestPath` (`src/manifest.ts:7`) **joins the new constants**. Leaving it where it is would
  create two homes for the same kind of constant, which is the defect this task exists to remove.
- If exporting from `config.ts` produces an import cycle, the constants move to a **leaf module**
  with no imports of its own. A dynamic import is not an acceptable workaround; the codebase
  already has one at `judge-snapshot.ts:754` and one is enough.

## Open Questions

- None recorded yet.
