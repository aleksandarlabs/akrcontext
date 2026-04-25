import path from "node:path";
import { readFile } from "node:fs/promises";
import { detectTargets } from "./detect.js";
import { neutralRequired, targetRequired, protectedFiles } from "./harness-files.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import type { CommandOptions, DoctorResult, Target } from "./types.js";

export async function runDoctor(options: CommandOptions): Promise<DoctorResult> {
  const cwd = options.cwd ?? process.cwd();
  const detection = await detectTargets(cwd);
  const installedTargets = await getInstalledTargets(cwd);
  const missing = await getMissing(cwd, [
    ...neutralRequired,
    ...installedTargets.flatMap((target) => targetRequired[target]),
  ]);
  const configGaps = await getConfigGaps(cwd);
  const conflicts = await getInstructionConflicts(cwd);
  const installed = await pathExists(path.join(cwd, ".akrctx/config.json"));
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
  const pairs = Object.entries(targetRequired) as Array<[Target, string[]]>;
  const results = await Promise.all(
    pairs.map(async ([target, files]) => {
      const presence = await Promise.all(files.map((file) => pathExists(path.join(cwd, file))));
      return presence.some(Boolean) ? target : null;
    }),
  );
  return results.filter((t): t is Target => t !== null);
}

async function getMissing(cwd: string, files: string[]): Promise<string[]> {
  const results = await Promise.all(
    files.map(async (file) => ({ file, exists: await pathExists(path.join(cwd, file)) })),
  );
  return results.filter((r) => !r.exists).map((r) => r.file);
}

async function getConfigGaps(cwd: string): Promise<string[]> {
  const configPath = path.join(cwd, ".akrctx/config.json");
  if (!(await pathExists(configPath))) return [];
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const gaps: string[] = [];
    if (!config.defaults?.workflow) gaps.push(".akrctx/config.json — missing defaults.workflow");
    if (!config.defaults?.allowedWorkflows) gaps.push(".akrctx/config.json — missing defaults.allowedWorkflows");
    if (typeof config.defaults?.requireTaskCapsule !== "boolean")
      gaps.push(".akrctx/config.json — missing defaults.requireTaskCapsule");
    if (typeof config.defaults?.requireWorkflowReason !== "boolean")
      gaps.push(".akrctx/config.json — missing defaults.requireWorkflowReason");
    if (!config.workflowRules) gaps.push(".akrctx/config.json — missing workflowRules");
    return gaps;
  } catch {
    return [".akrctx/config.json — invalid JSON (run akrctx init to regenerate)"];
  }
}

async function getInstructionConflicts(cwd: string): Promise<string[]> {
  const conflicts: string[] = [];
  for (const file of protectedFiles) {
    const suggested = suggestedFor(file);
    if ((await pathExists(path.join(cwd, file))) && (await pathExists(path.join(cwd, suggested)))) {
      conflicts.push(`${file} has a pending suggested merge: ${suggested}`);
    }
  }
  return conflicts;
}

function suggestedFor(relativePath: string): string {
  const ext = path.posix.extname(relativePath);
  const base = relativePath.slice(0, -ext.length);
  return `${base}.akrctx.suggested${ext}`;
}

function buildSuggestions(
  installed: boolean,
  installedTargets: Target[],
  missing: string[],
  conflicts: string[],
): string[] {
  const suggestions: string[] = [];

  if (!installed) {
    suggestions.push(
      "akrctx is not installed. Run `akrctx init --target codex` (or choose interactively with `akrctx init`).",
    );
    return suggestions;
  }

  if (installedTargets.length === 0) {
    suggestions.push(
      "No target adapter found. Run `akrctx init --target <target>` to install one (codex, claude, copilot, or pi).",
    );
  }

  if (missing.length > 0) {
    suggestions.push(
      `${missing.length} file(s) missing. Run \`akrctx init --target ${installedTargets[0] ?? "codex"}\` to restore them.`,
    );
  }

  if (conflicts.length > 0) {
    suggestions.push(
      "Pending merge files exist. Open your agent and ask it to compare the existing instructions with the suggested file and propose a human-approved merge.",
    );
  }

  if (suggestions.length === 0) {
    suggestions.push("Setup is complete. You can create a task capsule with `akrctx task \"<description>\"`.");
  }

  return suggestions;
}

function scoreReadiness(
  installed: boolean,
  installedTargets: Target[],
  missing: string[],
  conflicts: string[],
): number {
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

  await writePlannedFile(cwd, ".akrctx/wiki/agent-setup.md", report, {
    dryRun: options.dryRun,
    force: true,
    reason: "Doctor readiness report.",
  });
}
