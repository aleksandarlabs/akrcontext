import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readConfig, writeConfig } from "./config.js";
import { detectTargets } from "./detect.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import { neutralRequired, protectedFiles, targetRequired } from "./harness-files.js";
import { runInit } from "./init.js";
import {
  agentSetupTemplate,
  defaultConfig,
  defaultPolicy,
  gapsTemplate,
  recommendationsTemplate,
} from "./templates.js";
import {
  type CommandOptions,
  type DoctorResult,
  type Profile,
  type Suggestion,
  type Target,
  type WikiLintResult,
  profiles,
} from "./types.js";
import { CLI_VERSION } from "./version.js";
import { lintWiki } from "./wiki-lint.js";

export async function runDoctor(options: CommandOptions): Promise<DoctorResult> {
  const cwd = options.cwd ?? process.cwd();
  const initial = await diagnose(cwd, options);

  if (!options.fix || !initial.installed) {
    return initial;
  }

  const fixed: string[] = [];

  // Re-create missing harness files for installed targets.
  const initResult = await runInit({
    ...options,
    target: initial.installedTargets[0] ?? "codex",
    profile: await readProfile(cwd),
  });
  for (const write of initResult.writes) {
    if (write.kind === "create") fixed.push(write.path);
  }

  // Merge missing config keys with defaults.
  const config = await readConfig(cwd);
  if (config) {
    const normalized = normalizeConfigForFix(config);
    await writeConfig(cwd, normalized, options.dryRun);
    if (!options.dryRun) fixed.push(".akrctx/config.json");
  }

  // Merge missing policy keys with defaults.
  const policyFixed = await fixPolicy(cwd, options.dryRun);
  if (policyFixed) fixed.push(".akrctx/policy.json");

  // Re-run diagnosis after fixes and report what changed.
  const final = await diagnose(cwd, options);
  return { ...final, fixed: Array.from(new Set(fixed)) };
}

async function readProfile(cwd: string): Promise<Profile> {
  const config = await readConfig(cwd);
  return config?.profile && profiles.includes(config.profile as Profile) ? (config.profile as Profile) : "default";
}

function normalizeConfigForFix(config: import("./types.js").akrctxConfig): import("./types.js").akrctxConfig {
  const base = defaultConfig(config.targets.length ? config.targets : ["codex"], config.profile);
  return {
    ...base,
    ...config,
    sourceOfTruth: ".akrctx",
    createdBy: "akrctx",
    defaults: {
      ...base.defaults,
      ...config.defaults,
      allowedWorkflows: config.defaults?.allowedWorkflows ?? base.defaults.allowedWorkflows,
    },
    workflowRules: {
      ...base.workflowRules,
      ...config.workflowRules,
    },
  };
}

async function fixPolicy(cwd: string, dryRun?: boolean): Promise<boolean> {
  const policyPath = path.join(cwd, ".akrctx/policy.json");
  if (!(await pathExists(policyPath))) return false;
  try {
    const raw = JSON.parse(await readFile(policyPath, "utf8"));
    const profile = policyProfile(raw.profile);
    const expected = defaultPolicy(profile);
    const merged: Record<string, unknown> = { version: expected.version, profile };

    for (const key of Object.keys(expected)) {
      if (key === "profile") continue;
      const expectedValue = expected[key as keyof typeof expected];
      if (Array.isArray(expectedValue)) {
        const existing = Array.isArray(raw[key]) ? raw[key] : [];
        merged[key] = Array.from(new Set([...existing, ...expectedValue]));
      } else if (typeof expectedValue === "object" && expectedValue !== null) {
        merged[key] = { ...(expectedValue as object), ...(typeof raw[key] === "object" ? raw[key] : {}) };
      } else {
        merged[key] = raw[key] ?? expectedValue;
      }
    }

    if (!dryRun) {
      await writeFile(policyPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    }
    return true;
  } catch {
    return false;
  }
}

async function diagnose(cwd: string, options: CommandOptions): Promise<DoctorResult> {
  const detection = await detectTargets(cwd);
  const installedTargets = await getInstalledTargets(cwd);
  const missing = await getMissing(cwd, [
    ...neutralRequired,
    ...installedTargets.flatMap((target) => targetRequired[target]),
  ]);
  const { gaps: configGaps, installedVersion } = await getConfigGaps(cwd);
  const policyGaps = await getPolicyGaps(cwd);
  const conflicts = await getInstructionConflicts(cwd);
  const installed = await pathExists(path.join(cwd, ".akrctx/config.json"));
  const judgeGap = await getJudgeGap(cwd);
  const wikiLint = installed ? await lintWiki(cwd) : { brokenLinks: [], orphans: [], missingTimestamps: [] };
  const wikiLintMissing = [
    ...wikiLint.brokenLinks.map((issue) => `${issue.file} — ${issue.message}`),
    ...wikiLint.missingTimestamps.map((issue) => `${issue.file} — ${issue.message}`),
  ];
  const allMissing = [...missing, ...configGaps, ...policyGaps, ...wikiLintMissing];
  const suggestions: Suggestion[] = [
    ...buildSuggestions(installed, installedTargets, allMissing, conflicts, installedVersion, judgeGap),
    ...(wikiLint.orphans.length
      ? [{ text: `Wiki orphan pages: ${wikiLint.orphans.join(", ")}`, severity: "info" as const }]
      : []),
  ];
  const readiness = scoreReadiness(installed, installedTargets, allMissing, conflicts);

  const result: DoctorResult = {
    installed,
    readiness,
    detectedTargets: detection.detected,
    installedTargets,
    missing: allMissing,
    conflicts,
    suggestions,
    wikiLint,
  };

  await writeDoctorWiki(cwd, result, { missing, configGaps, policyGaps }, wikiLint, options);
  return result;
}

async function getPolicyGaps(cwd: string): Promise<string[]> {
  const policyPath = path.join(cwd, ".akrctx/policy.json");
  if (!(await pathExists(policyPath))) return [];

  try {
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    const profile = policyProfile(policy.profile);
    const expected = defaultPolicy(profile);
    const gaps: string[] = [];

    if (policy.profile !== undefined && profile !== policy.profile) {
      gaps.push(".akrctx/policy.json — profile must be default, strict, or regulated");
    }

    if (policy.mergeStrategy !== expected.mergeStrategy) {
      gaps.push(".akrctx/policy.json — mergeStrategy must be preserve-and-suggest");
    }

    for (const file of expected.protectedFiles) {
      if (!arrayIncludes(policy.protectedFiles, file)) {
        gaps.push(`.akrctx/policy.json — protectedFiles missing ${file}`);
      }
    }

    for (const pattern of expected.blockedReadPatterns) {
      if (!arrayIncludes(policy.blockedReadPatterns, pattern)) {
        gaps.push(`.akrctx/policy.json — blockedReadPatterns missing ${pattern}`);
      }
    }

    if (policy.contextBudget?.rootInstructions !== expected.contextBudget.rootInstructions) {
      gaps.push(".akrctx/policy.json — contextBudget.rootInstructions must be minimal");
    }
    if (policy.contextBudget?.loadWorkflowsOnDemand !== true) {
      gaps.push(".akrctx/policy.json — contextBudget.loadWorkflowsOnDemand must be true");
    }
    if (policy.contextBudget?.doNotReadAllByDefault !== true) {
      gaps.push(".akrctx/policy.json — contextBudget.doNotReadAllByDefault must be true");
    }

    for (const [key, value] of Object.entries(expected.enforcement)) {
      if (policy.enforcement?.[key] !== value) {
        gaps.push(`.akrctx/policy.json — enforcement.${key} must be ${String(value)}`);
      }
    }

    for (const key of Object.keys(expected.writePolicy)) {
      if (!Array.isArray(policy.writePolicy?.[key]) || policy.writePolicy[key].length === 0) {
        gaps.push(`.akrctx/policy.json — writePolicy.${key} must list allowed paths`);
      }
    }

    return gaps;
  } catch {
    return [".akrctx/policy.json — invalid JSON (run akrctx init to regenerate)"];
  }
}

function arrayIncludes(value: unknown, expected: string): boolean {
  return Array.isArray(value) && value.includes(expected);
}

function policyProfile(value: unknown): Profile {
  return profiles.includes(value as Profile) ? (value as Profile) : "default";
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

async function getConfigGaps(cwd: string): Promise<{ gaps: string[]; installedVersion?: string }> {
  const configPath = path.join(cwd, ".akrctx/config.json");
  if (!(await pathExists(configPath))) return { gaps: [] };
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
    return { gaps, installedVersion: config.installedVersion };
  } catch {
    return { gaps: [".akrctx/config.json — invalid JSON (run akrctx init to regenerate)"] };
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

async function getJudgeGap(cwd: string): Promise<string | undefined> {
  const configPath = path.join(cwd, ".akrctx/config.json");
  if (!(await pathExists(configPath))) return undefined;
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (config.judge?.enabled !== true) return undefined;
    const judgeFiles = [
      ".claude/agents/akrctx-judge.md",
      ".github/agents/akrctx-judge.agent.md",
      ".codex/agents/akrctx-judge.toml",
    ];
    const anyPresent = await Promise.all(judgeFiles.map((f) => pathExists(path.join(cwd, f)))).then((r) =>
      r.some(Boolean),
    );
    if (!anyPresent) return "`judge.enabled` is true but no judge agent files found. Run `akrctx judge enable`.";
  } catch {
    // ignore
  }
  return undefined;
}

function buildSuggestions(
  installed: boolean,
  installedTargets: Target[],
  missing: string[],
  conflicts: string[],
  installedVersion?: string,
  judgeGap?: string,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (!installed) {
    suggestions.push({
      text: "akrctx is not installed. Run `akrctx init --target codex` (or choose interactively with `akrctx init`).",
      severity: "error",
    });
    return suggestions;
  }

  if (installedTargets.length === 0) {
    suggestions.push({
      text: "No target adapter found. Run `akrctx init --target <target>` to install one (codex, claude, copilot, or pi).",
      severity: "error",
    });
  }

  if (missing.length > 0) {
    suggestions.push({
      text: `${missing.length} file(s) missing. Run \`akrctx init --target ${installedTargets[0] ?? "codex"}\` to restore them.`,
      severity: "error",
    });
  }

  if (conflicts.length > 0) {
    suggestions.push({
      text: "Pending merge files exist. Open your agent and ask it to compare the existing instructions with the suggested file and propose a human-approved merge.",
      severity: "error",
    });
  }

  if (judgeGap) {
    suggestions.push({ text: judgeGap, severity: "error" });
  }

  if (installedVersion && installedVersion !== CLI_VERSION) {
    suggestions.push({
      text: `Harness was installed with akrctx v${installedVersion}. Current CLI is v${CLI_VERSION}. Run \`akrctx upgrade\` to update skill files.`,
      severity: "warning",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      text: 'Setup is complete. You can create a task capsule with `akrctx task "<description>"`.',
      severity: "info",
    });
  }

  return suggestions;
}

function scoreReadiness(
  installed: boolean,
  installedTargets: Target[],
  missing: string[],
  conflicts: string[],
): number {
  if (!installed) return 0;

  let score = 100;
  if (installedTargets.length === 0) score -= 25;
  score -= Math.min(missing.length, 20) * 5;
  score -= Math.min(conflicts.length, 4) * 10;
  return Math.max(0, Math.min(100, score));
}

async function writeDoctorWiki(
  cwd: string,
  result: DoctorResult,
  gapGroups: { missing: string[]; configGaps: string[]; policyGaps: string[] },
  wikiLint: WikiLintResult,
  options: CommandOptions,
): Promise<void> {
  const sections = [
    { heading: "Missing files", items: gapGroups.missing },
    { heading: "Config gaps", items: gapGroups.configGaps },
    { heading: "Policy gaps", items: gapGroups.policyGaps },
  ];

  const wikiOptions = {
    dryRun: options.dryRun,
    force: true,
    reason: "Doctor readiness report.",
  };

  await Promise.all([
    writePlannedFile(cwd, ".akrctx/wiki/agent-setup.md", agentSetupTemplate(result), wikiOptions),
    writePlannedFile(cwd, ".akrctx/wiki/gaps.md", gapsTemplate(sections, wikiLint), wikiOptions),
    writePlannedFile(cwd, ".akrctx/wiki/recommendations.md", recommendationsTemplate(result.suggestions), wikiOptions),
  ]);
}
