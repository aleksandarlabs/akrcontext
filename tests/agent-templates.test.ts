import { describe, expect, it } from "vitest";
import { claudeImplementerFile, codexImplementerFile, copilotImplementerFile } from "../src/templates/implementer.js";
import { claudeJudgeFile, codexJudgeFile, copilotJudgeFile } from "../src/templates/judge.js";

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
