import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { comprehensionAgentFilesByTarget, isLocalIgnoreContentSafe, localIgnorePath } from "./comprehension.js";
import { readConfig, writeConfig } from "./config.js";
import { detectTargets } from "./detect.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import { neutralRequired, protectedFiles, targetReferenceFile, targetRequired } from "./harness-files.js";
import { runInit } from "./init.js";
import {
  agentSetupTemplate,
  defaultConfig,
  defaultPolicy,
  gapsTemplate,
  localComprehensionIgnoreTemplate,
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

  // Re-create missing harness files for every installed target. Neutral
  // files (config.json, wiki, etc.) already exist and are preserved
  // idempotently by writePlannedFile since --force is not implied here.
  if (initial.installedTargets.length > 0) {
    const profile = await readProfile(cwd);
    for (const target of initial.installedTargets) {
      const initResult = await runInit({ ...options, target, profile, force: false, repair: true });
      for (const write of initResult.writes) {
        if (write.kind === "create") fixed.push(write.path);
      }
    }
  }

  // Merge missing config keys with defaults — only write and report "fixed"
  // when the merge actually changes something.
  const configPath = path.join(cwd, ".akrctx/config.json");
  if (await pathExists(configPath)) {
    try {
      const rawText = await readFile(configPath, "utf8");
      const raw = JSON.parse(rawText);
      const normalized = normalizeConfigForFix(raw);
      const nextText = `${JSON.stringify(normalized, null, 2)}\n`;
      if (nextText !== rawText) {
        await writeConfig(cwd, normalized, options.dryRun);
        if (!options.dryRun) fixed.push(".akrctx/config.json");
      }
    } catch {
      // Invalid JSON — leave untouched here; getConfigGaps surfaces the issue.
    }
  }

  // Merge missing policy keys with defaults.
  const policyFixed = await fixPolicy(cwd, options.dryRun);
  if (policyFixed) fixed.push(".akrctx/policy.json");

  const localIgnoreFixed = await fixLocalIgnore(cwd, options.dryRun);
  if (localIgnoreFixed && !options.dryRun) fixed.push(localIgnorePath);

  // Re-run diagnosis after fixes and report what changed.
  const final = await diagnose(cwd, options);
  return { ...final, fixed: Array.from(new Set(fixed)) };
}

async function readProfile(cwd: string): Promise<Profile> {
  const config = await readConfig(cwd);
  return config?.profile && profiles.includes(config.profile as Profile) ? (config.profile as Profile) : "default";
}

function normalizeConfigForFix(config: import("./types.js").akrctxConfig): import("./types.js").akrctxConfig {
  const base = defaultConfig(config.targets?.length ? config.targets : ["codex"], config.profile);
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
    comprehensionGate: {
      enabled:
        typeof config.comprehensionGate?.enabled === "boolean"
          ? config.comprehensionGate.enabled
          : base.comprehensionGate.enabled,
      trigger:
        config.comprehensionGate?.trigger === "agent-assessed-significance"
          ? config.comprehensionGate.trigger
          : base.comprehensionGate.trigger,
      evaluationMode:
        config.comprehensionGate?.evaluationMode === "prefer-independent"
          ? config.comprehensionGate.evaluationMode
          : base.comprehensionGate.evaluationMode,
    },
  };
}

async function fixLocalIgnore(cwd: string, dryRun?: boolean): Promise<boolean> {
  const ignorePath = path.join(cwd, localIgnorePath);
  const current = await readFile(ignorePath, "utf8").catch(() => undefined);
  if (isLocalIgnoreContentSafe(current)) return false;
  await writePlannedFile(cwd, localIgnorePath, localComprehensionIgnoreTemplate, {
    dryRun,
    force: true,
    reason: "Protect personal comprehension records from version control.",
  });
  return true;
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

    const nextText = `${JSON.stringify(merged, null, 2)}\n`;
    if (nextText === `${JSON.stringify(raw, null, 2)}\n`) return false;

    if (!dryRun) {
      await writeFile(policyPath, nextText, "utf8");
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
    ...installedTargets.map(targetReferenceFile),
  ]);
  const { gaps: configGaps, installedVersion } = await getConfigGaps(cwd);
  const policyGaps = await getPolicyGaps(cwd);
  const localPrivacyGaps = await getLocalPrivacyGaps(cwd);
  const conflicts = await getInstructionConflicts(cwd);
  const installed = await pathExists(path.join(cwd, ".akrctx/config.json"));
  const judgeGap = await getJudgeGap(cwd);
  const comprehensionAgentGap = await getComprehensionAgentGap(cwd);
  const wikiLint = installed ? await lintWiki(cwd) : { brokenLinks: [], orphans: [], missingTimestamps: [] };
  const wikiLintIssueCount = wikiLint.brokenLinks.length + wikiLint.missingTimestamps.length;
  // Wiki-lint issues are surfaced via wikiLint/gaps.md and a dedicated
  // warning-severity suggestion — they no longer count as "missing" (that
  // would make them CI-failing errors, which is too strict for wiki content).
  const configPolicyGaps = [...configGaps, ...policyGaps, ...localPrivacyGaps];
  const allMissing = [...missing, ...configPolicyGaps];
  const suggestions: Suggestion[] = [
    ...buildSuggestions(
      installed,
      installedTargets,
      allMissing,
      conflicts,
      installedVersion,
      [judgeGap, comprehensionAgentGap].filter((gap): gap is string => Boolean(gap)),
    ),
    ...(wikiLintIssueCount > 0
      ? [
          {
            text: `Wiki lint found ${wikiLintIssueCount} issue(s) (broken links / missing timestamps). See .akrctx/wiki/gaps.md.`,
            severity: "warning" as const,
          },
        ]
      : []),
    ...(wikiLint.orphans.length
      ? [{ text: `Wiki orphan pages: ${wikiLint.orphans.join(", ")}`, severity: "info" as const }]
      : []),
  ];
  const readiness = scoreReadiness(
    installed,
    installedTargets,
    missing,
    configPolicyGaps,
    wikiLintIssueCount,
    conflicts,
  );

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

  await writeDoctorWiki(cwd, result, { missing, configGaps, policyGaps, localPrivacyGaps }, wikiLint, options);
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

    if (policy.protectedFileMerge?.agentMayEdit !== expected.protectedFileMerge.agentMayEdit) {
      gaps.push(".akrctx/policy.json — protectedFileMerge.agentMayEdit must require explicit human approval");
    }
    if (policy.protectedFileMerge?.approvalScope !== expected.protectedFileMerge.approvalScope) {
      gaps.push(".akrctx/policy.json — protectedFileMerge.approvalScope must be current-conversation");
    }
    if (policy.protectedFileMerge?.requireDiffPreview !== true) {
      gaps.push(".akrctx/policy.json — protectedFileMerge.requireDiffPreview must be true");
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

async function getLocalPrivacyGaps(cwd: string): Promise<string[]> {
  const ignorePath = path.join(cwd, localIgnorePath);
  const current = await readFile(ignorePath, "utf8").catch(() => undefined);
  if (current === undefined || isLocalIgnoreContentSafe(current)) return [];
  return [`${localIgnorePath} — must ignore local records and keep only .gitignore trackable`];
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
    if (typeof config.comprehensionGate?.enabled !== "boolean")
      gaps.push(".akrctx/config.json — missing comprehensionGate.enabled");
    if (config.comprehensionGate?.trigger !== "agent-assessed-significance")
      gaps.push('.akrctx/config.json — comprehensionGate.trigger must be "agent-assessed-significance"');
    if (config.comprehensionGate?.evaluationMode !== "prefer-independent")
      gaps.push('.akrctx/config.json — comprehensionGate.evaluationMode must be "prefer-independent"');
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

async function getComprehensionAgentGap(cwd: string): Promise<string | undefined> {
  const configPath = path.join(cwd, ".akrctx/config.json");
  if (!(await pathExists(configPath))) return undefined;
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (config.comprehensionGate?.enabled !== true || !Array.isArray(config.targets)) return undefined;
    const supportedTargets = config.targets.filter(
      (target: string): target is keyof typeof comprehensionAgentFilesByTarget =>
        target in comprehensionAgentFilesByTarget,
    );
    const expectedFiles = supportedTargets.flatMap((target) => Object.keys(comprehensionAgentFilesByTarget[target]));
    const missing = await Promise.all(
      expectedFiles.map(async (file) => ((await pathExists(path.join(cwd, file))) ? undefined : file)),
    );
    if (missing.some(Boolean)) {
      return "`comprehensionGate.enabled` is true but an independent comprehension agent is missing. Run `akrctx comprehension enable`.";
    }
  } catch {
    // Config diagnosis reports malformed JSON separately.
  }
  return undefined;
}

function buildSuggestions(
  installed: boolean,
  installedTargets: Target[],
  missing: string[],
  conflicts: string[],
  installedVersion?: string,
  agentGaps: string[] = [],
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
      text: "Pending merge files exist. Ask your agent to derive and show the exact minimal diff. It may edit the protected instruction only after you explicitly approve that diff in the current conversation.",
      severity: "error",
    });
  }

  for (const gap of agentGaps) {
    suggestions.push({ text: gap, severity: "error" });
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

/**
 * Weight the readiness score by issue category rather than a single flat
 * per-item penalty, so a pile of low-severity wiki-lint nits can't drag the
 * score down as hard as missing harness files or unresolved merge conflicts.
 */
function scoreReadiness(
  installed: boolean,
  installedTargets: Target[],
  missingHarnessFiles: string[],
  configPolicyGaps: string[],
  wikiLintIssueCount: number,
  conflicts: string[],
): number {
  if (!installed) return 0;

  let score = 100;
  if (installedTargets.length === 0) score -= 25;
  score -= Math.min(missingHarnessFiles.length * 5, 40);
  score -= Math.min(configPolicyGaps.length * 3, 20);
  score -= Math.min(wikiLintIssueCount * 1, 10);
  score -= Math.min(conflicts.length * 10, 40);
  return Math.max(0, Math.min(100, score));
}

async function writeDoctorWiki(
  cwd: string,
  result: DoctorResult,
  gapGroups: { missing: string[]; configGaps: string[]; policyGaps: string[]; localPrivacyGaps: string[] },
  wikiLint: WikiLintResult,
  options: CommandOptions,
): Promise<void> {
  const sections = [
    { heading: "Missing files", items: gapGroups.missing },
    { heading: "Config gaps", items: gapGroups.configGaps },
    { heading: "Policy gaps", items: gapGroups.policyGaps },
    { heading: "Local privacy gaps", items: gapGroups.localPrivacyGaps },
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
