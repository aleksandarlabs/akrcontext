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

Before using an approval, run \`akrctx judge verify <review.json> --run-tests\`. Verification checks the record shape and recomputes SHA-256 digests for the task capsule and exact code boundary. A snapshot approval remains valid when the live workspace moves; tampering with the snapshot or any catch-up ancestor invalidates it. \`akrctx judge current <review.json>\` first rejects an invalid or non-approved record, then reports whether live content is \`CURRENT\`, has \`NEWER_CHANGES\`, or \`DIVERGED\`. This binds a verdict to evidence; it does not cryptographically prove which model produced the verdict.

An \`APPROVED\` verdict additionally requires evidence and coherence:

- at least one entry in \`tests\` with \`status: "passed"\` — an approval that ran nothing is not an approval
- an empty \`issues\` array — a verdict cannot approve and report unresolved defects at the same time

A \`failed\` entry in \`tests\` invalidates the record under any verdict. If validation cannot run at all, the correct verdict is \`BLOCKED\`, not \`APPROVED\`.

When the capsule's \`task.md\` declares commands in a fenced block under \`## Validation\`, at least one of them must be the command that passed. A judge cannot satisfy the evidence rule with a command it invented. If the section exists but its block is empty or malformed, the capsule is unfinished and \`APPROVED\` is rejected; only capsules with no \`## Validation\` section at all fall back to the weaker rule.

## Independent re-execution

\`akrctx judge verify <review.json> --run-tests\` re-runs the capsule-declared commands the record claims passed, instead of trusting the claim. Snapshot commands run in a disposable copy outside the live project, with private local Node dependencies when present, and cannot corrupt the immutable snapshot through ordinary relative writes. Verification still fails if validation rewrites tracked content. This is process isolation for normal tooling, not an OS sandbox for an intentionally malicious command with absolute paths.

Run it from the trusted caller, before any handoff. The judge and the comprehension evaluator are read-only by contract and must not pass this flag.

## What this does and does not prove

It proves the verdict is bound to a specific task capsule and code boundary, that the boundary still matches the repository, and — with \`--run-tests\` — that the declared validation really passes and left the boundary intact.

It does not prove which model produced the verdict. The judge is read-only by design, so a trusted caller writes the record, and that caller could in principle write one the judge never produced. Nothing in this repository can close that gap. The mitigation is human: the judge's prose review appears in the session transcript, and the developer reads it. Treat a verified record as tamper-evident bookkeeping, not as an unforgeable signature.

\`--run-tests\` narrows that gap without closing it. A review record can never inject a command, because only declared commands run. But the capsule itself is normally written by the primary agent, so the flag moves trust from the record to \`task.md\` rather than removing it. It is not a defence against a compromised primary agent, which could write both. Read \`task.md\` before running it on work you did not supervise.

## Withheld paths

Files matching \`blockedReadPatterns\` in \`policy.json\` are excluded from the diff and listed by path in \`scope.excludedPaths\`. Their contents are never read or fingerprinted. The path list is part of the boundary digest, so a secret appearing or disappearing still invalidates a stale approval. A judge that cannot review meaningfully without those files should report \`BLOCKED\`.
`,
  ".akrctx/judge/schemas/review.schema.json": json(reviewSchema),
};
