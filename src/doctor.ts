import path from "node:path";
import { readFile } from "node:fs/promises";
import { detectTargets } from "./detect.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import type { CommandOptions, DoctorResult, Target } from "./types.js";

const neutralRequired = [
  ".contextforge/config.json",
  ".contextforge/policy.json",
  ".contextforge/wiki/overview.md",
  ".contextforge/wiki/architecture.md",
  ".contextforge/wiki/conventions.md",
  ".contextforge/wiki/testing.md",
  ".contextforge/wiki/workflows.md",
  ".contextforge/wiki/decisions.md",
  ".contextforge/wiki/agent-setup.md",
  ".contextforge/wiki/write-policy.md",
  ".contextforge/wiki/log.md",
  ".contextforge/tasks/_template/task.md",
  ".contextforge/tasks/_template/context.md",
  ".contextforge/tasks/_template/plan.md",
  ".contextforge/tasks/_template/review-checklist.md",
  ".contextforge/targets/codex.md",
  ".contextforge/targets/claude.md",
  ".contextforge/targets/copilot.md",
  ".contextforge/targets/pi.md",
];

const targetRequired: Record<Target, string[]> = {
  codex: [
    "AGENTS.md",
    ".agents/skills/contextforge-init/SKILL.md",
    ".agents/skills/contextforge-doctor/SKILL.md",
    ".agents/skills/contextforge-task/SKILL.md",
    ".agents/skills/contextforge-review/SKILL.md",
    ".agents/skills/contextforge-workflow/SKILL.md",
    ".agents/skills/contextforge-write-policy/SKILL.md",
  ],
  claude: [
    "CLAUDE.md",
    ".claude/commands/contextforge-doctor.md",
    ".claude/commands/contextforge-task.md",
    ".claude/skills/contextforge-init/SKILL.md",
    ".claude/skills/contextforge-doctor/SKILL.md",
    ".claude/skills/contextforge-task/SKILL.md",
    ".claude/skills/contextforge-review/SKILL.md",
    ".claude/skills/contextforge-workflow/SKILL.md",
    ".claude/skills/contextforge-write-policy/SKILL.md",
  ],
  copilot: [
    ".github/copilot-instructions.md",
    ".github/instructions/contextforge.instructions.md",
    ".github/prompts/contextforge-doctor.prompt.md",
    ".github/prompts/contextforge-task.prompt.md",
    ".github/prompts/contextforge-workflow.prompt.md",
    ".github/prompts/contextforge-write-policy.prompt.md",
  ],
  pi: [
    ".pi/prompts/contextforge-doctor.md",
    ".pi/prompts/contextforge-task.md",
    ".pi/prompts/contextforge-workflow.md",
    ".pi/prompts/contextforge-write-policy.md",
    ".pi/skills/contextforge-init/SKILL.md",
    ".pi/skills/contextforge-doctor/SKILL.md",
    ".pi/skills/contextforge-task/SKILL.md",
    ".pi/skills/contextforge-review/SKILL.md",
    ".pi/skills/contextforge-workflow/SKILL.md",
    ".pi/skills/contextforge-write-policy/SKILL.md",
  ],
};

export async function runDoctor(options: CommandOptions): Promise<DoctorResult> {
  const cwd = options.cwd ?? process.cwd();
  const detection = await detectTargets(cwd);
  const installedTargets = await getInstalledTargets(cwd);
  const missing = await getMissing(cwd, [...neutralRequired, ...installedTargets.flatMap((target) => targetRequired[target])]);
  const configGaps = await getConfigGaps(cwd);
  const conflicts = await getInstructionConflicts(cwd);
  const installed = await pathExists(path.join(cwd, ".contextforge/config.json"));
  const suggestions = buildSuggestions(installed, installedTargets, missing, conflicts);
  const readiness = scoreReadiness(installed, installedTargets, missing, conflicts);

  const result: DoctorResult = {
    installed,
    readiness,
    detectedTargets: detection.detected,
    installedTargets,
    missing: [...missing, ...configGaps],
    conflicts,
    suggestions,
  };

  await writeDoctorWiki(cwd, result, options);
  return result;
}

async function getInstalledTargets(cwd: string): Promise<Target[]> {
  const pairs: Array<[Target, string[]]> = Object.entries(targetRequired) as Array<[Target, string[]]>;
  const installed: Target[] = [];
  for (const [target, files] of pairs) {
    const present = await Promise.all(files.map((file) => pathExists(path.join(cwd, file))));
    if (present.some(Boolean)) installed.push(target);
  }
  return installed;
}

async function getMissing(cwd: string, files: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (const file of files) {
    if (!(await pathExists(path.join(cwd, file)))) missing.push(file);
  }
  return missing;
}

async function getConfigGaps(cwd: string): Promise<string[]> {
  const configPath = path.join(cwd, ".contextforge/config.json");
  if (!(await pathExists(configPath))) return [];
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const gaps: string[] = [];
    if (!config.defaults?.workflow) gaps.push(".contextforge/config.json defaults.workflow");
    if (!config.defaults?.allowedWorkflows) gaps.push(".contextforge/config.json defaults.allowedWorkflows");
    if (typeof config.defaults?.requireTaskCapsule !== "boolean") gaps.push(".contextforge/config.json defaults.requireTaskCapsule");
    if (typeof config.defaults?.requireWorkflowReason !== "boolean") gaps.push(".contextforge/config.json defaults.requireWorkflowReason");
    if (!config.workflowRules) gaps.push(".contextforge/config.json workflowRules");
    return gaps;
  } catch {
    return [".contextforge/config.json parseable JSON"];
  }
}

async function getInstructionConflicts(cwd: string): Promise<string[]> {
  const conflicts: string[] = [];
  const protectedFiles = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
  for (const file of protectedFiles) {
    const suggested = suggestedFor(file);
    if ((await pathExists(path.join(cwd, file))) && (await pathExists(path.join(cwd, suggested)))) {
      conflicts.push(`${file} has a ContextForge suggested merge file: ${suggested}`);
    }
  }
  return conflicts;
}

function suggestedFor(relativePath: string): string {
  const ext = path.posix.extname(relativePath);
  const base = relativePath.slice(0, -ext.length);
  return `${base}.contextforge.suggested${ext}`;
}

function buildSuggestions(installed: boolean, installedTargets: Target[], missing: string[], conflicts: string[]): string[] {
  const suggestions: string[] = [];
  if (!installed) suggestions.push("Run `contextforge init --target codex` or choose the target interactively.");
  if (installedTargets.length === 0) suggestions.push("Install at least one target adapter with `contextforge init --target <target>`.");
  if (missing.length > 0) suggestions.push("Run `contextforge init --target <target>` to add missing ContextForge files.");
  if (conflicts.length > 0) suggestions.push("Ask the chosen agent to compare existing instructions with suggested files and propose a human-approved merge.");
  if (suggestions.length === 0) suggestions.push("Setup is ready for task capsules and agent-specific briefs.");
  return suggestions;
}

function scoreReadiness(installed: boolean, installedTargets: Target[], missing: string[], conflicts: string[]): number {
  let score = installed ? 55 : 15;
  score += Math.min(installedTargets.length, 2) * 15;
  score -= Math.min(missing.length, 10) * 3;
  score -= Math.min(conflicts.length, 4) * 5;
  return Math.max(0, Math.min(100, score));
}

async function writeDoctorWiki(cwd: string, result: DoctorResult, options: CommandOptions): Promise<void> {
  const report = `# Agent Setup

Agent readiness: ${result.readiness}/100

## Detected Targets

${result.detectedTargets.length ? result.detectedTargets.map((target) => `- ${target}`).join("\n") : "- None"}

## Installed Targets

${result.installedTargets.length ? result.installedTargets.map((target) => `- ${target}`).join("\n") : "- None"}

## Missing Files

${result.missing.length ? result.missing.map((file) => `- ${file}`).join("\n") : "- None"}

## Human-Approved Merge Needed

${result.conflicts.length ? result.conflicts.map((conflict) => `- ${conflict}`).join("\n") : "- None"}

## Suggested Safe Next Steps

${result.suggestions.map((suggestion) => `- ${suggestion}`).join("\n")}
`;

  await writePlannedFile(cwd, ".contextforge/wiki/agent-setup.md", report, {
    dryRun: options.dryRun,
    force: true,
    reason: "Doctor readiness report.",
  });
}
