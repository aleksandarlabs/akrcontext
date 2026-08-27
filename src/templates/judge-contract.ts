import { JUDGE_SCHEMA_VERSION } from "../judge-enforcement.js";

const json = (value: unknown) => JSON.stringify(value, null, 2);

export const JUDGE_SCHEMA_ID = `akrctx-judge-review-v${JUDGE_SCHEMA_VERSION}`;

const reviewSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: JUDGE_SCHEMA_ID,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "taskId", "scope", "verdict", "tests", "issues", "reviewedAt"],
  properties: {
    schemaVersion: { const: JUDGE_SCHEMA_VERSION },
    taskId: { type: "string", pattern: "^TASK-[0-9]+$" },
    scope: {
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "cliVersion",
        "taskId",
        "base",
        "candidate",
        "baseCommit",
        "candidateCommit",
        "changedFiles",
        "excludedPaths",
        "includedTaskIds",
        "taskDigest",
        "changeDigest",
        "scopeDigest",
      ],
      properties: {
        schemaVersion: { const: JUDGE_SCHEMA_VERSION },
        cliVersion: { type: "string", minLength: 1 },
        taskId: { type: "string", pattern: "^TASK-[0-9]+$" },
        base: { type: "string", minLength: 1 },
        candidate: { type: "string", minLength: 1 },
        baseCommit: { type: "string", pattern: "^[0-9a-f]{40,64}$" },
        candidateCommit: { type: "string", pattern: "^[0-9a-f]{40,64}$" },
        changedFiles: { type: "array", items: { type: "string" }, uniqueItems: true },
        excludedPaths: { type: "array", items: { type: "string" }, uniqueItems: true },
        includedTaskIds: { type: "array", items: { type: "string", pattern: "^TASK-[0-9]+$" }, uniqueItems: true },
        taskDigest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
        changeDigest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
        scopeDigest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
      },
    },
    verdict: { enum: ["APPROVED", "NEEDS_CHANGES", "BLOCKED"] },
    tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["command", "status"],
        properties: {
          command: { type: "string", minLength: 1 },
          status: { enum: ["passed", "failed", "not-run"] },
          evidence: { type: "string" },
        },
      },
    },
    issues: { type: "array", items: { type: "string" } },
    reviewedAt: { type: "string", format: "date-time" },
    independent: {
      type: "boolean",
      description:
        "Whether the reviewer was independent of the implementation. Absent means true. Set false when the reviewer is the same session/agent that implemented or runs on a host with no subagent isolation (Pi).",
    },
  },
  allOf: [
    {
      if: { properties: { verdict: { const: "APPROVED" } }, required: ["verdict"] },
      // biome-ignore lint/suspicious/noThenProperty: JSON Schema if/then keyword, not a thenable
      then: {
        properties: {
          tests: {
            contains: { properties: { status: { const: "passed" } }, required: ["status"] },
          },
          issues: { maxItems: 0 },
        },
      },
    },
  ],
};

export const judgeContractFiles: Record<string, string> = {
  ".akrctx/judge/README.md": `# Judge Enforcement Contract

The trusted caller normally captures \`akrctx judge snapshot TASK-XXX --base <ref>\` before invoking the judge. Capture creates an immutable ignored local copy without committing, staging, stashing, checking out, creating refs, or changing live files. The private repository is shallow, policy-blocked paths are absent from its reviewable worktree, local Node dependencies are copied instead of linked when present, and \`akrctx judge prune --keep <n>\` provides dry-run-first retention. The judge then runs \`akrctx judge scope TASK-XXX --base <ref> --candidate SNAPSHOT:<id> --json\` and copies that exact scope into its review record. Commit and legacy \`WORKTREE\` candidates remain supported.

Scope and snapshot capture fail closed when changed files include a different task capsule under \`.akrctx/tasks/TASK-YYY-*\`. The error lists every foreign task ID and path; isolate the worktree or explicitly repeat \`--include-task TASK-YYY\` on \`judge scope\` or \`judge snapshot\`. Explicit inclusions are recorded in \`scope.includedTaskIds\` and bound to \`scopeDigest\`; catch-up snapshots preserve the parent's decision. Other changed files remain in the boundary — akrctx does not infer or silently omit source files.

Before using an approval, run \`akrctx judge verify <review.json> --run-tests\`. Verification checks the record shape and recomputes SHA-256 digests for the task capsule and exact code boundary. A snapshot approval remains valid when the live workspace moves; tampering with the snapshot or any catch-up ancestor invalidates it. \`akrctx judge current <review.json>\` first rejects an invalid or non-approved record, then reports whether live content is \`CURRENT\`, has \`NEWER_CHANGES\`, or \`DIVERGED\`. This binds a verdict to evidence; it does not cryptographically prove which model produced the verdict.

An \`APPROVED\` verdict additionally requires evidence and coherence:

- at least one entry in \`tests\` with \`status: "passed"\` — an approval that ran nothing is not an approval
- an empty \`issues\` array — a verdict cannot approve and report unresolved defects at the same time

A \`failed\` entry in \`tests\` invalidates the record under any verdict. If validation cannot run at all, the correct verdict is \`BLOCKED\`, not \`APPROVED\`.

When the capsule's \`task.md\` declares commands in a fenced block under \`## Validation\`, at least one of them must be the command that passed. A judge cannot satisfy the evidence rule with a command it invented. If the section exists but its block is empty or malformed, the capsule is unfinished and \`APPROVED\` is rejected; only capsules with no \`## Validation\` section at all fall back to the weaker rule.

## Independent re-execution

\`akrctx judge verify <review.json> --run-tests\` re-runs the capsule-declared commands the record claims passed, instead of trusting the claim. It requires a snapshot candidate — a \`WORKTREE\` or commit-ref record is refused — and it never executes without operator approval: the CLI prints the declared commands and asks in a terminal, or requires \`--approve-commands\` once per command in declared order when headless. Commands run in a disposable copy outside the live project whose dependencies are materialised from the committed lockfile, not inherited from the snapshot's private copy, so re-execution rests on the lockfile rather than on bytes inside the reviewed artifact; if the boundary declares dependencies but has no lockfile, or the install fails, verification fails with a named reason and never falls back to the snapshot's copy. The disposable copy cannot corrupt the immutable snapshot through ordinary relative writes. Verification still fails if validation rewrites tracked content. This is process isolation for normal tooling, not an OS sandbox for an intentionally malicious command with absolute paths.

Run it from the trusted caller, before any handoff. The judge and the comprehension evaluator are read-only by contract and must not pass this flag.

## What this does and does not prove

It proves the verdict is bound to a specific task capsule and code boundary, that the boundary still matches the repository, and — with \`--run-tests\` — that the declared validation really passes and left the boundary intact.

The snapshot integrity check fingerprints every tracked and untracked-but-not-ignored path by its content *and* its change-time (ctime), so a file changed and restored to its original bytes — or a file created and deleted inside a tracked directory — is still reported as a modification after capture, not only a final content mismatch. The inode number is deliberately not part of the fingerprint: on FUSE and some network mounts it is synthesized by the daemon and drifts over time even when nothing changed, which would make an honest snapshot permanently unreviewable. Ignored paths are normally outside this manifest; fixed generated artifacts explicitly registered by snapshot capture are the exception and carry separate content and write-integrity digests. Dependencies remain untrusted, which is why \`--run-tests\` materialises them from the lockfile instead of trusting the snapshot's copy. This is tamper-evident bookkeeping, not a sandbox — a determined reviewer with shell access can still damage things akrctx cannot see.

It does not prove which model produced the verdict. The judge is read-only by design, so a trusted caller writes the record, and that caller could in principle write one the judge never produced. Nothing in this repository can close that gap. The mitigation is human: the judge's prose review appears in the session transcript, and the developer reads it. Treat a verified record as tamper-evident bookkeeping, not as an unforgeable signature.

\`--run-tests\` narrows that gap without closing it. A review record can never inject a command, because only declared commands run. The capsule itself is normally written by the primary agent, so the declared commands are agent-authored project content — which is why the approval prompt exists: the human, not the capsule, decides what executes. That makes the operator the last barrier rather than a compromised primary agent, but it is only as strong as the attention paid to the list. Read it before approving work you did not supervise.

## Withheld paths

Files matching \`blockedReadPatterns\` in \`policy.json\` are excluded from the diff and listed by path in \`scope.excludedPaths\`. Their contents are never read or fingerprinted. The path list is part of the boundary digest, so a secret appearing or disappearing still invalidates a stale approval. A judge that cannot review meaningfully without those files should report \`BLOCKED\`.
`,
  ".akrctx/judge/schemas/review.schema.json": json(reviewSchema),
};
