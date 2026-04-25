import path from "node:path";
import { pathExists } from "./fs-utils.js";
import type { DetectionResult, Target } from "./types.js";

const targetEvidence: Record<Target, string[]> = {
  codex: ["AGENTS.md", "AGENTS.override.md", ".codex", ".agents/skills"],
  claude: ["CLAUDE.md", ".claude"],
  copilot: [
    ".github/copilot-instructions.md",
    ".github/instructions",
    ".github/prompts",
    ".github/agents",
    ".github/skills",
  ],
  pi: [".pi"],
};

export async function detectTargets(cwd: string): Promise<DetectionResult> {
  const evidence = {
    codex: [] as string[],
    claude: [] as string[],
    copilot: [] as string[],
    pi: [] as string[],
  };

  for (const [target, candidates] of Object.entries(targetEvidence) as Array<[Target, string[]]>) {
    for (const candidate of candidates) {
      const absolute = path.join(cwd, candidate);
      // pathExists covers both files and directories via access(); isDirectory is redundant.
      if (await pathExists(absolute)) {
        evidence[target].push(candidate);
      }
    }
  }

  return {
    evidence,
    detected: (Object.keys(evidence) as Target[]).filter((target) => evidence[target].length > 0),
  };
}
