import { describe, expect, it } from "vitest";
import { JUDGE_SCHEMA_VERSION, validateRecord } from "../src/judge-enforcement.js";
import { claudeImplementerFile, codexImplementerFile, copilotImplementerFile } from "../src/templates/implementer.js";
import { judgeContractFiles } from "../src/templates/judge-contract.js";
import { claudeJudgeFile, codexJudgeFile, copilotJudgeFile, judgeExampleRecord } from "../src/templates/judge.js";

const REVIEW_SCHEMA_PATH = ".akrctx/judge/schemas/review.schema.json";

const judgeRenderers = {
  claude: claudeJudgeFile,
  copilot: copilotJudgeFile,
  codex: codexJudgeFile,
} as const;

const implementerRenderers = {
  claude: claudeImplementerFile,
  copilot: copilotImplementerFile,
  codex: codexImplementerFile,
} as const;

function onlyContent(record: Record<string, string>): string {
  const values = Object.values(record);
  expect(values).toHaveLength(1);
  const [content = ""] = values;
  return content;
}

describe("agent template renderings", () => {
  describe("judge", () => {
    it.each(Object.entries(judgeRenderers))(
      "%s rendering carries the review-policy instruction",
      (_target, renderer) => {
        const content = onlyContent(renderer());
        expect(content).toContain(".akrctx/review-policy.md");
        expect(content).toContain("additional review criteria");
        expect(content).toContain("capsule wins");
      },
    );

    it.each(Object.entries(judgeRenderers))(
      "%s rendering contains no raw backtick in the TOML block",
      (_target, renderer) => {
        const content = onlyContent(renderer());
        if (_target === "codex") {
          expect(content).not.toMatch(/developer_instructions = """[\s\S]*`[\s\S]*"""/);
        }
      },
    );

    it("embedded example record validates against the same validator judge verify uses", () => {
      const example = JSON.parse(judgeExampleRecord);
      expect(validateRecord(example)).toEqual([]);
      expect(example.schemaVersion).toBe(JUDGE_SCHEMA_VERSION);
      expect(example.scope.schemaVersion).toBe(JUDGE_SCHEMA_VERSION);
      const testEntry = example.tests[0];
      expect(Object.keys(testEntry).sort()).toEqual(["command", "evidence", "status"]);
    });

    it("shipped schema accepts the optional independent field the judge is told to emit", () => {
      const schema = JSON.parse(judgeContractFiles[REVIEW_SCHEMA_PATH] ?? "{}");
      expect(schema.properties.independent).toEqual({
        type: "boolean",
        description: expect.stringContaining("Absent means true"),
      });
      expect(schema.required).not.toContain("independent");

      const example = JSON.parse(judgeExampleRecord);
      expect(validateRecord({ ...example, independent: false })).toEqual([]);
      expect(validateRecord({ ...example, independent: true })).toEqual([]);
    });

    it("evidence belongs to a tests entry and is rejected at the top level", () => {
      const schema = JSON.parse(judgeContractFiles[REVIEW_SCHEMA_PATH] ?? "{}");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.evidence).toBeUndefined();
      expect(schema.properties.tests.items.properties.evidence).toEqual({ type: "string" });

      const example = JSON.parse(judgeExampleRecord);
      expect(validateRecord({ ...example, evidence: "summary" })).not.toEqual([]);
    });

    it.each(Object.entries(judgeRenderers))(
      "%s rendering enumerates the accepted top-level keys",
      (_target, renderer) => {
        const content = onlyContent(renderer());
        expect(content).toContain("The top level accepts exactly these keys and no others");
        expect(content).toContain("entry and never at the top level");
      },
    );

    it.each(Object.entries(judgeRenderers))(
      "%s rendering carries the embedded example record verbatim",
      (_target, renderer) => {
        const content = onlyContent(renderer());
        expect(content).toContain(judgeExampleRecord);
        expect(content).not.toContain('"notes"');
        expect(content).toContain('"evidence"');
        expect(content).toContain('"independent": false');
      },
    );
  });

  describe("implementer", () => {
    it.each(Object.entries(implementerRenderers))(
      "%s rendering carries the review-policy instruction",
      (_target, renderer) => {
        const content = onlyContent(renderer());
        expect(content).toContain(".akrctx/review-policy.md");
        expect(content).toContain("Build against its entries");
        expect(content).toContain("capsule wins");
      },
    );

    it.each(Object.entries(implementerRenderers))(
      "%s rendering contains no raw backtick in the TOML block",
      (_target, renderer) => {
        const content = onlyContent(renderer());
        if (_target === "codex") {
          expect(content).not.toMatch(/developer_instructions = """[\s\S]*`[\s\S]*"""/);
        }
      },
    );
  });
});
