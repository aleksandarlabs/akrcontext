const json = (value: unknown) => JSON.stringify(value, null, 2);

const reviewSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "akrctx-judge-review-v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "taskId", "scope", "verdict", "tests", "issues", "reviewedAt"],
  properties: {
    schemaVersion: { const: 1 },
    taskId: { type: "string", pattern: "^TASK-[0-9]+$" },
    scope: {
      type: "object",
      additionalProperties: false,
      required: [
        "schemaVersion",
        "taskId",
        "base",
        "candidate",
        "baseCommit",
        "candidateCommit",
        "changedFiles",
        "taskDigest",
        "changeDigest",
        "scopeDigest",
      ],
      properties: {
        schemaVersion: { const: 1 },
        taskId: { type: "string", pattern: "^TASK-[0-9]+$" },
        base: { type: "string", minLength: 1 },
        candidate: { type: "string", minLength: 1 },
        baseCommit: { type: "string", pattern: "^[0-9a-f]{40,64}$" },
        candidateCommit: { type: "string", pattern: "^[0-9a-f]{40,64}$" },
        changedFiles: { type: "array", items: { type: "string" }, uniqueItems: true },
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
};

export const judgeContractFiles: Record<string, string> = {
  ".akrctx/judge/README.md": `# Judge Enforcement Contract

The judge first runs \`akrctx judge scope TASK-XXX --base <ref> --candidate <ref|WORKTREE> --json\` and copies that exact scope into its review record. A trusted caller saves the judge's JSON output under \`.akrctx/local/judge/\`; the read-only judge does not write it itself.

Before using an approval, run \`akrctx judge verify <review.json>\`. Verification checks the record shape and recomputes SHA-256 digests for the task capsule and exact code boundary. Any code or task change invalidates the approval. This binds a verdict to evidence; it does not cryptographically prove which model produced the verdict.
`,
  ".akrctx/judge/schemas/review.schema.json": json(reviewSchema),
};
