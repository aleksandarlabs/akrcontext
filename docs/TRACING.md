# Session tracing

Session tracing is opt-in (`akrctx trace enable`), observational, and fail-open. Hooks never
approve, block, or alter a host tool call. `akrctx trace report` derives its metrics from the
recorded lifecycle events; `--json` includes the per-session records.

## Privacy

The trace never stores shell commands, arguments, or file paths. A shell observation contains
only a safe executable label, a command digest used to correlate a declared validation command,
and lifecycle metadata. Blocked-path matching remains a boolean flag.

Shell effects are intentionally unclassified. `ls`, `find`, `cat`, and `git` are not treated as
read-only because redirections, flags, aliases, subcommands, and shell syntax can alter the tree.

## Per-session fields

`mutatedProject` is true only after a completed known write outside `.akrctx/`.

`capsuleBeforeFirstMutation` is trivalent:

- `true`: the first known project mutation followed a bound capsule and no possible earlier
  mutation obscures that order.
- `false`: the first known project mutation preceded the capsule binding.
- `null`: there is no known project mutation, or a possible mutation before binding makes the
  order unprovable. It is `unknown`, not a failure.

`unclassifiedShellBeforeBinding` counts distinct shell calls observed before binding. A matching
`PreToolUse` and `PostToolUse` with the same call id count once. Without an id, each `PreToolUse`
counts as one call and `PostToolUse` does not increment it; this avoids falsely pairing or double
counting concurrent anonymous calls. A post without its pre still makes the session uncertain,
but contributes zero to this count because no call was observed to start.

`capsuleComplete`, `validationDeclared`, and `validationObserved` are independent facts. An
unknown ordering never clears them. Validation still requires a successful post event with the
same call id and command digest as a declared validation command.

## Aggregate denominators

Complete sessions partition into three buckets:

| Bucket | Meaning |
| --- | --- |
| `mutating` | A known mutation outside `.akrctx/` occurred, including sessions with unknown ordering. |
| `uncertain` | No known mutation occurred, but an unclassified shell or unresolved write may have changed the tree. |
| `readOnly` | No known mutation occurred and no unobserved mutation is possible. |

`orderingKnown` and `orderingUnknown` partition `mutating` by whether
`capsuleBeforeFirstMutation` is boolean or `null`.

`capsuleBound`, `capsuleComplete`, `validationDeclared`, and `validationObserved` use every
known-mutating session as their denominator. `capsuleBeforeFirstMutation` uses only
`orderingKnown`; the human report renders an all-unknown ordering denominator as `unknown`,
never as `false` or `0%`.
