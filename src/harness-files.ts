import type { Target } from "./types.js";

/**
 * The files that make up a task capsule, in the order they are meant to be read.
 *
 * This list is the single source of truth. `createJudgeScope` refuses to compute a
 * boundary when any of them is missing, so a shipped `_template` that omitted one made
 * `akrctx judge scope` fail on a capsule the harness itself had produced. Derive from
 * this constant rather than repeating the names.
 */
export const capsuleFiles = [
  "task.md",
  "context.md",
  "plan.md",
  "acceptance-criteria.md",
  "review-checklist.md",
] as const;

export type CapsuleFile = (typeof capsuleFiles)[number];

/**
 * Content for every capsule file, keyed by name.
 *
 * Producers are typed with this rather than listing names inline, so adding an entry to
 * `capsuleFiles` fails the build everywhere the content has to be supplied — the shipped
 * `_template` and `akrctx task` alike. Consumers that only check for presence can iterate
 * `capsuleFiles` directly.
 */
export type CapsuleContent = Record<CapsuleFile, string>;

export const neutralRequired = [
  ".akrctx/config.json",
  ".akrctx/manifest.json",
  ".akrctx/policy.json",
  ".akrctx/local/.gitignore",
  ".akrctx/judge/README.md",
  ".akrctx/judge/schemas/review.schema.json",
  ".akrctx/comprehension/README.md",
  ".akrctx/comprehension/schemas/scope.schema.json",
  ".akrctx/comprehension/schemas/rubric.schema.json",
  ".akrctx/comprehension/schemas/result.schema.json",
  ".akrctx/wiki/overview.md",
  ".akrctx/wiki/architecture.md",
  ".akrctx/wiki/conventions.md",
  ".akrctx/wiki/testing.md",
  ".akrctx/wiki/workflows.md",
  ".akrctx/wiki/decisions.md",
  ".akrctx/wiki/agent-setup.md",
  ".akrctx/wiki/gaps.md",
  ".akrctx/wiki/recommendations.md",
  ".akrctx/wiki/instruction-audit.md",
  ".akrctx/wiki/write-policy.md",
  ".akrctx/wiki/log.md",
  ".akrctx/wiki/index.md",
  ...capsuleFiles.map((file) => `.akrctx/tasks/_template/${file}`),
];

/** Given an installed target, the target reference file doctor should require. */
export function targetReferenceFile(target: Target): string {
  return `.akrctx/targets/${target}.md`;
}

export const targetRequired: Record<Target, string[]> = {
  codex: [
    "AGENTS.md",
    ".agents/skills/akrctx-init/SKILL.md",
    ".agents/skills/akrctx-doctor/SKILL.md",
    ".agents/skills/akrctx-task/SKILL.md",
    ".agents/skills/akrctx-review/SKILL.md",
    ".agents/skills/akrctx-workflow/SKILL.md",
    ".agents/skills/akrctx-write-policy/SKILL.md",
  ],
  claude: [
    "CLAUDE.md",
    ".claude/commands/akrctx-doctor.md",
    ".claude/commands/akrctx-task.md",
    ".claude/skills/akrctx-init/SKILL.md",
    ".claude/skills/akrctx-doctor/SKILL.md",
    ".claude/skills/akrctx-task/SKILL.md",
    ".claude/skills/akrctx-review/SKILL.md",
    ".claude/skills/akrctx-workflow/SKILL.md",
    ".claude/skills/akrctx-write-policy/SKILL.md",
  ],
  copilot: [
    ".github/copilot-instructions.md",
    ".github/instructions/akrctx.instructions.md",
    ".github/prompts/akrctx-doctor.prompt.md",
    ".github/prompts/akrctx-task.prompt.md",
    ".github/prompts/akrctx-workflow.prompt.md",
    ".github/prompts/akrctx-write-policy.prompt.md",
    ".github/skills/akrctx-init/SKILL.md",
    ".github/skills/akrctx-doctor/SKILL.md",
    ".github/skills/akrctx-task/SKILL.md",
    ".github/skills/akrctx-review/SKILL.md",
    ".github/skills/akrctx-workflow/SKILL.md",
    ".github/skills/akrctx-write-policy/SKILL.md",
  ],
  pi: [
    ".pi/prompts/akrctx-doctor.md",
    ".pi/prompts/akrctx-task.md",
    ".pi/prompts/akrctx-workflow.md",
    ".pi/prompts/akrctx-write-policy.md",
    ".pi/skills/akrctx-init/SKILL.md",
    ".pi/skills/akrctx-doctor/SKILL.md",
    ".pi/skills/akrctx-task/SKILL.md",
    ".pi/skills/akrctx-review/SKILL.md",
    ".pi/skills/akrctx-workflow/SKILL.md",
    ".pi/skills/akrctx-write-policy/SKILL.md",
  ],
};

/** Files that may be user-authored and must never be silently deleted. */
export const protectedFiles = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md", ".pi/README.md"];
