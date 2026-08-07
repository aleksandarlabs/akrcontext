# Plan

## Workflow

research-first

The fix is small in both candidate directions, but they diverge in philosophy (strict
audit + tracked files vs. tolerant audit + machine-local files). Resolve the Open
Question with the human before implementing.

## Steps

1. Confirm the chosen direction with the human (see task.md Open Questions).
2. If committing files: unignore `.codex/agents/` in `.gitignore`, add the generated
   files, and add a test asserting every config-required agent file is either tracked or
   regenerable-without-error. Verify `akrctx upgrade` still owns their content (manifest
   hashes keep distinguishing tool-written from user-edited).
3. If downgrading in doctor: in `src/doctor.ts`, when a missing agent file is itself
   gitignored in the current repo, emit an info-severity suggestion naming
   `akrctx judge enable` as the post-clone step, and cover it with a test using a temp
   dir with a `.gitignore`.
4. Run the validation command against a pristine checkout (see task.md).
