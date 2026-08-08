import { describe, expect, it } from "vitest";
import { JUDGE_SCHEMA_VERSION, validateRecord } from "../src/judge-enforcement.js";
import { claudeImplementerFile, codexImplementerFile, copilotImplementerFile } from "../src/templates/implementer.js";
import { claudeJudgeFile, codexJudgeFile, copilotJudgeFile, judgeExampleRecord } from "../src/templates/judge.js";

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
