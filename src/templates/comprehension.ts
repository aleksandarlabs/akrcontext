const json = (value: unknown) => JSON.stringify(value, null, 2);

const scopeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "akrctx-comprehension-scope-v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "taskId", "base", "candidate", "files", "significance", "signals", "decision"],
  properties: {
    schemaVersion: { const: 1 },
    taskId: { type: "string", pattern: "^TASK-[0-9]+$" },
    base: { type: "string", minLength: 1 },
    candidate: { type: "string", minLength: 1 },
    files: { type: "array", items: { type: "string" }, uniqueItems: true },
    tests: { type: "array", items: { type: "string" } },
    significance: { enum: ["surface", "logic", "architectural", "critical"] },
    signals: { type: "array", items: { type: "string" }, minItems: 1 },
    decision: { enum: ["skip", "checkpoint"] },
  },
};

const rubricSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "akrctx-comprehension-rubric-v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "createdBeforeAnswers", "questions"],
  properties: {
    schemaVersion: { const: 1 },
    createdBeforeAnswers: { const: true },
    questions: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "dimension",
          "question",
          "requiredConcepts",
          "acceptableVariants",
          "criticalMistakes",
          "evidence",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          dimension: { enum: ["factual", "architectural", "risk"] },
          question: { type: "string", minLength: 1 },
          requiredConcepts: { type: "array", items: { type: "string" }, minItems: 1 },
          acceptableVariants: { type: "array", items: { type: "string" } },
          criticalMistakes: { type: "array", items: { type: "string" } },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["file"],
              properties: {
                file: { type: "string" },
                symbol: { type: "string" },
                line: { type: "integer", minimum: 1 },
              },
            },
          },
        },
      },
    },
  },
};

const resultSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "akrctx-comprehension-result-v1",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "taskId", "status", "evaluationMode", "assistance", "completedAt"],
  properties: {
    schemaVersion: { const: 1 },
    taskId: { type: "string", pattern: "^TASK-[0-9]+$" },
    status: { enum: ["VERIFIED", "ASSISTED", "UNVERIFIED", "INVALID_GATE", "SKIPPED", "DEFERRED"] },
    evaluationMode: { enum: ["independent", "fresh-context"] },
    assistance: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    completedAt: { type: "string", format: "date-time" },
  },
};

export const comprehensionFiles: Record<string, string> = {
  ".akrctx/comprehension/README.md": `# Comprehension Gate Contract

Tracked schemas live here; personal sessions never do. A local session uses:

\`\`\`txt
.akrctx/local/comprehension/TASK-XXX/<session-id>/
  scope.json
  rubric.json
  transcript.md
  result.json
  learning-report.md
\`\`\`

Create \`rubric.json\` before collecting any developer answer. Keep expected answers private until the session ends. Validate JSON artifacts against the schemas in this directory. \`learning-report.md\` may contain the Mermaid change map, test matrix, and learning summary. Personal session files are ignored by Git and must never be staged.
`,
  ".akrctx/comprehension/schemas/scope.schema.json": json(scopeSchema),
  ".akrctx/comprehension/schemas/rubric.schema.json": json(rubricSchema),
  ".akrctx/comprehension/schemas/result.schema.json": json(resultSchema),
};
