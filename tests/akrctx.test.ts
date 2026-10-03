import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clarificationSignal from "../src/clarification-signal.js";
import { boundedNotice, countLineChanges, normalizeBlocks } from "../src/clarification-signal.js";
import { main } from "../src/cli.js";
import { runCompile } from "../src/compile.js";
import {
  isLocalIgnoreContentSafe,
  runComprehensionDisable,
  runComprehensionEnable,
  runComprehensionStatus,
} from "../src/comprehension.js";
import { normalizeWorkflow, readConfig, setConfigValue } from "../src/config.js";
import { CONTINUATION_SCHEMA_VERSION, type ContinuationRecord } from "../src/continuation.js";
import { detectTargets } from "../src/detect.js";
import { runDoctor } from "../src/doctor.js";
import { pathExists } from "../src/fs-utils.js";
import { capsuleFiles, upgradesIgnorePath } from "../src/harness-files.js";
import { runInit } from "../src/init.js";
import {
  JUDGE_SCHEMA_VERSION,
  LEGACY_JUDGE_SCHEMA_VERSION,
  asSchemaVersion,
  createJudgeScope,
  readAcceptanceCriteria,
  readClarificationState,
  readValidationDeclaration,
  validateRecord,
  verifyJudgeRecord,
} from "../src/judge-enforcement.js";
import { collectJudgeRounds, renderJudgeRounds } from "../src/judge-rounds.js";
import {
  captureJudgeCatchUpSnapshot,
  captureJudgeSnapshot,
  checkJudgeReviewCurrentState,
  checkJudgeSnapshotCurrentState,
  loadJudgeSnapshot,
  pruneJudgeSnapshots,
} from "../src/judge-snapshot.js";
import { runJudgeDisable, runJudgeEnable, runJudgeStatus } from "../src/judge.js";
import { contentHash, readManifest } from "../src/manifest.js";
import { runRemove } from "../src/remove.js";
import { runStatus } from "../src/status.js";
import {
  listTasks,
  migrateAcceptanceCriteriaIdentifiers,
  recommendWorkflow,
  removeTask,
  runTask,
  searchTaskCapsules,
  showTask,
  slugify,
  taskNumber,
} from "../src/task.js";
import { runTemplateApply, runTemplateStatus } from "../src/template-apply.js";
import {
  claudeSkills,
  codexSkills,
  copilotSkills,
  piSkills,
  targetReferenceTemplates,
  taskTemplateFiles,
} from "../src/templates.js";
import { workflows } from "../src/types.js";
import { collectRegularFiles, runUpgrade } from "../src/upgrade.js";
import {
  captureValidationError,
  normalizeValidationCommand,
  redactValidationOutput,
  sanitizeValidationCommand,
} from "../src/validation-evidence.js";
import { CLI_VERSION } from "../src/version.js";
import { lintWiki } from "../src/wiki-lint.js";

let tmp: string;
const execFileAsync = promisify(execFile);

async function createLocalTemplatePack(
  root: string,
  name: string,
  content: {
    config?: unknown;
    policy?: unknown;
    wiki?: Record<string, string>;
    skills?: Record<string, string>;
    rootInstructions?: string;
  },
): Promise<string> {
  const pack = path.join(root, `${name}-pack`);
  await mkdir(pack, { recursive: true });
  await writeFile(
    path.join(pack, "akrctx-pack.json"),
    JSON.stringify({ name, version: "1.0.0", akrctxPackVersion: 1 }),
    "utf8",
  );
  if (content.config) await writeFile(path.join(pack, "config.json"), JSON.stringify(content.config), "utf8");
  if (content.policy) await writeFile(path.join(pack, "policy.json"), JSON.stringify(content.policy), "utf8");
  for (const [filename, markdown] of Object.entries(content.wiki ?? {})) {
    await mkdir(path.join(pack, "wiki"), { recursive: true });
    await writeFile(path.join(pack, "wiki", filename), markdown, "utf8");
  }
  for (const [skill, markdown] of Object.entries(content.skills ?? {})) {
    await mkdir(path.join(pack, "target/skills", skill), { recursive: true });
    await writeFile(path.join(pack, "target/skills", skill, "SKILL.md"), markdown, "utf8");
  }
  if (content.rootInstructions !== undefined) {
    await mkdir(path.join(pack, "target"), { recursive: true });
    await writeFile(path.join(pack, "target/root-instructions.md"), content.rootInstructions, "utf8");
  }
  return pack;
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "akrctx-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// ── init ──────────────────────────────────────────────────────────────────────

describe("akrctx init", () => {
  it("installs the codex harness without overwriting existing AGENTS.md", async () => {
    await writeFile(path.join(tmp, "AGENTS.md"), "# Existing instructions\n", "utf8");

    const result = await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.selectedTargets).toEqual(["codex"]);
    expect(await readFile(path.join(tmp, "AGENTS.md"), "utf8")).toBe("# Existing instructions\n");
    expect(await pathExists(path.join(tmp, "AGENTS.akrctx.suggested.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/config.json"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/manifest.json"))).toBe(true);
    const config = await readConfig(tmp);
    expect(config?.defaults.workflow).toBe("task-fit");
    expect(config?.workflowRules.apiOrContract).toBe("SDD+TDD");
    expect(config?.comprehensionGate).toEqual({
      enabled: false,
      trigger: "agent-assessed-significance",
      evaluationMode: "prefer-independent",
    });
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-comprehension/SKILL.md"))).toBe(false);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-comprehension.toml"))).toBe(false);
    expect(await pathExists(path.join(tmp, ".akrctx/wiki/write-policy.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/local/.gitignore"))).toBe(true);
    expect(await readFile(path.join(tmp, ".akrctx/local/.gitignore"), "utf8")).toBe("*\n!.gitignore\n");
    expect(await pathExists(path.join(tmp, ".akrctx/comprehension/schemas/rubric.schema.json"))).toBe(true);
  });

  it("creates wiki pages with OKF-style frontmatter", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const architecture = await readFile(path.join(tmp, ".akrctx/wiki/architecture.md"), "utf8");
    expect(architecture).toMatch(/^---\n/);
    expect(architecture).toContain("type: akrctx-wiki-architecture");
    expect(architecture).toContain("tags:");

    const overview = await readFile(path.join(tmp, ".akrctx/wiki/overview.md"), "utf8");
    expect(overview).toContain("type: akrctx-wiki-overview");

    const index = await readFile(path.join(tmp, ".akrctx/wiki/index.md"), "utf8");
    expect(index).toMatch(/^---\n/);
    expect(index).toContain("type: akrctx-wiki-index");
    expect(index).toContain("[Overview](/wiki/overview.md)");
    expect(index).toContain("[Instruction Audit](/wiki/instruction-audit.md)");

    const log = await readFile(path.join(tmp, ".akrctx/wiki/log.md"), "utf8");
    expect(log).toContain("type: akrctx-wiki-log");
    expect(log).toMatch(/^---\n[\s\S]*# Log\n\n## \d{4}-\d{2}-\d{2}\n- akrctx initialized\.\n$/);

    const instructionAudit = await readFile(path.join(tmp, ".akrctx/wiki/instruction-audit.md"), "utf8");
    expect(instructionAudit).toContain("type: akrctx-wiki-instruction-audit");
    expect(instructionAudit).toContain("does not overwrite this page");
  });

  it("creates an active Codex harness when AGENTS.md does not exist", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const agents = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    expect(agents).toContain("Mandatory Behavior");
    expect(agents).toContain("Create or update a task capsule");
    expect(agents).toContain("before implementation");
    expect(agents).toContain("Create the task capsule yourself");
  });

  it("creates a harness policy that does not restrict the programming agent from implementation", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const policy = JSON.parse(await readFile(path.join(tmp, ".akrctx/policy.json"), "utf8"));
    expect(policy).not.toHaveProperty("allowSourceCodeWrites");
    expect(policy).not.toHaveProperty("network");
    expect(policy).not.toHaveProperty("llmProvider");
    expect(policy).not.toHaveProperty("allowExternalAgentExecution");
    expect(policy.mergeStrategy).toBe("preserve-and-suggest");
  });

  it("policy includes .p12 and .pfx in blockedReadPatterns", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const policy = JSON.parse(await readFile(path.join(tmp, ".akrctx/policy.json"), "utf8"));
    expect(policy.blockedReadPatterns).toContain("*.p12");
    expect(policy.blockedReadPatterns).toContain("*.pfx");
  });

  it("policy records protected files and enforcement defaults", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const policy = JSON.parse(await readFile(path.join(tmp, ".akrctx/policy.json"), "utf8"));
    expect(policy.protectedFiles).toContain("AGENTS.md");
    expect(policy.protectedFiles).toContain("CLAUDE.md");
    expect(policy.protectedFiles).toContain(".github/copilot-instructions.md");
    expect(policy.protectedFiles).toContain(".pi/README.md");
    expect(policy.protectedFileMerge).toEqual({
      agentMayEdit: "after-explicit-human-approval",
      approvalScope: "current-conversation",
      requireDiffPreview: true,
    });
    expect(policy.writePolicy.doctor).toContain("AGENTS.akrctx.suggested.md");
    expect(policy.writePolicy.doctor).toContain(".akrctx/wiki/instruction-audit.md");
    expect(policy.writePolicy.doctor).not.toContain("AGENTS.md");
    expect(policy.enforcement.requireTaskCapsule).toBe(true);
    expect(policy.enforcement.requireWorkflowReason).toBe(true);
    expect(policy.enforcement.requireAcceptanceCriteria).toBe(true);
    expect(policy.enforcement.requireReviewChecklist).toBe(true);
  });

  it("never leaves a weak judge verify in an instruction aimed at the primary agent", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    // The primary agent is the only caller that can execute, so every surface that tells it to
    // verify must say --run-tests. Read-only agents are excluded: passing the flag would break
    // their contract, and they are checked separately below.
    const readOnlyAgents = ["akrctx-judge", "akrctx-comprehension"];
    const surfaces = (await readdir(tmp, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.(md|toml)$/.test(entry.name))
      .map((entry) => path.relative(tmp, path.join(entry.parentPath, entry.name)))
      .filter((relativePath) => !readOnlyAgents.some((agent) => relativePath.includes(agent)));
    expect(surfaces.length).toBeGreaterThan(0);

    const weak: string[] = [];
    for (const relativePath of surfaces) {
      const content = await readFile(path.join(tmp, relativePath), "utf8");
      for (const line of content.split("\n")) {
        if (!line.includes("judge verify")) continue;
        if (line.includes("--run-tests")) continue;
        // `judge verify` named as a bare command reference rather than an instruction to run it.
        if (/`akrctx judge verify`/.test(line)) continue;
        weak.push(`${relativePath}: ${line.trim()}`);
      }
    }

    expect(weak).toEqual([]);
  });

  it("tells the read-only agents not to re-execute validation", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await runComprehensionEnable({ cwd: tmp, nonInteractive: true });

    const agent = await readFile(path.join(tmp, ".claude/agents/akrctx-comprehension.md"), "utf8");

    expect(agent).toContain("Do not pass `--run-tests`");
  });

  it("teaches every Doctor target the narrow human-approved merge workflow", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });

    const doctorSurfaces = [
      ".agents/skills/akrctx-doctor/SKILL.md",
      ".claude/skills/akrctx-doctor/SKILL.md",
      ".claude/commands/akrctx-doctor.md",
      ".github/skills/akrctx-doctor/SKILL.md",
      ".github/prompts/akrctx-doctor.prompt.md",
      ".pi/skills/akrctx-doctor/SKILL.md",
      ".pi/prompts/akrctx-doctor.md",
    ];

    for (const relativePath of doctorSurfaces) {
      const content = await readFile(path.join(tmp, relativePath), "utf8");
      expect(content, relativePath).toContain("explicit human approval");
      expect(content, relativePath).toContain("current conversation");
    }

    const skill = await readFile(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"), "utf8");
    expect(skill).toContain("Show the exact proposed diff");
    expect(skill).toContain("apply only the shown changes");
    expect(skill).toContain("Never use `--force`");

    const semanticDoctorSkills = [
      ".agents/skills/akrctx-doctor/SKILL.md",
      ".claude/skills/akrctx-doctor/SKILL.md",
      ".github/skills/akrctx-doctor/SKILL.md",
      ".pi/skills/akrctx-doctor/SKILL.md",
    ];
    for (const relativePath of semanticDoctorSkills) {
      const content = await readFile(path.join(tmp, relativePath), "utf8");
      expect(content, relativePath).toContain("instruction or coherent block");
      expect(content, relativePath).toContain("missing or empty `applyTo`");
      expect(content, relativePath).toContain("Move up only when evidence shows");
      expect(content, relativePath).toContain(".akrctx/wiki/instruction-audit.md");
    }

    const copilotInstructions = await readFile(path.join(tmp, ".github/instructions/akrctx.instructions.md"), "utf8");
    expect(copilotInstructions).toContain('applyTo: ".akrctx/**"');
    expect(copilotInstructions).not.toContain('applyTo: "**"');
  });

  it("strict profile records stricter config and policy defaults", async () => {
    await runInit({ cwd: tmp, target: "copilot", profile: "strict", nonInteractive: true });

    const config = await readConfig(tmp);
    const policy = JSON.parse(await readFile(path.join(tmp, ".akrctx/policy.json"), "utf8"));
    expect(config?.profile).toBe("strict");
    expect(config?.defaults.contextBudget).toBe("thorough");
    expect(policy.profile).toBe("strict");
    expect(policy.blockedReadPatterns).toContain(".ssh/");
    expect(policy.blockedReadPatterns).toContain(".netrc");
  });

  it("regulated profile avoids fast-patch for small patches and adds regulated blocked reads", async () => {
    await runInit({ cwd: tmp, target: "codex", profile: "regulated", nonInteractive: true });

    const config = await readConfig(tmp);
    const policy = JSON.parse(await readFile(path.join(tmp, ".akrctx/policy.json"), "utf8"));
    expect(config?.profile).toBe("regulated");
    expect(config?.workflowRules.smallSafePatch).toBe("TDD");
    expect(config?.workflowRules.default).toBe("research-first");
    expect(policy.profile).toBe("regulated");
    expect(policy.blockedReadPatterns).toContain("compliance/");
    expect(policy.blockedReadPatterns).toContain("*.jks");
  });

  it("applies a target-relative template pack", async () => {
    const pack = path.join(tmp, "pepe-template");
    await mkdir(path.join(pack, "wiki"), { recursive: true });
    await mkdir(path.join(pack, "target/skills/pepe-front"), { recursive: true });
    await mkdir(path.join(pack, "target/prompts"), { recursive: true });
    await mkdir(path.join(pack, "target/instructions"), { recursive: true });
    await writeFile(
      path.join(pack, "akrctx-pack.json"),
      JSON.stringify({ name: "pepe-template", version: "1.0.0", akrctxPackVersion: 1 }),
      "utf8",
    );
    await writeFile(
      path.join(pack, "config.json"),
      JSON.stringify({
        defaults: { workflow: "SDD+TDD", contextBudget: "thorough" },
        comprehensionGate: { enabled: "yes", trigger: "always", evaluationMode: "same-session" },
      }),
      "utf8",
    );
    await writeFile(
      path.join(pack, "policy.json"),
      JSON.stringify({ blockedReadPatterns: ["terraform.tfstate", "prod-secrets/"] }),
      "utf8",
    );
    await writeFile(path.join(pack, "wiki/testing.md"), "# Company Testing\n", "utf8");
    await writeFile(path.join(pack, "target/root-instructions.md"), "# Company Copilot Instructions\n", "utf8");
    await writeFile(path.join(pack, "target/skills/pepe-front/SKILL.md"), "# pepe-front\n", "utf8");
    await writeFile(path.join(pack, "target/prompts/pepe-review.md"), "# Pepe Review\n", "utf8");
    await writeFile(path.join(pack, "target/instructions/pepe.instructions.md"), "# Pepe Instructions\n", "utf8");

    await runInit({ cwd: tmp, target: "copilot", templatePack: pack, nonInteractive: true });

    const config = await readConfig(tmp);
    const policy = JSON.parse(await readFile(path.join(tmp, ".akrctx/policy.json"), "utf8"));
    expect(config?.defaults.workflow).toBe("SDD+TDD");
    expect(config?.defaults.contextBudget).toBe("thorough");
    expect(config?.comprehensionGate).toEqual({
      enabled: false,
      trigger: "always",
      evaluationMode: "prefer-independent",
    });
    expect(config?.templatePacks[0]).toMatchObject({
      name: "pepe-template",
      version: "1.0.0",
      source: "local",
      targets: ["copilot"],
    });
    expect(policy.blockedReadPatterns).toContain("terraform.tfstate");
    expect(policy.blockedReadPatterns).toContain(".env");
    expect(await readFile(path.join(tmp, ".akrctx/wiki/testing.md"), "utf8")).toContain("Company Testing");
    expect(await readFile(path.join(tmp, ".github/copilot-instructions.md"), "utf8")).toContain(
      "Company Copilot Instructions",
    );
    expect(await readFile(path.join(tmp, ".github/skills/pepe-front/SKILL.md"), "utf8")).toContain("pepe-front");
    expect(await pathExists(path.join(tmp, ".github/prompts/pepe-review.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".github/instructions/pepe.instructions.md"))).toBe(true);
  });

  it("warns when a template pack weakens enforcement policy", async () => {
    const pack = path.join(tmp, "weak-template");
    await mkdir(pack, { recursive: true });
    await writeFile(
      path.join(pack, "akrctx-pack.json"),
      JSON.stringify({ name: "weak-template", version: "1.0.0", akrctxPackVersion: 1 }),
      "utf8",
    );
    await writeFile(
      path.join(pack, "policy.json"),
      JSON.stringify({
        enforcement: { requireTaskCapsule: false },
        protectedFileMerge: { requireDiffPreview: false },
      }),
      "utf8",
    );

    const result = await runInit({ cwd: tmp, target: "copilot", templatePack: pack, nonInteractive: true });

    expect(result.policyWarnings.some((w) => w.includes("enforcement.requireTaskCapsule"))).toBe(true);
    expect(result.policyWarnings.some((w) => w.includes("protected-file human-approval"))).toBe(true);
  });

  it("reports no policy warnings when a template pack does not touch policy", async () => {
    const result = await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.policyWarnings).toEqual([]);
  });

  it("rejects root-level template pack skills", async () => {
    const pack = path.join(tmp, "bad-template");
    await mkdir(path.join(pack, "skills/pepe-front"), { recursive: true });
    await writeFile(
      path.join(pack, "akrctx-pack.json"),
      JSON.stringify({ name: "bad-template", version: "1.0.0", akrctxPackVersion: 1 }),
      "utf8",
    );
    await writeFile(path.join(pack, "skills/pepe-front/SKILL.md"), "# nope\n", "utf8");

    await expect(runInit({ cwd: tmp, target: "copilot", templatePack: pack, nonInteractive: true })).rejects.toThrow(
      "root-level skills/ is not supported",
    );
  });

  it("applies a bundled template by name", async () => {
    await runInit({ cwd: tmp, target: "copilot", template: "test-template", nonInteractive: true });

    const policy = JSON.parse(await readFile(path.join(tmp, ".akrctx/policy.json"), "utf8"));
    expect(policy.blockedReadPatterns).toContain("terraform.tfstate");
    expect(await readFile(path.join(tmp, ".akrctx/wiki/testing.md"), "utf8")).toContain("Test Template Testing");
    expect(await readFile(path.join(tmp, ".github/copilot-instructions.md"), "utf8")).toContain(
      "Test Template Instructions",
    );
    expect(await readFile(path.join(tmp, ".github/skills/test-front/SKILL.md"), "utf8")).toContain("test-front");
  });

  it("installs target workflow surfaces for all supported targets", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".claude/skills/akrctx-workflow/SKILL.md"))).toBe(true);
    // Copilot gets both skills and prompts.
    expect(await pathExists(path.join(tmp, ".github/skills/akrctx-workflow/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".github/prompts/akrctx-workflow.prompt.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".pi/skills/akrctx-workflow/SKILL.md"))).toBe(true);
  });

  it("dry-run reports planned writes without creating files", async () => {
    const result = await runInit({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });

    expect(result.writes.some((write) => write.path === ".akrctx/config.json" && write.kind === "create")).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/config.json"))).toBe(false);
  });

  it("fails instead of silently defaulting to codex in non-interactive mode with no detected target", async () => {
    await expect(runInit({ cwd: tmp, dryRun: true, nonInteractive: true })).rejects.toThrow(
      "No agent setup detected and no --target given.",
    );
  });

  it("fails in non-interactive mode when multiple targets are detected and none is given", async () => {
    await writeFile(path.join(tmp, "AGENTS.md"), "# Codex\n", "utf8");
    await writeFile(path.join(tmp, "CLAUDE.md"), "# Claude\n", "utf8");

    await expect(runInit({ cwd: tmp, dryRun: true, nonInteractive: true })).rejects.toThrow(
      "Multiple agent setups detected",
    );
  });
});

describe("target reference files", () => {
  it("writes only the selected target's reference file", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".akrctx/targets/claude.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/targets/codex.md"))).toBe(false);
    expect(await pathExists(path.join(tmp, ".akrctx/targets/copilot.md"))).toBe(false);
    expect(await pathExists(path.join(tmp, ".akrctx/targets/pi.md"))).toBe(false);
  });

  it("doctor does not flag unselected targets' reference files as missing", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.readiness).toBe(100);
    expect(result.missing).not.toContain(".akrctx/targets/codex.md");
  });

  it("doctor flags a missing target reference file for an installed target", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await rm(path.join(tmp, ".akrctx/targets/claude.md"), { force: true });

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.missing).toContain(".akrctx/targets/claude.md");
  });
});

// ── detection ────────────────────────────────────────────────────────────────

describe("target detection", () => {
  it("detects multiple agent setups", async () => {
    await writeFile(path.join(tmp, "CLAUDE.md"), "# Claude\n", "utf8");
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const detection = await detectTargets(tmp);

    expect(detection.detected).toContain("codex");
    expect(detection.detected).toContain("claude");
  });
});

// ── doctor ───────────────────────────────────────────────────────────────────

describe("doctor", () => {
  it("reports installed targets and writes agent setup wiki", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.installed).toBe(true);
    expect(result.installedTargets).toContain("codex");
    expect(result.readiness).toBeGreaterThan(50);
    expect(await pathExists(path.join(tmp, ".akrctx/wiki/agent-setup.md"))).toBe(true);
  });

  it("reports 100 readiness for a complete single-target install", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.installed).toBe(true);
    expect(result.installedTargets).toEqual(["copilot"]);
    expect(result.readiness).toBe(100);
  });

  it("prints the installed target in the suggested doctor prompt", async () => {
    await runInit({ cwd: tmp, target: "pi", nonInteractive: true });
    const previousCwd = process.cwd();
    const writes: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      writes.push(String(message));
    };

    try {
      process.chdir(tmp);
      await main(["node", "akrctx", "doctor"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }

    expect(writes.join("\n")).toContain("Suggested Pi Code prompt:");
    expect(writes.join("\n")).not.toContain("Suggested Codex prompt:");
  });

  describe("capsule implementation logs", () => {
    async function capsuleWithLog(): Promise<{ taskDir: string; logPath: string }> {
      await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
      const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });
      const logPath = path.join(tmp, task.taskDir, "log.md");
      await writeFile(logPath, "# Implementation log\n\nOld-policy notes.\n", "utf8");
      return { taskDir: task.taskDir, logPath };
    }

    it("reports a capsule that holds log.md, names the task and the reviewed boundary", async () => {
      const { taskDir } = await capsuleWithLog();

      const result = await runDoctor({ cwd: tmp, nonInteractive: true });

      expect(result.capsuleLogs).toEqual([{ taskId: "TASK-001", path: `${taskDir}/log.md` }]);
      const warning = result.suggestions.find((s) => s.text.includes(`${taskDir}/log.md`));
      expect(warning?.severity).toBe("warning");
      expect(warning?.text).toContain("TASK-001");
      expect(warning?.text).toContain("inside the reviewed boundary");
      expect(warning?.text).toContain(".akrctx/local/impl/TASK-001/log.md");
    });

    it("keeps every other axis clean when a capsule holds log.md", async () => {
      await capsuleWithLog();

      const result = await runDoctor({ cwd: tmp, nonInteractive: true });

      expect(result.readiness).toBe(100);
      expect(result.missing).toEqual([]);
      expect(result.conflicts).toEqual([]);
      expect(result.suggestions.filter((s) => s.severity === "error")).toEqual([]);
    });

    it.each([false, true])("never moves or rewrites the log (fix: %s)", async (fix) => {
      const { logPath } = await capsuleWithLog();
      const before = await readFile(logPath, "utf8");

      await runDoctor({ cwd: tmp, fix, nonInteractive: true });

      expect(await readFile(logPath, "utf8")).toBe(before);
      expect(await pathExists(path.join(tmp, ".akrctx/local/impl/TASK-001/log.md"))).toBe(false);
    });

    it("reports nothing when no capsule holds log.md", async () => {
      await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
      await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

      const result = await runDoctor({ cwd: tmp, nonInteractive: true });

      expect(result.capsuleLogs).toEqual([]);
      expect(result.suggestions.some((s) => s.text.includes("log.md"))).toBe(false);
    });
  });

  it("provides actionable suggestions when not installed", async () => {
    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.installed).toBe(false);
    expect(result.readiness).toBe(0);
    expect(result.suggestions[0].text).toContain("akrctx init");
  });

  it("reports policy gaps when required enforcement is relaxed", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.enforcement.requireTaskCapsule = false;
    policy.protectedFiles = policy.protectedFiles.filter((file: string) => file !== "AGENTS.md");
    await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.missing).toContain(".akrctx/policy.json — enforcement.requireTaskCapsule must be true");
    expect(result.missing).toContain(".akrctx/policy.json — protectedFiles missing AGENTS.md");
    expect(result.suggestions.some((suggestion) => suggestion.text.includes("file(s) missing"))).toBe(true);
  });

  it("reports an unsafe or missing protected-file merge approval contract", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.protectedFileMerge = {
      agentMayEdit: "always",
      approvalScope: "any-conversation",
      requireDiffPreview: false,
    };
    await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.missing).toContain(
      ".akrctx/policy.json — protectedFileMerge.agentMayEdit must require explicit human approval",
    );
    expect(result.missing).toContain(
      ".akrctx/policy.json — protectedFileMerge.approvalScope must be current-conversation",
    );
    expect(result.missing).toContain(".akrctx/policy.json — protectedFileMerge.requireDiffPreview must be true");
  });

  it("reports profile-specific policy gaps", async () => {
    await runInit({ cwd: tmp, target: "codex", profile: "regulated", nonInteractive: true });

    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.blockedReadPatterns = policy.blockedReadPatterns.filter((pattern: string) => pattern !== "compliance/");
    await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.missing).toContain(".akrctx/policy.json — blockedReadPatterns missing compliance/");
  });

  it("doctor --ci fails when akrctx is not installed", async () => {
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    const writes: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      writes.push(String(message));
    };

    try {
      process.exitCode = undefined;
      process.chdir(tmp);
      await main(["node", "akrctx", "doctor", "--ci"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }

    expect(process.exitCode).toBe(1);
    expect(writes.join("\n")).toContain("akrctx doctor CI failed");
    process.exitCode = previousExitCode;
  });

  it("doctor --ci passes for a complete install", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    const writes: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      writes.push(String(message));
    };

    try {
      process.exitCode = undefined;
      process.chdir(tmp);
      await main(["node", "akrctx", "doctor", "--ci"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }

    expect(process.exitCode).toBeUndefined();
    expect(writes.join("\n")).toContain("akrctx doctor CI passed");
    process.exitCode = previousExitCode;
  });

  it("doctor --ci passes even when installedVersion drifts from CLI_VERSION (warning, not error)", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.installedVersion = "0.0.1";
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    const writes: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      writes.push(String(message));
    };

    try {
      process.exitCode = undefined;
      process.chdir(tmp);
      await main(["node", "akrctx", "doctor", "--ci"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }

    expect(process.exitCode).toBeUndefined();
    expect(writes.join("\n")).toContain("akrctx doctor CI passed");
    process.exitCode = previousExitCode;
  });

  it("doctor --ci fails when required files are missing", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"), { force: true });
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    const originalLog = console.log;
    console.log = () => {};

    try {
      process.exitCode = undefined;
      process.chdir(tmp);
      await main(["node", "akrctx", "doctor", "--ci"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }

    expect(process.exitCode).toBe(1);
    process.exitCode = previousExitCode;
  });

  it("doctor --ci --json includes CI status", async () => {
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    const writes: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      writes.push(String(message));
    };

    try {
      process.exitCode = undefined;
      process.chdir(tmp);
      await main(["node", "akrctx", "doctor", "--ci", "--json"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }

    const parsed = JSON.parse(writes.join("\n"));
    expect(parsed.ci.passed).toBe(false);
    expect(parsed.ci.failureCount).toBeGreaterThan(0);
    expect(process.exitCode).toBe(1);
    process.exitCode = previousExitCode;
  });

  it("doctor --ci passes when the only issue is a wiki-lint warning, not an error", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const archPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    const arch = await readFile(archPath, "utf8");
    await writeFile(archPath, arch.replace(/^timestamp:.*\n/m, ""), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(result.missing.some((m) => m.includes("architecture.md"))).toBe(false);
    expect(result.suggestions.some((s) => s.severity === "warning" && s.text.includes("Wiki lint"))).toBe(true);

    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    const originalLog = console.log;
    console.log = () => {};
    try {
      process.exitCode = undefined;
      process.chdir(tmp);
      await main(["node", "akrctx", "doctor", "--ci"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }
    expect(process.exitCode).toBeUndefined();
    process.exitCode = previousExitCode;
  });

  it("weights readiness score by category: wiki-lint issues cost less than missing harness files", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const archPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    const arch = await readFile(archPath, "utf8");
    await writeFile(archPath, arch.replace(/^timestamp:.*\n/m, ""), "utf8");

    const wikiLintOnly = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(wikiLintOnly.readiness).toBe(99);

    await rm(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"), { force: true });
    const withMissingHarnessFile = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(withMissingHarnessFile.readiness).toBeLessThan(wikiLintOnly.readiness);
  });

  it("writes gaps.md and recommendations.md with OKF-style frontmatter", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.installed).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/wiki/gaps.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/wiki/recommendations.md"))).toBe(true);

    const gaps = await readFile(path.join(tmp, ".akrctx/wiki/gaps.md"), "utf8");
    expect(gaps).toMatch(/^---\n/);
    expect(gaps).toContain("type: akrctx-wiki-gaps");
    expect(gaps).toContain("# Gaps");

    const recommendations = await readFile(path.join(tmp, ".akrctx/wiki/recommendations.md"), "utf8");
    expect(recommendations).toMatch(/^---\n/);
    expect(recommendations).toContain("type: akrctx-wiki-recommendations");
    expect(recommendations).toContain("# Recommendations");
  });

  it("preserves the semantic instruction audit when CLI Doctor regenerates mechanical reports", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const auditPath = path.join(tmp, ".akrctx/wiki/instruction-audit.md");
    const semanticAudit = "# Instruction Audit\n\n- move: scope the TypeScript rule to src/**/*.ts\n";
    await writeFile(auditPath, semanticAudit, "utf8");

    await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(await readFile(auditPath, "utf8")).toBe(semanticAudit);
  });

  it("partitions gaps into missing files, config gaps, and policy gaps", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"), { force: true });

    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.enforcement.requireTaskCapsule = false;
    await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");

    await runDoctor({ cwd: tmp, nonInteractive: true });

    const gaps = await readFile(path.join(tmp, ".akrctx/wiki/gaps.md"), "utf8");
    expect(gaps).toContain("## Missing files");
    expect(gaps).toContain(".agents/skills/akrctx-workflow/SKILL.md");
    expect(gaps).toContain("## Policy gaps");
    expect(gaps).toContain(".akrctx/policy.json — enforcement.requireTaskCapsule must be true");
  });

  it("reports wiki lint issues including broken links and missing timestamps", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await rm(path.join(tmp, ".akrctx/wiki/overview.md"), { force: true });

    const archPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    const arch = await readFile(archPath, "utf8");
    await writeFile(archPath, arch.replace(/^timestamp:.*\n/m, ""), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.wikiLint?.brokenLinks.length).toBeGreaterThan(0);
    expect(result.wikiLint?.brokenLinks.some((issue) => issue.message.includes("/wiki/overview.md"))).toBe(true);
    expect(result.wikiLint?.missingTimestamps.length).toBeGreaterThan(0);
    expect(result.wikiLint?.missingTimestamps.some((issue) => issue.file.includes("architecture.md"))).toBe(true);

    const gaps = await readFile(path.join(tmp, ".akrctx/wiki/gaps.md"), "utf8");
    expect(gaps).toContain("Wiki lint: broken links");
    expect(gaps).toContain("Wiki lint: missing timestamps");
  });
});

// ── wiki-lint ────────────────────────────────────────────────────────────────

describe("wiki-lint", () => {
  it("does not flag a valid timestamp when frontmatter uses CRLF line endings", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const archPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    const arch = await readFile(archPath, "utf8");
    await writeFile(archPath, arch.replace(/\n/g, "\r\n"), "utf8");

    const result = await lintWiki(tmp);

    expect(result.missingTimestamps.some((issue) => issue.file.includes("architecture.md"))).toBe(false);
  });

  it("does not flag a link with an anchor fragment as broken", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const archPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    const arch = await readFile(archPath, "utf8");
    await writeFile(archPath, `${arch}\n[Quick Reference](/wiki/overview.md#quick-reference)\n`, "utf8");

    const result = await lintWiki(tmp);

    expect(result.brokenLinks.some((issue) => issue.message.includes("overview.md#quick-reference"))).toBe(false);
  });

  it("flags a link with an anchor fragment to a missing file as broken", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const archPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    const arch = await readFile(archPath, "utf8");
    await writeFile(archPath, `${arch}\n[Missing](/wiki/missing.md#x)\n`, "utf8");

    const result = await lintWiki(tmp);

    expect(result.brokenLinks.some((issue) => issue.message.includes("missing.md#x"))).toBe(true);
  });
});

// ── task and compile ─────────────────────────────────────────────────────────

describe("task and compile", () => {
  async function writeSearchFixture(taskDirectory: string, filename: string, content: string): Promise<void> {
    const filePath = path.join(tmp, ".akrctx/tasks", taskDirectory, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }

  it("creates no local implementation-log directory with a capsule", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".akrctx/local/impl"))).toBe(false);
  });

  it("creates a task capsule and compiles a codex brief", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    // "fix" and "regression" unambiguously trigger TDD.
    const task = await runTask("Fix regression in invoice calculation", { cwd: tmp, nonInteractive: true });

    expect(task.taskId).toBe("TASK-001");
    expect(task.workflow).toBe("TDD");
    expect(task.workflowReason).toContain("matched keywords");
    expect(await pathExists(path.join(tmp, task.taskDir, "acceptance-criteria.md"))).toBe(true);

    const compiled = await runCompile(task.taskId, { cwd: tmp, target: "codex", nonInteractive: true });

    expect(compiled.outputPath).toBe(`${task.taskDir}/exports/codex.md`);
    const brief = await readFile(path.join(tmp, compiled.outputPath), "utf8");
    expect(brief).toContain("akrctx codex Brief");
    expect(brief).toContain("Fix regression in invoice calculation");
  });

  it("compile defaults to codex when no --target is provided", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    const compiled = await runCompile(task.taskId, { cwd: tmp, nonInteractive: true });

    expect(compiled.target).toBe("codex");
    expect(compiled.outputPath).toContain("codex.md");
  });

  it("recompiling without --force still regenerates a stale export (derived artifact)", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });
    await runCompile(task.taskId, { cwd: tmp, target: "codex", nonInteractive: true });

    await writeFile(
      path.join(tmp, task.taskDir, "task.md"),
      "# TASK-001\n\n## Goal\n\nUpdated goal text after edit\n",
      "utf8",
    );

    await runCompile(task.taskId, { cwd: tmp, target: "codex", nonInteractive: true });

    const brief = await readFile(path.join(tmp, task.taskDir, "exports/codex.md"), "utf8");
    expect(brief).toContain("Updated goal text after edit");
  });

  it("compile throws when task id does not exist", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await expect(runCompile("TASK-999", { cwd: tmp, nonInteractive: true })).rejects.toThrow(
      "Task not found: TASK-999",
    );
  });

  it("accepts an explicit workflow override", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Define invoice API examples", { cwd: tmp, workflow: "sdd+edd", nonInteractive: true });

    expect(task.workflow).toBe("SDD+EDD");
    expect(task.workflowReason).toBe("explicit CLI override");
    const plan = await readFile(path.join(tmp, task.taskDir, "plan.md"), "utf8");
    expect(plan).toContain("SDD+EDD");
    expect(plan).toContain("Load only the workflow skill or prompt");
  });

  it("accepts hyphen-separated workflow variant (sdd-tdd)", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Define contract", { cwd: tmp, workflow: "sdd-tdd", nonInteractive: true });

    expect(task.workflow).toBe("SDD+TDD");
  });

  it("recommends UI review for UI-shaped descriptions", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("redesign the settings page", { cwd: tmp, nonInteractive: true });

    expect(task.workflow).toBe("UI review");
  });

  it("keeps UI review even when allowedWorkflows excludes it", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "allowedWorkflows", "TDD");

    const task = await runTask("redesign the settings page", { cwd: tmp, nonInteractive: true });

    expect(task.workflow).toBe("UI review");
  });

  it("uses TDD+EDD for game tasks under task-fit fallback", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Create Tetris game", { cwd: tmp, nonInteractive: true });

    expect(task.workflow).toBe("TDD+EDD");
  });

  it("uses configured workflow defaults when no task override is provided", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "defaultWorkflow", "SDD+TDD");

    const task = await runTask("Create invoice endpoint", { cwd: tmp, nonInteractive: true });

    expect(task.workflow).toBe("SDD+TDD");
    expect(task.workflowReason).toBe("project default");
    const capsule = await readFile(path.join(tmp, task.taskDir, "task.md"), "utf8");
    expect(capsule).toContain("project default");
  });

  it("falls back to an allowed workflow when task-fit recommends a disallowed one", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "allowedWorkflows", "SDD, fast-patch");

    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    expect(task.workflow).toBe("SDD");
    expect(task.workflowReason).toContain("not in allowedWorkflows");
    expect(task.workflowReason).toContain("fell back to SDD");
  });

  it("rejects an explicit --workflow that is not in allowedWorkflows", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "allowedWorkflows", "SDD, TDD");

    await expect(runTask("Fix auth bug", { cwd: tmp, workflow: "EDD", nonInteractive: true })).rejects.toThrow(
      'Workflow "EDD" is not in allowedWorkflows',
    );
  });

  it("rejects a project default workflow that is not in allowedWorkflows", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "allowedWorkflows", "SDD, TDD");
    // Bypass setConfigValue validation to simulate a manually edited inconsistent config.
    const config = await readConfig(tmp);
    if (!config) throw new Error("config missing");
    config.defaults.workflow = "EDD";
    await writeFile(path.join(tmp, ".akrctx/config.json"), JSON.stringify(config, null, 2), "utf8");

    await expect(runTask("Fix auth bug", { cwd: tmp, nonInteractive: true })).rejects.toThrow(
      'Workflow "EDD" is not in allowedWorkflows',
    );
  });

  it("lists task capsules", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });
    await runTask("Create invoice endpoint", { cwd: tmp, nonInteractive: true });

    const tasks = await listTasks(tmp);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].taskId).toBe("TASK-001");
    expect(tasks[0].description).toContain("Fix auth bug");
    expect(tasks[1].taskId).toBe("TASK-002");
    expect(tasks[1].description).toContain("Create invoice endpoint");
  });

  it("listTasks sorts numerically for TASK-002/010/1000", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    for (const n of [10, 1000, 2]) {
      await mkdir(path.join(tmp, ".akrctx/tasks", `TASK-${String(n).padStart(3, "0")}-x`), { recursive: true });
    }

    const tasks = await listTasks(tmp);

    expect(tasks.map((t) => t.taskId)).toEqual(["TASK-002", "TASK-010", "TASK-1000"]);
  });

  it("searches canonical capsule files literally in deterministic order", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeSearchFixture("TASK-002-legacy", "task.md", "orden legacy\n");
    await writeSearchFixture("TASK-010-acentos", "task.md", "Éclair [a-z]\nÉclair Éclair\n");
    await writeSearchFixture("TASK-010-acentos", "context.md", "orden contexto\n");
    await writeSearchFixture("TASK-010-acentos", "acceptance-criteria.md", "ÉCLAIR criterio\n");
    await writeSearchFixture("TASK-010-acentos", "exports/result.md", "ÉCLAIR exportado\n");
    await writeSearchFixture("TASK-010-acentos", "log.md", "ÉCLAIR en log\n");
    await writeSearchFixture("TASK-1000-final", "task.md", "orden final\n");

    await expect(searchTaskCapsules(tmp, "   ")).rejects.toThrow("non-empty");
    expect(await searchTaskCapsules(tmp, "orden")).toEqual([
      {
        taskId: "TASK-002",
        taskDir: ".akrctx/tasks/TASK-002-legacy",
        file: ".akrctx/tasks/TASK-002-legacy/task.md",
        line: 1,
        text: "orden legacy",
      },
      {
        taskId: "TASK-010",
        taskDir: ".akrctx/tasks/TASK-010-acentos",
        file: ".akrctx/tasks/TASK-010-acentos/context.md",
        line: 1,
        text: "orden contexto",
      },
      {
        taskId: "TASK-1000",
        taskDir: ".akrctx/tasks/TASK-1000-final",
        file: ".akrctx/tasks/TASK-1000-final/task.md",
        line: 1,
        text: "orden final",
      },
    ]);
    expect(await searchTaskCapsules(tmp, "éClAiR")).toEqual([
      {
        taskId: "TASK-010",
        taskDir: ".akrctx/tasks/TASK-010-acentos",
        file: ".akrctx/tasks/TASK-010-acentos/task.md",
        line: 1,
        text: "Éclair [a-z]",
      },
      {
        taskId: "TASK-010",
        taskDir: ".akrctx/tasks/TASK-010-acentos",
        file: ".akrctx/tasks/TASK-010-acentos/task.md",
        line: 2,
        text: "Éclair Éclair",
      },
      {
        taskId: "TASK-010",
        taskDir: ".akrctx/tasks/TASK-010-acentos",
        file: ".akrctx/tasks/TASK-010-acentos/acceptance-criteria.md",
        line: 1,
        text: "ÉCLAIR criterio",
      },
    ]);
    expect(await searchTaskCapsules(tmp, "[a-z]")).toHaveLength(1);
    expect(await searchTaskCapsules(tmp, "eclair")).toEqual([]);
    expect(await searchTaskCapsules(tmp, "sin coincidencias")).toEqual([]);
  });

  it("applies blocked-read policy before searching and rejects an absent policy", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await mkdir(path.join(tmp, ".akrctx/tasks/TASK-002-private/task.md"), { recursive: true });
    await writeFile(
      path.join(tmp, ".akrctx/policy.json"),
      JSON.stringify({ blockedReadPatterns: ["task.md"] }),
      "utf8",
    );

    expect(await searchTaskCapsules(tmp, "dato bloqueado")).toEqual([]);

    await rm(path.join(tmp, ".akrctx/policy.json"));
    await expect(searchTaskCapsules(tmp, "dato bloqueado")).rejects.toThrow(
      "Cannot apply policy.json blockedReadPatterns",
    );

    await writeFile(path.join(tmp, ".akrctx/policy.json"), "not valid JSON", "utf8");
    await expect(searchTaskCapsules(tmp, "dato bloqueado")).rejects.toThrow(
      "Cannot apply policy.json blockedReadPatterns",
    );
  });

  it("rejects a symbolic .akrctx root before reading its policy or capsules", async () => {
    const externalRoot = path.join(tmp, "external-akrctx");
    await mkdir(path.join(externalRoot, "tasks/TASK-002-external"), { recursive: true });
    await writeFile(path.join(externalRoot, "policy.json"), JSON.stringify({ blockedReadPatterns: [] }), "utf8");
    await writeFile(path.join(externalRoot, "tasks/TASK-002-external/task.md"), "contenido externo\n", "utf8");
    await symlink(externalRoot, path.join(tmp, ".akrctx"), "dir");

    await expect(searchTaskCapsules(tmp, "contenido externo")).rejects.toThrow(
      "Cannot search task capsules through symbolic link: .akrctx.",
    );
  });

  it("skips missing canonical files and every symbolic link, but reports other read errors", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const externalDirectory = path.join(tmp, "external-capsule");
    await mkdir(externalDirectory);
    await writeFile(path.join(externalDirectory, "task.md"), "outside directory\n", "utf8");
    await symlink(externalDirectory, path.join(tmp, ".akrctx/tasks/TASK-002-external"), "dir");

    const externalFile = path.join(tmp, "external.md");
    await writeFile(externalFile, "outside file\n", "utf8");
    await mkdir(path.join(tmp, ".akrctx/tasks/TASK-003-file-link"), { recursive: true });
    await symlink(externalFile, path.join(tmp, ".akrctx/tasks/TASK-003-file-link/task.md"), "file");
    await writeSearchFixture("TASK-004-missing", "context.md", "legacy sin task.md\n");

    expect(await searchTaskCapsules(tmp, "outside")).toEqual([]);
    expect(await searchTaskCapsules(tmp, "legacy")).toEqual([
      {
        taskId: "TASK-004",
        taskDir: ".akrctx/tasks/TASK-004-missing",
        file: ".akrctx/tasks/TASK-004-missing/context.md",
        line: 1,
        text: "legacy sin task.md",
      },
    ]);

    await mkdir(path.join(tmp, ".akrctx/tasks/TASK-005-unreadable", "task.md"), { recursive: true });
    await expect(searchTaskCapsules(tmp, "anything")).rejects.toThrow(/task\.md/);
  });

  it("taskNumber extracts the numeric id", () => {
    expect(taskNumber("TASK-002-fix-bug")).toBe(2);
    expect(taskNumber("TASK-1000-x")).toBe(1000);
  });

  it("showTask returns task files and workflow", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    const result = await showTask(tmp, task.taskId);

    expect(result.taskId).toBe(task.taskId);
    expect(result.workflow).toBe("TDD");
    expect(result.files["task.md"]).toContain("Fix auth bug");
    expect(result.files["plan.md"]).toBeDefined();
  });

  it("removeTask deletes a task capsule", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    const result = await removeTask(tmp, task.taskId, { cwd: tmp });

    expect(result.removed).toBe(true);
    expect(await pathExists(path.join(tmp, task.taskDir))).toBe(false);
  });

  it("removeTask respects dry-run", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    const result = await removeTask(tmp, task.taskId, { cwd: tmp, dryRun: true });

    expect(result.removed).toBe(false);
    expect(await pathExists(path.join(tmp, task.taskDir))).toBe(true);
  });

  it("compiles briefs for all installed targets", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    const result = await runCompile(task.taskId, { cwd: tmp, target: "all", nonInteractive: true });

    expect(Array.isArray(result)).toBe(true);
    const results = result as Array<{ target: string; outputPath: string }>;
    expect(results.length).toBeGreaterThanOrEqual(2);
    const targets = results.map((r) => r.target).sort();
    expect(targets).toContain("codex");
    expect(targets).toContain("claude");
    for (const r of results) {
      expect(await pathExists(path.join(tmp, r.outputPath))).toBe(true);
    }
  });
});

// ── config ───────────────────────────────────────────────────────────────────

describe("config", () => {
  it("throws a descriptive error for unsupported config keys", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await expect(setConfigValue(tmp, "unknownKey", "value")).rejects.toThrow('Unsupported config key: "unknownKey"');
  });

  it("setConfigValue updates workflow correctly", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await setConfigValue(tmp, "defaultWorkflow", "TDD");
    expect(result.defaults.workflow).toBe("TDD");
  });

  it("does not allow config set to bypass comprehension privacy checks", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await expect(setConfigValue(tmp, "comprehensionGateEnabled", "true")).rejects.toThrow("Unsupported config key");
  });

  it("normalizes invalid comprehension configuration to safe defaults", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.comprehensionGate = { enabled: "yes", trigger: "always", evaluationMode: "same-session" };
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const normalized = await readConfig(tmp);

    expect(normalized?.comprehensionGate).toEqual({
      enabled: false,
      trigger: "always",
      evaluationMode: "prefer-independent",
    });
  });

  it("setConfigValue updates allowedWorkflows from a comma-separated list", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await setConfigValue(tmp, "allowedWorkflows", "SDD, TDD, fast-patch");
    expect(result.defaults.allowedWorkflows).toEqual(["SDD", "TDD", "fast-patch"]);
  });

  it("setConfigValue normalizes and deduplicates allowedWorkflows", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await setConfigValue(tmp, "allowedWorkflows", "sdd+tdd, TDD, sdd-tdd");
    expect(result.defaults.allowedWorkflows).toEqual(["SDD+TDD", "TDD"]);
  });

  it("setConfigValue rejects invalid workflows in allowedWorkflows", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await expect(setConfigValue(tmp, "allowedWorkflows", "SDD, fake-workflow")).rejects.toThrow(
      'Unsupported workflow in allowedWorkflows: "fake-workflow"',
    );
  });

  it("setConfigValue rejects an empty allowedWorkflows list", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await expect(setConfigValue(tmp, "allowedWorkflows", "   ")).rejects.toThrow(
      "allowedWorkflows must contain at least one workflow",
    );
  });

  it("readConfig throws on corrupt JSON instead of returning undefined", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/config.json"), "{ broken json", "utf8");

    await expect(readConfig(tmp)).rejects.toThrow("invalid JSON");
  });

  it("readConfig returns undefined when config.json is simply missing", async () => {
    await expect(readConfig(tmp)).resolves.toBeUndefined();
  });

  it("setConfigValue throws instead of silently overwriting a corrupt config", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/config.json"), "{ broken json", "utf8");

    await expect(setConfigValue(tmp, "defaultWorkflow", "TDD")).rejects.toThrow("invalid JSON");
  });

  it("CLI config show throws a clear error on corrupt JSON", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/config.json"), "{ broken json", "utf8");
    const previousCwd = process.cwd();
    const originalLog = console.log;
    console.log = () => {};

    try {
      process.chdir(tmp);
      await expect(main(["node", "akrctx", "config", "show"])).rejects.toThrow("invalid JSON");
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }
  });
});

// ── silent degradation ───────────────────────────────────────────────────────

describe("silent degradation", () => {
  const corrupt = async (contents: string) => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/config.json"), contents, "utf8");
  };

  it("refuses to select a workflow from a corrupt config instead of allowing every workflow", async () => {
    await corrupt("{ broken json");

    // The defect: readConfig returned undefined, selectWorkflow fell back to the full
    // workflow list, and the task capsule was written as if the project had configured
    // no restrictions at all.
    await expect(runTask("Add invoice API", { cwd: tmp, nonInteractive: true })).rejects.toThrow("invalid JSON");
  });

  it("reports a corrupt config from status instead of calling it not configured", async () => {
    await corrupt("{ broken json");

    await expect(runStatus({ cwd: tmp, nonInteractive: true })).rejects.toThrow("invalid JSON");
  });

  it("still diagnoses a repository whose config.json is corrupt", async () => {
    await corrupt("{ broken json");

    // Doctor is the one caller that must tolerate corruption: diagnosing broken
    // repositories is its entire job. It reports the corruption rather than crashing.
    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.missing).toContain(".akrctx/config.json — invalid JSON (run akrctx init to regenerate)");
  });

  it.each([
    ["null", "null"],
    ["an array", "[]"],
    ["a number", "42"],
  ])("rejects a config that is %s rather than defaulting to a codex install", async (_label, contents) => {
    await corrupt(contents);

    await expect(readConfig(tmp)).rejects.toThrow("not a JSON object");
  });

  it("rejects a config that declares no recognizable target instead of inventing codex", async () => {
    await corrupt(JSON.stringify({ version: 1, targets: ["not-a-real-agent"] }));

    // The defect: normalizeConfig substituted ["codex"] here, so a claude-only repo with
    // a damaged targets list silently became a codex install.
    await expect(readConfig(tmp)).rejects.toThrow("no recognized target");
  });

  it("reports a target-less config as a doctor gap rather than crashing on it", async () => {
    await corrupt(JSON.stringify({ version: 1, targets: [] }));

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.missing).toContain(".akrctx/config.json — targets must list at least one supported target");
  });
});

// ── canonical capsule file list ──────────────────────────────────────────────

describe("canonical capsule file list", () => {
  // Deliberately no literal list here. A third copy of the names in the tests would let
  // a sixth capsule file be added to the constant while `task create` and `_template`
  // quietly kept producing five — which is the defect this block exists to prevent.
  it("ships every capsule file in the _template directory", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const shipped = await readdir(path.join(tmp, ".akrctx/tasks/_template"));

    expect(shipped.sort()).toEqual([...capsuleFiles].sort());
  });

  it("derives the shipped template from the canonical list", () => {
    expect(Object.keys(taskTemplateFiles).sort()).toEqual(capsuleFiles.map((f) => `tasks/_template/${f}`).sort());
  });

  it("writes every capsule file when task create generates a capsule", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });

    for (const name of capsuleFiles) {
      expect(task.writes).toContain(path.posix.join(task.taskDir, name));
    }
  });

  it("computes a judge scope for a capsule copied verbatim from _template", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    // The defect end to end: _template shipped four files, createJudgeScope required
    // five, so `akrctx judge scope` failed on a capsule the harness itself produced.
    const capsule = path.join(tmp, ".akrctx/tasks/TASK-001-copied-from-template");
    await mkdir(capsule, { recursive: true });
    for (const name of await readdir(path.join(tmp, ".akrctx/tasks/_template"))) {
      await writeFile(
        path.join(capsule, name),
        await readFile(path.join(tmp, ".akrctx/tasks/_template", name)),
        "utf8",
      );
    }
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });

    const scope = await createJudgeScope(tmp, "TASK-001", "HEAD", "WORKTREE");

    expect(scope.taskId).toBe("TASK-001");
    expect(scope.taskDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("requires every capsule template file in doctor", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await rm(path.join(tmp, ".akrctx/tasks/_template/acceptance-criteria.md"));

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.missing).toContain(".akrctx/tasks/_template/acceptance-criteria.md");
  });

  it("creates the capsule template file missing from an older installation on upgrade", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const existing = path.join(tmp, ".akrctx/tasks/_template/task.md");
    await writeFile(existing, "# Task\n\nProject-owned edit that must survive.\n", "utf8");
    await rm(path.join(tmp, ".akrctx/tasks/_template/acceptance-criteria.md"));

    await runUpgrade({ cwd: tmp, nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".akrctx/tasks/_template/acceptance-criteria.md"))).toBe(true);
    expect(await readFile(existing, "utf8")).toContain("Project-owned edit that must survive.");
  });
});

// ── normalizeWorkflow ────────────────────────────────────────────────────────

describe("normalizeWorkflow", () => {
  it.each([
    ["sdd+tdd", "SDD+TDD"],
    ["SDD+TDD", "SDD+TDD"],
    ["tdd+sdd", "SDD+TDD"],
    ["sdd-tdd", "SDD+TDD"],
    ["SDD_TDD", "SDD+TDD"],
    ["sdd+edd", "SDD+EDD"],
    ["tdd+edd", "TDD+EDD"],
    ["fast-patch", "fast-patch"],
    ["fastpatch", "fast-patch"],
    ["research-first", "research-first"],
    ["researchfirst", "research-first"],
  ])("normalizes %s → %s", (input, expected) => {
    expect(normalizeWorkflow(input)).toBe(expected);
  });

  it("returns undefined for unknown workflow strings", () => {
    expect(normalizeWorkflow("unknown")).toBeUndefined();
    expect(normalizeWorkflow("")).toBeUndefined();
    expect(normalizeWorkflow(undefined)).toBeUndefined();
  });
});

// ── recommendWorkflow ────────────────────────────────────────────────────────

describe("recommendWorkflow — word boundary correctness", () => {
  it("does not match 'api' inside 'capitalism'", () => {
    const { workflow } = recommendWorkflow("capitalism economics");
    expect(workflow).toBe("fast-patch");
  });

  it("does not match 'spec' inside 'inspector'", () => {
    const { workflow } = recommendWorkflow("run the inspector");
    expect(workflow).toBe("fast-patch");
  });

  it("does not match 'fix' inside 'prefix'", () => {
    const { workflow } = recommendWorkflow("add prefix to config keys");
    expect(workflow).toBe("fast-patch");
  });

  it("does not match 'test' inside 'latest'", () => {
    const { workflow } = recommendWorkflow("upgrade to latest version");
    expect(workflow).toBe("fast-patch");
  });

  it("prioritizes bug signals over domain keywords: 'fix the api bug' matches TDD, not SDD", () => {
    const { workflow } = recommendWorkflow("fix the api bug");
    expect(workflow).toBe("TDD");
  });

  it("no longer treats 'tetris' as a game/interactive keyword on its own", () => {
    const { workflow } = recommendWorkflow("build a tetris clone");
    expect(workflow).toBe("fast-patch");
  });

  it("matches standalone 'api'", () => {
    const { workflow } = recommendWorkflow("create user api endpoint");
    expect(workflow).toBe("SDD");
  });

  it("matches standalone 'fix'", () => {
    const { workflow } = recommendWorkflow("fix the auth bug");
    expect(workflow).toBe("TDD");
  });

  it("matches 'regression'", () => {
    const { workflow } = recommendWorkflow("address login regression");
    expect(workflow).toBe("TDD");
  });

  it("matches 'screen' and returns UI review", () => {
    const { workflow } = recommendWorkflow("create settings screen");
    expect(workflow).toBe("UI review");
  });

  it("returns workflowReason for every path", () => {
    const paths = [
      "sdd edd example",
      "sdd tdd contract",
      "tetris game",
      "edge case example",
      "api schema",
      "fix regression bug",
      "ui screen",
      "research investigate",
      "generic change",
    ];
    for (const desc of paths) {
      const { reason } = recommendWorkflow(desc);
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});

// ── slugify ───────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("converts description to slug", () => {
    expect(slugify("Create User API endpoint")).toBe("create-user-api-endpoint");
  });

  it("truncates at 64 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBe(64);
  });

  it("falls back to 'task' for empty/special-char descriptions", () => {
    expect(slugify("!!!")).toBe("task");
    expect(slugify("")).toBe("task");
  });
});

// ── status ────────────────────────────────────────────────────────────────────

describe("status", () => {
  it("returns not-installed status before init", async () => {
    const result = await runStatus({ cwd: tmp, nonInteractive: true });

    expect(result.installed).toBe(false);
    expect(result.taskCount).toBe(0);
  });

  it("orders recentTaskIds numerically (not lexicographically) for TASK-002/010/1000", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    for (const n of [2, 10, 1000]) {
      await mkdir(path.join(tmp, ".akrctx/tasks", `TASK-${String(n).padStart(3, "0")}-x`), { recursive: true });
    }

    const result = await runStatus({ cwd: tmp, nonInteractive: true });

    expect(result.recentTaskIds).toEqual(["TASK-1000", "TASK-010", "TASK-002"]);
  });

  it("shows installed targets and task count after init and task creation", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });
    await runTask("Add user schema", { cwd: tmp, nonInteractive: true });

    const result = await runStatus({ cwd: tmp, nonInteractive: true });

    expect(result.installed).toBe(true);
    expect(result.targets).toContain("codex");
    expect(result.taskCount).toBe(2);
    expect(result.comprehensionGate).toBe("disabled");
    expect(result.recentTaskIds).toContain("TASK-001");
    expect(result.recentTaskIds).toContain("TASK-002");
  });
});

// ── templates ────────────────────────────────────────────────────────────────

describe("templates", () => {
  it("lists bundled template packs", async () => {
    const writes: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      writes.push(String(message));
    };

    try {
      await main(["node", "akrctx", "templates", "list", "--json"]);
    } finally {
      console.log = originalLog;
    }

    const parsed = JSON.parse(writes.join("\n"));
    expect(parsed.some((template: { name: string }) => template.name === "test-template")).toBe(true);
  });

  it("applies a local template after initialization without rerunning the harness", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const agentsBefore = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    const pack = await createLocalTemplatePack(tmp, "company-base", {
      config: { defaults: { workflow: "TDD" } },
      policy: { blockedReadPatterns: ["company-secrets/"] },
      wiki: { "company.md": "# Company rules\n" },
      skills: { "company-review": "# Company Review\n" },
    });

    const result = await runTemplateApply({
      cwd: tmp,
      templateRef: pack,
      local: true,
      nonInteractive: true,
    });
    const config = await readConfig(tmp);
    const policy = JSON.parse(await readFile(path.join(tmp, ".akrctx/policy.json"), "utf8"));

    expect(result.completed).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(await readFile(path.join(tmp, "AGENTS.md"), "utf8")).toBe(agentsBefore);
    expect(await pathExists(path.join(tmp, ".agents/skills/company-review/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/wiki/company.md"))).toBe(true);
    expect(config?.defaults.workflow).toBe("TDD");
    expect(config?.templatePacks).toHaveLength(1);
    expect(config?.templatePacks[0].name).toBe("company-base");
    expect(config?.templatePacks[0].fileHashes[".agents/skills/company-review/SKILL.md"]).toMatch(/^sha256:/);
    expect(policy.blockedReadPatterns).toContain("company-secrets/");
  });

  it("exposes post-init apply and status through the CLI", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const pack = await createLocalTemplatePack(tmp, "cli-template", {
      skills: { "cli-template": "# CLI Template\n" },
    });
    const previousCwd = process.cwd();
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => logs.push(String(message));
    try {
      process.chdir(tmp);
      await main(["node", "akrctx", "templates", "apply", pack, "--local", "--json"]);
      const applied = JSON.parse(logs.join("\n"));
      expect(applied.completed).toBe(true);
      logs.length = 0;
      await main(["node", "akrctx", "templates", "status", "--json"]);
      const status = JSON.parse(logs.join("\n"));
      expect(status.templates[0].name).toBe("cli-template");
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }
  });

  it("applies multiple templates sequentially and records both", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const base = await createLocalTemplatePack(tmp, "company-base", {
      skills: { "company-base": "# Base\n" },
    });
    const security = await createLocalTemplatePack(tmp, "security-rules", {
      policy: { blockedReadPatterns: ["security-private/"] },
      skills: { "security-rules": "# Security\n" },
    });

    await runTemplateApply({ cwd: tmp, templateRef: base, local: true, nonInteractive: true });
    await runTemplateApply({ cwd: tmp, templateRef: security, local: true, nonInteractive: true });
    const status = await runTemplateStatus({ cwd: tmp, nonInteractive: true });

    expect(status.templates.map((template) => template.name)).toEqual(["company-base", "security-rules"]);
    expect(await pathExists(path.join(tmp, ".agents/skills/company-base/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/security-rules/SKILL.md"))).toBe(true);
  });

  it("blocks transactionally on project-content conflicts and writes a versioned candidate", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const pack = await createLocalTemplatePack(tmp, "testing-standard", {
      config: { defaults: { workflow: "TDD" } },
      wiki: { "testing.md": "# Required company testing\n" },
      skills: { "testing-standard": "# Testing Standard\n" },
    });

    const blocked = await runTemplateApply({ cwd: tmp, templateRef: pack, local: true, nonInteractive: true });
    const candidate = path.join(tmp, ".akrctx/template-candidates/testing-standard/1.0.0/.akrctx/wiki/testing.md");

    expect(blocked.completed).toBe(false);
    expect(blocked.conflicts).toContain(".akrctx/wiki/testing.md");
    expect(await pathExists(candidate)).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/testing-standard/SKILL.md"))).toBe(false);
    expect((await readConfig(tmp))?.defaults.workflow).toBe("task-fit");
    expect((await readConfig(tmp))?.templatePacks).toEqual([]);

    await writeFile(path.join(tmp, ".akrctx/wiki/testing.md"), await readFile(candidate));
    const applied = await runTemplateApply({ cwd: tmp, templateRef: pack, local: true, nonInteractive: true });

    expect(applied.completed).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/testing-standard/SKILL.md"))).toBe(true);
    expect((await readConfig(tmp))?.defaults.workflow).toBe("TDD");
  });

  it("treats root instructions as a nonblocking human-approved merge", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const agentsBefore = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    const pack = await createLocalTemplatePack(tmp, "root-guidance", {
      rootInstructions: "# Company root guidance\n",
      skills: { "root-guidance": "# Root Guidance\n" },
    });

    const result = await runTemplateApply({ cwd: tmp, templateRef: pack, local: true, nonInteractive: true });

    expect(result.completed).toBe(true);
    expect(result.pendingMerges).toEqual(["AGENTS.md"]);
    expect(await readFile(path.join(tmp, "AGENTS.md"), "utf8")).toBe(agentsBefore);
    expect(await readFile(path.join(tmp, "AGENTS.akrctx.suggested.md"), "utf8")).toContain("Company root guidance");
    expect(await pathExists(path.join(tmp, ".agents/skills/root-guidance/SKILL.md"))).toBe(true);
  });

  it("blocks a second root proposal instead of replacing an existing suggestion", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const first = await createLocalTemplatePack(tmp, "first-root", {
      rootInstructions: "# First root\n",
    });
    const second = await createLocalTemplatePack(tmp, "second-root", {
      rootInstructions: "# Second root\n",
      skills: { "second-root": "# Second Root\n" },
    });
    await runTemplateApply({ cwd: tmp, templateRef: first, local: true, nonInteractive: true });

    const result = await runTemplateApply({ cwd: tmp, templateRef: second, local: true, nonInteractive: true });

    expect(result.completed).toBe(false);
    expect(result.conflicts).toContain("AGENTS.md");
    expect(await readFile(path.join(tmp, "AGENTS.akrctx.suggested.md"), "utf8")).toContain("First root");
    expect(await pathExists(path.join(tmp, ".akrctx/template-candidates/second-root/1.0.0/AGENTS.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/second-root/SKILL.md"))).toBe(false);
  });

  it("supports dry-run and rejects force or ambiguous multi-target application", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    const pack = await createLocalTemplatePack(tmp, "dry-template", {
      skills: { "dry-template": "# Dry\n" },
    });

    await expect(runTemplateApply({ cwd: tmp, templateRef: pack, local: true, nonInteractive: true })).rejects.toThrow(
      "Multiple targets are installed",
    );
    await expect(
      runTemplateApply({ cwd: tmp, templateRef: pack, local: true, target: "all", nonInteractive: true }),
    ).rejects.toThrow("target-relative");
    await expect(
      runTemplateApply({ cwd: tmp, templateRef: pack, local: true, target: "codex", force: true }),
    ).rejects.toThrow("does not support --force");

    const dryRun = await runTemplateApply({
      cwd: tmp,
      templateRef: pack,
      local: true,
      target: "codex",
      dryRun: true,
      nonInteractive: true,
    });
    expect(dryRun.completed).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/dry-template/SKILL.md"))).toBe(false);
    expect((await readConfig(tmp))?.templatePacks).toEqual([]);
  });

  it("requires an initialized project with valid provenance and policy", async () => {
    const pack = await createLocalTemplatePack(tmp, "requirements", {
      skills: { requirements: "# Requirements\n" },
    });
    await expect(runTemplateApply({ cwd: tmp, templateRef: pack, local: true, nonInteractive: true })).rejects.toThrow(
      "not installed",
    );

    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".akrctx/manifest.json"));
    await expect(runTemplateApply({ cwd: tmp, templateRef: pack, local: true, nonInteractive: true })).rejects.toThrow(
      "valid .akrctx/manifest.json",
    );

    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/policy.json"), "[]\n", "utf8");
    await expect(runTemplateApply({ cwd: tmp, templateRef: pack, local: true, nonInteractive: true })).rejects.toThrow(
      "policy.json is invalid",
    );
  });

  it("keeps template-owned target files out of upgrade obsolete reports", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const pack = await createLocalTemplatePack(tmp, "upgrade-safe", {
      skills: { "upgrade-safe": "# Upgrade Safe\n" },
    });
    await runTemplateApply({ cwd: tmp, templateRef: pack, local: true, nonInteractive: true });

    const upgrade = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(upgrade.obsolete).not.toContain(".agents/skills/upgrade-safe/SKILL.md");
    expect(await pathExists(path.join(tmp, ".agents/skills/upgrade-safe/SKILL.md"))).toBe(true);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────

describe("remove", () => {
  it("defaults to dry-run when --force is not passed", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await runRemove({ cwd: tmp, target: "codex", dryRun: false, force: false, nonInteractive: true });

    expect(result.dryRun).toBe(true);
    expect(result.planned).toContain(".agents/skills/akrctx-doctor/SKILL.md");
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(true);
  });

  it("CLI remove defaults to dry-run without --force", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const previousCwd = process.cwd();
    const originalLog = console.log;
    console.log = () => {};

    try {
      process.chdir(tmp);
      await main(["node", "akrctx", "remove", "--target", "codex"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }

    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(true);
  });

  it("dry-run lists files to remove without deleting them", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await runRemove({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });

    expect(result.dryRun).toBe(true);
    expect(result.planned.length).toBeGreaterThan(0);
    // AGENTS.md is protected — should be skipped.
    expect(result.protected).toContain("AGENTS.md");
    // Files must still exist after dry-run.
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(true);
  });

  it("--force actually removes skill files", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await runRemove({ cwd: tmp, target: "codex", force: true, nonInteractive: true });

    expect(result.dryRun).toBe(false);
    expect(result.planned).toContain(".agents/skills/akrctx-doctor/SKILL.md");
    expect(result.planned).toContain(".agents/skills/akrctx-doctor/");
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(false);
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor"))).toBe(false);
    // Protected file must survive.
    expect(await pathExists(path.join(tmp, "AGENTS.md"))).toBe(true);
  });

  it("does not prune directories that contain non-akrctx user files", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await writeFile(path.join(tmp, ".github/skills/akrctx-doctor/notes.md"), "# Keep me\n", "utf8");

    await runRemove({ cwd: tmp, target: "copilot", force: true, nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".github/skills/akrctx-doctor/SKILL.md"))).toBe(false);
    expect(await pathExists(path.join(tmp, ".github/skills/akrctx-doctor/notes.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".github/skills/akrctx-doctor"))).toBe(true);
  });

  it("dry-run planned matches the actual run's planned for a real target", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const dryRunResult = await runRemove({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });
    const realResult = await runRemove({ cwd: tmp, target: "codex", force: true, nonInteractive: true });

    expect(dryRunResult.planned.slice().sort()).toEqual(realResult.planned.slice().sort());
  });

  it("--all --force removes .akrctx directory", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await runRemove({ cwd: tmp, force: true, all: true, nonInteractive: true } as Parameters<typeof runRemove>[0]);

    expect(await pathExists(path.join(tmp, ".akrctx"))).toBe(false);
  });

  it("--all unwires tracing for every target before removing its config", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    const claudeSettings = path.join(tmp, ".claude/settings.json");
    await mkdir(path.dirname(claudeSettings), { recursive: true });
    await writeFile(
      claudeSettings,
      JSON.stringify({
        model: "keep-me",
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "foreign-pre" }] }] },
      }),
      "utf8",
    );
    const { runTraceEnable } = await import("../src/hook/install.js");
    await runTraceEnable({ cwd: tmp, nonInteractive: true });

    const result = await runRemove({ cwd: tmp, force: true, all: true, purgeLocal: true, nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".akrctx/config.json"))).toBe(false);
    const preservedClaude = await readFile(claudeSettings, "utf8");
    expect(preservedClaude).toContain("foreign-pre");
    expect(preservedClaude).toContain("keep-me");
    expect(preservedClaude).not.toContain("--akrctx-trace");
    expect(await readFile(path.join(tmp, ".codex/hooks.json"), "utf8")).not.toContain("--akrctx-trace");
    expect(await readFile(path.join(tmp, ".github/hooks/akrctx-trace.json"), "utf8")).not.toContain("--akrctx-trace");
    expect(await pathExists(path.join(tmp, ".pi/extensions/akrctx-trace.ts"))).toBe(false);
    expect(result.updated).toEqual(
      expect.arrayContaining([
        ".claude/settings.json",
        ".codex/hooks.json",
        ".github/hooks/akrctx-trace.json",
        ".pi/extensions/akrctx-trace.ts",
      ]),
    );
  });

  it("--all dry-run plans trace cleanup without changing hooks", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    const { runTraceEnable } = await import("../src/hook/install.js");
    await runTraceEnable({ cwd: tmp, nonInteractive: true });
    const settingsPath = path.join(tmp, ".claude/settings.json");
    const before = await readFile(settingsPath, "utf8");

    const result = await runRemove({ cwd: tmp, all: true, nonInteractive: true });

    expect(result.dryRun).toBe(true);
    expect(result.updated).toContain(".claude/settings.json");
    expect(await readFile(settingsPath, "utf8")).toBe(before);
    expect(await pathExists(path.join(tmp, ".akrctx/config.json"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".pi/extensions/akrctx-trace.ts"))).toBe(true);
  });

  it("--all preserves a foreign Pi extension at the trace path", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const extensionPath = path.join(tmp, ".pi/extensions/akrctx-trace.ts");
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, "// foreign extension with a coincidental filename\n", "utf8");

    await runRemove({ cwd: tmp, force: true, all: true, nonInteractive: true });

    expect(await readFile(extensionPath, "utf8")).toBe("// foreign extension with a coincidental filename\n");
  });

  it("--all --force preserves .akrctx/tasks/ when task capsules exist", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    const result = await runRemove({
      cwd: tmp,
      force: true,
      all: true,
      nonInteractive: true,
    } as Parameters<typeof runRemove>[0]);

    expect(await pathExists(path.join(tmp, task.taskDir))).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/config.json"))).toBe(false);
    expect(result.protected.some((p) => p.includes(".akrctx/tasks/"))).toBe(true);
  });

  it("--all --purge-tasks --force removes everything including task capsules", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });

    await runRemove({
      cwd: tmp,
      force: true,
      all: true,
      purgeTasks: true,
      nonInteractive: true,
    } as Parameters<typeof runRemove>[0]);

    expect(await pathExists(path.join(tmp, task.taskDir))).toBe(false);
    expect(await pathExists(path.join(tmp, ".akrctx"))).toBe(false);
  });

  it("--all preserves personal comprehension records unless --purge-local is used", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const recordPath = path.join(tmp, ".akrctx/local/comprehension/TASK-001/session/result.json");
    await mkdir(path.dirname(recordPath), { recursive: true });
    await writeFile(recordPath, "{}\n", "utf8");

    const result = await runRemove({ cwd: tmp, force: true, all: true, nonInteractive: true });

    expect(await pathExists(recordPath)).toBe(true);
    expect(result.protected.some((entry) => entry.includes("--purge-local"))).toBe(true);

    await runRemove({ cwd: tmp, force: true, all: true, purgeLocal: true, nonInteractive: true });
    expect(await pathExists(path.join(tmp, ".akrctx/local"))).toBe(false);
  });

  it("--all dry-run treats the upgrade ledger as removable runtime state", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/manifest.json"), "{ invalid manifest\n", "utf8");
    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    const ledgerPath = path.join(tmp, ".akrctx/local/upgrade-candidates.json");
    expect(await pathExists(ledgerPath)).toBe(true);

    const preview = await runRemove({ cwd: tmp, all: true, nonInteractive: true });
    expect(await pathExists(ledgerPath)).toBe(true);
    const actual = await runRemove({ cwd: tmp, all: true, force: true, nonInteractive: true });

    expect(preview.planned.slice().sort()).toEqual(actual.planned.slice().sort());
    expect(await pathExists(ledgerPath)).toBe(false);
    expect(await pathExists(path.join(tmp, ".akrctx"))).toBe(false);
  });

  it("removes the optional comprehension agent with its target adapter", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runComprehensionEnable({ cwd: tmp, nonInteractive: true });
    const agentPath = path.join(tmp, ".codex/agents/akrctx-comprehension.toml");
    expect(await pathExists(agentPath)).toBe(true);

    await runRemove({ cwd: tmp, target: "codex", force: true, nonInteractive: true });

    expect(await pathExists(agentPath)).toBe(false);
  });
});

// ── skill content contract ────────────────────────────────────────────────────

describe("skill content contract", () => {
  it("installed workflow skill contains every workflow name and UI review", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const skill = await readFile(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"), "utf8");

    for (const w of workflows) {
      expect(skill, `skill missing workflow: ${w}`).toContain(w);
    }
    expect(skill, "skill missing UI review").toContain("UI review");
  });

  it("teaches immutable review snapshots without authorizing Git mutations", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    const workflow = await readFile(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"), "utf8");
    const judge = await readFile(path.join(tmp, ".codex/agents/akrctx-judge.toml"), "utf8");
    const contract = await readFile(path.join(tmp, ".akrctx/judge/README.md"), "utf8");

    expect(workflow).toContain("akrctx judge snapshot TASK-XXX");
    expect(workflow).toContain("never commits, stages, stashes, checks out, creates a branch or ref");
    expect(judge).toContain(".akrctx/local/judge/snapshots/<id>/worktree");
    expect(contract).toContain("CURRENT");
    expect(contract).toContain("NEWER_CHANGES");
    expect(contract).toContain("DIVERGED");
  });

  it("installs comprehension as an independent agent instead of a main-context skill", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runComprehensionEnable({ cwd: tmp, nonInteractive: true });

    const agent = await readFile(path.join(tmp, ".codex/agents/akrctx-comprehension.toml"), "utf8");

    expect(agent).toContain('sandbox_mode = "read-only"');
    expect(agent).toContain('model_reasoning_effort = "high"');
    expect(agent).toContain("Do not inherit the implementing agent's reasoning");
    expect(agent).toContain("akrctx judge current <review.json> --json");
    expect(agent).toContain("current state is 'CURRENT'");
    expect(agent).toContain("Ask one question at a time");
    expect(agent).toContain("Mermaid");
    expect(agent).toContain("test matrix");
    expect(agent).toContain("INVALID_GATE");
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-comprehension/SKILL.md"))).toBe(false);
  });

  it("defines versioned schemas for scope, frozen rubric, and result", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const scope = JSON.parse(await readFile(path.join(tmp, ".akrctx/comprehension/schemas/scope.schema.json"), "utf8"));
    const rubric = JSON.parse(
      await readFile(path.join(tmp, ".akrctx/comprehension/schemas/rubric.schema.json"), "utf8"),
    );
    const result = JSON.parse(
      await readFile(path.join(tmp, ".akrctx/comprehension/schemas/result.schema.json"), "utf8"),
    );

    expect(scope.required).toContain("decision");
    expect(rubric.properties.createdBeforeAnswers.const).toBe(true);
    expect(rubric.properties.questions.maxItems).toBe(6);
    expect(result.properties.evaluationMode.enum).toEqual(["independent", "fresh-context"]);
  });

  it("config.json records the CLI version that installed the harness", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const config = await readConfig(tmp);
    expect(config?.installedVersion).toBe(CLI_VERSION);
  });

  it("wiki/overview.md includes project name and installed targets", async () => {
    await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "my-app" }), "utf8");
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const overview = await readFile(path.join(tmp, ".akrctx/wiki/overview.md"), "utf8");
    expect(overview).toContain("my-app");
    expect(overview).toContain("codex");
    expect(overview).toContain(CLI_VERSION);
  });

  it("wiki/overview.md falls back to directory name when no package.json exists", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const overview = await readFile(path.join(tmp, ".akrctx/wiki/overview.md"), "utf8");
    expect(overview).toContain(path.basename(tmp));
  });
});

// ── upgrade ───────────────────────────────────────────────────────────────────

describe("upgrade", () => {
  describe("implementation-log placement migration", () => {
    const OLD_NOTES = ".akrctx/tasks/TASK-XXX/log.md";
    const NEW_NOTES = ".akrctx/local/impl/TASK-XXX/log.md";
    const OLD_LINE = `- Implementation notes for a task: ${OLD_NOTES}`;
    const NEW_LINE = `- Implementation notes for a task: ${NEW_NOTES} (local only; never inside the capsule)`;
    const policyPath = () => path.join(tmp, ".akrctx/policy.json");
    const wikiPath = () => path.join(tmp, ".akrctx/wiki/write-policy.md");

    async function installWithOldPolicy(notes: string[]): Promise<void> {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      const policy = JSON.parse(await readFile(policyPath(), "utf8"));
      policy.writePolicy.implementationNotes = notes;
      await writeFile(policyPath(), `${JSON.stringify(policy, null, 2)}\n`, "utf8");
    }

    async function notes(): Promise<string[]> {
      return JSON.parse(await readFile(policyPath(), "utf8")).writePolicy.implementationNotes;
    }

    it("replaces the old default implementationNotes value", async () => {
      await installWithOldPolicy([OLD_NOTES]);

      await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await notes()).toEqual([NEW_NOTES]);
    });

    it.each([
      [["docs/impl-notes/TASK-XXX.md"], [NEW_NOTES, "docs/impl-notes/TASK-XXX.md"]],
      [
        [OLD_NOTES, "docs/impl-notes/TASK-XXX.md"],
        [NEW_NOTES, "docs/impl-notes/TASK-XXX.md"],
      ],
    ])("keeps custom entries and drops only the old default (%j)", async (before, after) => {
      await installWithOldPolicy(before);

      await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await notes()).toEqual(after);
    });

    it("replaces only the old implementation-notes line in an existing wiki page", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      const page = (await readFile(wikiPath(), "utf8")).replace(NEW_LINE, OLD_LINE);
      const edited = `${page}\n## Project Notes\n\nKeep this section.\n`;
      await writeFile(wikiPath(), edited, "utf8");

      await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await readFile(wikiPath(), "utf8")).toBe(edited.replace(OLD_LINE, NEW_LINE));
    });

    it("preserves a wiki page that does not carry the old line", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      const custom = "# Write Policy\n\n- Implementation notes for a task: somewhere/else.md\n";
      await writeFile(wikiPath(), custom, "utf8");

      await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await readFile(wikiPath(), "utf8")).toBe(custom);
    });

    it("is a no-op on a second run", async () => {
      await installWithOldPolicy([OLD_NOTES]);
      const page = (await readFile(wikiPath(), "utf8")).replace(NEW_LINE, OLD_LINE);
      await writeFile(wikiPath(), page, "utf8");
      await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
      const policyAfter = await readFile(policyPath(), "utf8");
      const wikiAfter = await readFile(wikiPath(), "utf8");

      const second = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await readFile(policyPath(), "utf8")).toBe(policyAfter);
      expect(await readFile(wikiPath(), "utf8")).toBe(wikiAfter);
      const touched = second.writes.filter(
        (w) => w.kind !== "preserve" && [".akrctx/policy.json", ".akrctx/wiki/write-policy.md"].includes(w.path),
      );
      expect(touched).toEqual([]);
    });
  });

  describe("capsule template provenance", () => {
    const rel = ".akrctx/tasks/_template/acceptance-criteria.md";
    const shipped = () => taskTemplateFiles["tasks/_template/acceptance-criteria.md"];
    const abs = () => path.join(tmp, rel);
    const candidate = () => path.join(tmp, `.akrctx/upgrades/${CLI_VERSION}/${rel}`);
    const OLD = "# Acceptance Criteria\n\nOld shipped wording.\n";

    async function manifestHashes(): Promise<Record<string, { hash: string }>> {
      return JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8")).files;
    }

    async function installWithOldTemplate(recordProvenance: boolean): Promise<void> {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      await writeFile(abs(), OLD, "utf8");
      const manifestFile = path.join(tmp, ".akrctx/manifest.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      if (recordProvenance) manifest.files[rel] = { hash: contentHash(OLD) };
      else delete manifest.files[rel];
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }

    it("records provenance for every capsule template on a fresh install", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

      const files = await manifestHashes();
      for (const file of capsuleFiles) {
        const key = `.akrctx/tasks/_template/${file}`;
        expect(files[key]?.hash).toBe(contentHash(await readFile(path.join(tmp, key))));
      }
    });

    it("keeps wiki knowledge and task capsules out of the manifest", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      await mkdir(path.join(tmp, ".akrctx/tasks/TASK-001-x"), { recursive: true });
      await writeFile(path.join(tmp, ".akrctx/tasks/TASK-001-x/task.md"), "# x\n", "utf8");

      await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      const keys = Object.keys(await manifestHashes());
      expect(keys.filter((key) => key.startsWith(".akrctx/wiki/"))).toEqual([]);
      expect(
        keys.filter((key) => key.startsWith(".akrctx/tasks/") && !key.startsWith(".akrctx/tasks/_template/")),
      ).toEqual([]);
    });

    it("updates a template that matches its recorded hash and lists the write", async () => {
      await installWithOldTemplate(true);

      const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await readFile(abs(), "utf8")).toBe(shipped());
      expect(result.writes.find((write) => write.path === rel)?.kind).toBe("update");
      expect((await manifestHashes())[rel]?.hash).toBe(contentHash(shipped()));
      expect(result.conflicts).not.toContain(rel);
    });

    it("produces the same template as a fresh install after an eligible upgrade", async () => {
      await installWithOldTemplate(true);
      await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
      const fresh = await mkdtemp(path.join(os.tmpdir(), "akrctx-fresh-"));
      await runInit({ cwd: fresh, target: "codex", nonInteractive: true });

      for (const file of capsuleFiles) {
        const key = `.akrctx/tasks/_template/${file}`;
        expect(await readFile(path.join(tmp, key), "utf8")).toBe(await readFile(path.join(fresh, key), "utf8"));
      }
    });

    it("preserves a personalized template and offers a candidate", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      const edited = `${await readFile(abs(), "utf8")}\nProject criterion.\n`;
      await writeFile(abs(), edited, "utf8");

      const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await readFile(abs(), "utf8")).toBe(edited);
      expect(await readFile(candidate(), "utf8")).toBe(shipped());
      expect(result.conflicts).toContain(rel);
      expect(result.completed).toBe(false);
    });

    it("preserves a differing template that has no provenance and invents no hash", async () => {
      await installWithOldTemplate(false);

      const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await readFile(abs(), "utf8")).toBe(OLD);
      expect(await readFile(candidate(), "utf8")).toBe(shipped());
      expect(result.conflicts).toContain(rel);
      expect((await manifestHashes())[rel]).toBeUndefined();
    });

    it("preserves a differing template when the manifest is invalid", async () => {
      await installWithOldTemplate(true);
      await writeFile(path.join(tmp, ".akrctx/manifest.json"), "{ invalid manifest\n", "utf8");

      const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await readFile(abs(), "utf8")).toBe(OLD);
      expect(await pathExists(candidate())).toBe(true);
      expect(result.conflicts).toContain(rel);
    });

    it("creates a missing template and records its hash", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      await rm(abs());

      await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(await readFile(abs(), "utf8")).toBe(shipped());
      expect((await manifestHashes())[rel]?.hash).toBe(contentHash(shipped()));
    });

    it("records provenance for an identical template without rewriting it", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      const manifestFile = path.join(tmp, ".akrctx/manifest.json");
      const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
      delete manifest.files[rel];
      await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

      expect(result.writes.find((write) => write.path === rel)?.kind).toBe("preserve");
      expect((await manifestHashes())[rel]?.hash).toBe(contentHash(shipped()));
      expect(await readManifest(tmp)).toBeDefined();
    });

    it("reports drift in dry-run without changing files or provenance", async () => {
      await installWithOldTemplate(true);
      await rm(path.join(tmp, ".akrctx/tasks/_template/task.md"));
      const manifestBefore = await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8");

      const result = await runUpgrade({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });

      expect(result.writes.find((write) => write.path === rel)?.kind).toBe("update");
      expect(result.writes.find((write) => write.path === ".akrctx/tasks/_template/task.md")?.kind).toBe("create");
      expect(await readFile(abs(), "utf8")).toBe(OLD);
      expect(await pathExists(path.join(tmp, ".akrctx/tasks/_template/task.md"))).toBe(false);
      expect(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8")).toBe(manifestBefore);
    });

    it("names a personalized template as a candidate in dry-run", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      await writeFile(abs(), "# Mine\n", "utf8");

      const result = await runUpgrade({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });

      expect(
        result.writes
          .filter((write) => write.path.endsWith(rel))
          .map((write) => write.kind)
          .sort(),
      ).toEqual(["preserve", "suggest"]);
      expect(await pathExists(candidate())).toBe(false);
    });
  });

  it("rejects --force because upgrades never overwrite conflicts", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const previousCwd = process.cwd();
    try {
      process.chdir(tmp);
      await expect(main(["node", "akrctx", "upgrade", "--force"])).rejects.toThrow("never force-overwrites");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("upgrades without touching protected AGENTS.md", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, "AGENTS.md"), "# Custom instructions\n", "utf8");

    const previousCwd = process.cwd();
    try {
      process.chdir(tmp);
      await main(["node", "akrctx", "upgrade", "--target", "codex"]);
    } finally {
      process.chdir(previousCwd);
    }

    expect(await readFile(path.join(tmp, "AGENTS.md"), "utf8")).toBe("# Custom instructions\n");
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"))).toBe(true);
  });

  it("records a created root-instruction candidate", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, "AGENTS.md"), "# Custom instructions\n", "utf8");

    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    const candidateKey = path.posix.join(`.akrctx/upgrades/${CLI_VERSION}`, "AGENTS.md");
    const manifest = JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8"));
    expect(manifest.candidates?.[candidateKey]).toMatchObject({
      hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  it("does not adopt a preexisting root-instruction candidate", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const candidateKey = path.posix.join(`.akrctx/upgrades/${CLI_VERSION}`, "AGENTS.md");
    const candidatePath = path.join(tmp, candidateKey);
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, "# Foreign candidate\n", "utf8");
    await writeFile(path.join(tmp, "AGENTS.md"), "# Custom instructions\n", "utf8");

    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    const manifest = JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8"));
    expect(manifest.candidates?.[candidateKey]).toBeUndefined();
  });

  it("does not record a root-instruction candidate during dry-run", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, "AGENTS.md"), "# Custom instructions\n", "utf8");
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    const before = await readFile(manifestPath, "utf8");
    const candidatePath = path.join(tmp, `.akrctx/upgrades/${CLI_VERSION}/AGENTS.md`);

    await runUpgrade({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });

    expect(await readFile(manifestPath, "utf8")).toBe(before);
    expect(await pathExists(candidatePath)).toBe(false);
  });

  it("preserves an edited skill and writes a versioned upgrade candidate", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const skillPath = path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md");
    await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\n<!-- local edit -->\n`, "utf8");
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.installedVersion = "0.2.0";
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.completed).toBe(false);
    expect(result.conflicts).toContain(".agents/skills/akrctx-doctor/SKILL.md");
    expect(await readFile(skillPath, "utf8")).toContain("local edit");
    expect(
      await pathExists(path.join(tmp, `.akrctx/upgrades/${CLI_VERSION}/.agents/skills/akrctx-doctor/SKILL.md`)),
    ).toBe(true);
    expect((await readConfig(tmp))?.installedVersion).toBe("0.2.0");

    const candidatePath = path.join(tmp, `.akrctx/upgrades/${CLI_VERSION}/.agents/skills/akrctx-doctor/SKILL.md`);
    await writeFile(skillPath, await readFile(candidatePath));
    const completed = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    expect(completed.completed).toBe(true);
    expect((await readConfig(tmp))?.installedVersion).toBe(CLI_VERSION);
  });

  it("records an unchanged skill as current without a spurious update", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    const unchanged = result.writes.find((w) => w.path === ".agents/skills/akrctx-doctor/SKILL.md");
    expect(unchanged?.kind).toBe("preserve");
    expect(result.completed).toBe(true);
  });

  it("updates a generated file only when its previous manifest hash matches", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const relativeSkill = ".agents/skills/akrctx-doctor/SKILL.md";
    const skillPath = path.join(tmp, relativeSkill);
    await writeFile(skillPath, "# Older generated template\n", "utf8");
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files[relativeSkill].hash =
      `sha256:${createHash("sha256").update("# Older generated template\n").digest("hex")}`;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.completed).toBe(true);
    expect(result.writes.find((write) => write.path === relativeSkill)?.kind).toBe("update");
    expect(await readFile(skillPath, "utf8")).toContain("# akrctx-doctor");
  });

  it("never overwrites advanced project wiki content", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const wikiPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    const advancedWiki = "# Architecture\n\nProduction knowledge accumulated over years.\n";
    await writeFile(wikiPath, advancedWiki, "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(await readFile(wikiPath, "utf8")).toBe(advancedWiki);
    expect(result.writes.find((write) => write.path === ".akrctx/wiki/architecture.md")?.reason).toContain(
      "never overwritten",
    );
  });

  it("introduces the persistent instruction audit without orphaning it from a custom wiki index", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const auditPath = path.join(tmp, ".akrctx/wiki/instruction-audit.md");
    const indexPath = path.join(tmp, ".akrctx/wiki/index.md");
    const customIndex = "# Wiki Index\n\n- [Architecture](/wiki/architecture.md) — Custom entry.\n";
    await rm(auditPath);
    await writeFile(indexPath, customIndex, "utf8");

    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    const upgradedIndex = await readFile(indexPath, "utf8");
    expect(await pathExists(auditPath)).toBe(true);
    expect(upgradedIndex).toContain(customIndex);
    expect(upgradedIndex).toContain("[Instruction Audit](/wiki/instruction-audit.md)");
    expect((await lintWiki(tmp)).orphans).not.toContain("instruction-audit.md");
  });

  it("treats a differing legacy generated file without a manifest as a conflict", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".akrctx/manifest.json"));
    const skillPath = path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md");
    await writeFile(skillPath, "# Unknown legacy content\n", "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.completed).toBe(false);
    expect(await readFile(skillPath, "utf8")).toBe("# Unknown legacy content\n");
  });

  it("dry-run does not modify wiki, manifest, or installedVersion", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const wikiPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    await writeFile(wikiPath, "# Custom wiki\n", "utf8");
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    const manifestBefore = await readFile(manifestPath, "utf8");
    const configBefore = await readFile(path.join(tmp, ".akrctx/config.json"), "utf8");

    await runUpgrade({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });

    expect(await readFile(wikiPath, "utf8")).toBe("# Custom wiki\n");
    expect(await readFile(manifestPath, "utf8")).toBe(manifestBefore);
    expect(await readFile(path.join(tmp, ".akrctx/config.json"), "utf8")).toBe(configBefore);
  });

  it("does not advance the installation version after a partial target upgrade", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.installedVersion = "0.2.0";
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    const upgradedConfig = await readConfig(tmp);

    expect(result.completed).toBe(true);
    expect(result.installationComplete).toBe(false);
    expect(upgradedConfig?.installedVersion).toBe("0.2.0");
    expect(upgradedConfig?.targets).toEqual(["codex", "claude", "copilot", "pi"]);
  });

  it("preserves invalid policy JSON and makes the upgrade incomplete", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const policyPath = path.join(tmp, ".akrctx/policy.json");
    await writeFile(policyPath, "{ invalid policy\n", "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.completed).toBe(false);
    expect(result.conflicts).toContain(".akrctx/policy.json");
    expect(await readFile(policyPath, "utf8")).toBe("{ invalid policy\n");
    expect(await pathExists(path.join(tmp, `.akrctx/upgrades/${CLI_VERSION}/.akrctx/policy.json`))).toBe(true);
  });

  it("adds missing policy fields without replacing project values", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.blockedReadPatterns = ["company-secret/"];
    policy.writePolicy = undefined;
    await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    const migrated = JSON.parse(await readFile(policyPath, "utf8"));

    expect(result.completed).toBe(true);
    expect(migrated.blockedReadPatterns).toContain("company-secret/");
    expect(migrated.writePolicy.doctor).toBeDefined();
    expect(migrated.protectedFileMerge.agentMayEdit).toBe("after-explicit-human-approval");
  });

  it("preserves an invalid provenance manifest", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    await writeFile(manifestPath, "{ invalid manifest\n", "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.completed).toBe(false);
    expect(result.conflicts).toContain(".akrctx/manifest.json");
    expect(await readFile(manifestPath, "utf8")).toBe("{ invalid manifest\n");
  });

  it("records and cleans an invalid manifest candidate in the external ledger", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    await writeFile(manifestPath, "{ invalid manifest\n", "utf8");

    const first = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    const candidateKey = path.posix.join(`.akrctx/upgrades/${CLI_VERSION}`, ".akrctx/manifest.json");
    const candidatePath = path.join(tmp, candidateKey);
    const ledgerPath = path.join(tmp, ".akrctx/local/upgrade-candidates.json");
    const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
    expect(first.completed).toBe(false);
    expect(ledger.candidates?.[candidateKey]).toMatchObject({
      hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(JSON.parse(await readFile(candidatePath, "utf8")).candidates?.[candidateKey]).toBeUndefined();

    await writeFile(manifestPath, await readFile(candidatePath));
    const resolved = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(resolved.removed).toContain(candidateKey);
    expect(await pathExists(candidatePath)).toBe(false);
    expect(await pathExists(ledgerPath)).toBe(false);
  });

  it("does not adopt a plausible foreign manifest candidate", async () => {
    const foreign = await mkdtemp(path.join(os.tmpdir(), "akrctx-foreign-"));
    await runInit({ cwd: foreign, target: "codex", nonInteractive: true });
    await writeFile(path.join(foreign, ".akrctx/manifest.json"), "{ invalid manifest\n", "utf8");
    await runUpgrade({ cwd: foreign, target: "codex", nonInteractive: true });

    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const candidateKey = path.posix.join(`.akrctx/upgrades/${CLI_VERSION}`, ".akrctx/manifest.json");
    const candidatePath = path.join(tmp, candidateKey);
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, await readFile(path.join(foreign, candidateKey)));
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    await writeFile(manifestPath, "{ invalid manifest\n", "utf8");

    const first = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    expect(first.writes.find((write) => write.path === candidateKey)?.kind).toBe("preserve");
    expect(await pathExists(path.join(tmp, ".akrctx/local/upgrade-candidates.json"))).toBe(false);

    await writeFile(manifestPath, await readFile(candidatePath));
    const resolved = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    expect(resolved.removed).not.toContain(candidateKey);
    expect(await pathExists(candidatePath)).toBe(true);
  });

  it("does not create external manifest provenance during dry-run", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    await writeFile(manifestPath, "{ invalid manifest\n", "utf8");
    const candidatePath = path.join(tmp, `.akrctx/upgrades/${CLI_VERSION}/.akrctx/manifest.json`);

    await runUpgrade({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });

    expect(await readFile(manifestPath, "utf8")).toBe("{ invalid manifest\n");
    expect(await pathExists(candidatePath)).toBe(false);
    expect(await pathExists(path.join(tmp, ".akrctx/local/upgrade-candidates.json"))).toBe(false);
  });

  it("keeps a manifest candidate and external provenance after tampering", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    await writeFile(manifestPath, "{ invalid manifest\n", "utf8");
    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    const candidateKey = path.posix.join(`.akrctx/upgrades/${CLI_VERSION}`, ".akrctx/manifest.json");
    const candidatePath = path.join(tmp, candidateKey);
    const tampered = `${await readFile(candidatePath, "utf8")}\n<!-- tampered -->\n`;
    await writeFile(candidatePath, tampered, "utf8");
    await writeFile(manifestPath, tampered, "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.removed).not.toContain(candidateKey);
    expect(await pathExists(candidatePath)).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/local/upgrade-candidates.json"))).toBe(true);
  });

  it("reports obsolete managed files without deleting them", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const obsoletePath = ".agents/skills/akrctx-retired/SKILL.md";
    const obsoleteAbsolute = path.join(tmp, obsoletePath);
    await mkdir(path.dirname(obsoleteAbsolute), { recursive: true });
    await writeFile(obsoleteAbsolute, "# Retired\n", "utf8");
    const manifestPath = path.join(tmp, ".akrctx/manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files[obsoletePath] = { hash: `sha256:${createHash("sha256").update("# Retired\n").digest("hex")}` };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.obsolete).toContain(obsoletePath);
    expect(await readFile(obsoleteAbsolute, "utf8")).toBe("# Retired\n");
  });

  it("preserves enabled optional agents and user configuration during upgrade", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runComprehensionEnable({ cwd: tmp, nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    const config = await readConfig(tmp);
    expect(config?.comprehensionGate.enabled).toBe(true);
    expect(config?.judge?.enabled).toBe(true);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-comprehension.toml"))).toBe(true);
  });

  it("doctor detects version drift and suggests upgrade", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.installedVersion = "0.0.1";
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.suggestions.some((s) => s.text.includes("akrctx upgrade"))).toBe(true);
    expect(result.suggestions.some((s) => s.text.includes("0.0.1"))).toBe(true);
  });
});

// ── upgrade candidate hygiene ─────────────────────────────────────────────────

describe("upgrade candidate hygiene", () => {
  const candidateDir = `.akrctx/upgrades/${CLI_VERSION}`;
  const editedSkill = ".agents/skills/akrctx-doctor/SKILL.md";

  it("does not traverse a real nested directory symlink", async () => {
    const root = path.join(tmp, "upgrade");
    const outside = path.join(tmp, "outside");
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(root, "local.txt"), "local\n");
    await writeFile(path.join(outside, "external.txt"), "external\n");
    await symlink(outside, path.join(root, "nested"), "dir");

    await expect(collectRegularFiles(root)).resolves.toEqual(["local.txt"]);
  });

  it("does not traverse a real symlink used as the collection root", async () => {
    const outside = path.join(tmp, "outside");
    const root = path.join(tmp, "upgrade");
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, "external.txt"), "external\n");
    await symlink(outside, root, "dir");

    await expect(collectRegularFiles(root)).resolves.toEqual([]);
  });

  it("walks nested candidates with only the Node 20.0 Dirent surface", async () => {
    const root = path.join(tmp, "upgrade");
    await mkdir(root, { recursive: true });
    const tree = new Map<string, Array<Record<string, unknown>>>([
      [
        root,
        [
          { name: "nested", isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
          { name: "link.txt", isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true },
        ],
      ],
      [
        path.join(root, "nested"),
        [
          { name: "z.txt", isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
          { name: "file.txt", isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
          { name: "a.txt", isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false },
          { name: "empty", isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false },
        ],
      ],
      [path.join(root, "nested", "empty"), []],
    ]);

    const files = await collectRegularFiles(root, async (directory) => tree.get(directory) ?? []);

    expect(files).toEqual(["nested/a.txt", "nested/file.txt", "nested/z.txt"]);
  });

  async function initWithConflict(): Promise<string> {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const skillPath = path.join(tmp, editedSkill);
    await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\n<!-- local edit -->\n`, "utf8");
    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    return path.join(tmp, candidateDir, editedSkill);
  }

  it("init writes a self-ignoring .gitignore for the upgrades directory", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const content = await readFile(path.join(tmp, upgradesIgnorePath), "utf8");
    expect(isLocalIgnoreContentSafe(content)).toBe(true);
  });

  it("init leaves the project's own root .gitignore alone", async () => {
    await writeFile(path.join(tmp, ".gitignore"), "node_modules/\n", "utf8");

    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(await readFile(path.join(tmp, ".gitignore"), "utf8")).toBe("node_modules/\n");
  });

  it("upgrade restores the upgrades ignore when an existing install lacks it", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, upgradesIgnorePath));

    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(await pathExists(path.join(tmp, upgradesIgnorePath))).toBe(true);
  });

  it("removes a candidate the run no longer writes", async () => {
    const candidatePath = await initWithConflict();
    expect(await pathExists(candidatePath)).toBe(true);
    const manifest = JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8"));
    expect(manifest.candidates[path.posix.join(candidateDir, editedSkill)]).toMatchObject({
      hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });

    await writeFile(path.join(tmp, editedSkill), await readFile(candidatePath));
    const resolved = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(resolved.completed).toBe(true);
    expect(await pathExists(candidatePath)).toBe(false);
    expect(resolved.removed).toContain(path.posix.join(candidateDir, editedSkill));
    const updatedManifest = JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8"));
    expect(updatedManifest.candidates[path.posix.join(candidateDir, editedSkill)]).toBeUndefined();
  });

  it("keeps a candidate that is still unresolved", async () => {
    const candidatePath = await initWithConflict();

    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(await pathExists(candidatePath)).toBe(true);
  });

  it("keeps a candidate when its agent is disabled before rerunning upgrade", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    const agentPath = ".codex/agents/akrctx-judge.toml";
    await writeFile(path.join(tmp, agentPath), `${await readFile(path.join(tmp, agentPath), "utf8")}\n# local edit\n`);
    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });
    const candidatePath = path.join(tmp, candidateDir, agentPath);

    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.agents.judge.enabled = false;
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.removed).not.toContain(path.posix.join(candidateDir, agentPath));
    expect(await pathExists(candidatePath)).toBe(true);
  });

  it("keeps a candidate when its target is removed from config", async () => {
    const candidatePath = await initWithConflict();
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.targets = ["claude"];
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const result = await runUpgrade({ cwd: tmp, nonInteractive: true });

    expect(result.removed).not.toContain(path.posix.join(candidateDir, editedSkill));
    expect(await pathExists(candidatePath)).toBe(true);
  });

  it("keeps a candidate for a path no longer in the managed inventory", async () => {
    const candidatePath = await initWithConflict();
    const retiredPath = ".agents/skills/akrctx-retired/SKILL.md";
    const retiredCandidate = path.join(tmp, candidateDir, retiredPath);
    await mkdir(path.dirname(retiredCandidate), { recursive: true });
    await writeFile(retiredCandidate, await readFile(candidatePath));
    await rm(candidatePath);

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.removed).not.toContain(path.posix.join(candidateDir, retiredPath));
    expect(await pathExists(retiredCandidate)).toBe(true);
  });

  it("keeps a foreign regular file under the current candidate directory", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const foreignPath = path.join(tmp, candidateDir, "foreign.txt");
    await mkdir(path.dirname(foreignPath), { recursive: true });
    await writeFile(foreignPath, "not created by akrctx\n");

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.removed).not.toContain(path.posix.join(candidateDir, "foreign.txt"));
    expect(await pathExists(foreignPath)).toBe(true);
  });

  it("keeps a foreign candidate matching a real destination byte-for-byte", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const destination = ".agents/skills/akrctx-doctor/SKILL.md";
    const foreignPath = path.join(tmp, candidateDir, destination);
    await mkdir(path.dirname(foreignPath), { recursive: true });
    await writeFile(foreignPath, await readFile(path.join(tmp, destination)));

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.removed).not.toContain(path.posix.join(candidateDir, destination));
    expect(await pathExists(foreignPath)).toBe(true);
  });

  it("does not adopt a preexisting matching candidate and never removes it later", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const destination = ".agents/skills/akrctx-doctor/SKILL.md";
    const destinationPath = path.join(tmp, destination);
    const foreignPath = path.join(tmp, candidateDir, destination);
    await mkdir(path.dirname(foreignPath), { recursive: true });
    await writeFile(foreignPath, await readFile(destinationPath));
    await writeFile(destinationPath, `${await readFile(destinationPath, "utf8")}\n<!-- local edit -->\n`);

    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    const candidateKey = path.posix.join(candidateDir, destination);
    const firstManifest = JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8"));
    expect(firstManifest.candidates?.[candidateKey]).toBeUndefined();

    await writeFile(destinationPath, await readFile(foreignPath));
    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.removed).not.toContain(candidateKey);
    expect(await pathExists(foreignPath)).toBe(true);
    const secondManifest = JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8"));
    expect(secondManifest.candidates?.[candidateKey]).toBeUndefined();
  });

  it("records and cleans a policy candidate created by akrctx", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const candidateKey = path.posix.join(candidateDir, ".akrctx/policy.json");
    const candidatePath = path.join(tmp, candidateKey);
    await writeFile(policyPath, "{ invalid policy\n", "utf8");

    const first = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(first.conflicts).toContain(".akrctx/policy.json");
    expect(await pathExists(candidatePath)).toBe(true);
    const firstManifest = JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8"));
    expect(firstManifest.candidates?.[candidateKey]).toMatchObject({
      hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });

    await writeFile(policyPath, await readFile(candidatePath));
    const resolved = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(resolved.removed).toContain(candidateKey);
    expect(await pathExists(candidatePath)).toBe(false);
    const secondManifest = JSON.parse(await readFile(path.join(tmp, ".akrctx/manifest.json"), "utf8"));
    expect(secondManifest.candidates?.[candidateKey]).toBeUndefined();
  });

  it("keeps a registered candidate after its bytes are tampered with", async () => {
    const candidatePath = await initWithConflict();
    const tampered = `${await readFile(candidatePath, "utf8")}\n<!-- tampered -->\n`;
    await writeFile(candidatePath, tampered);
    await writeFile(path.join(tmp, editedSkill), tampered);

    const result = await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(result.removed).not.toContain(path.posix.join(candidateDir, editedSkill));
    expect(await pathExists(candidatePath)).toBe(true);
  });

  it("never removes the upgrades ignore itself", async () => {
    await initWithConflict();

    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(await pathExists(path.join(tmp, upgradesIgnorePath))).toBe(true);
  });

  it("leaves candidate directories of other versions untouched", async () => {
    const candidatePath = await initWithConflict();
    const oldCandidate = path.join(tmp, ".akrctx/upgrades/0.0.1/AGENTS.md");
    await mkdir(path.dirname(oldCandidate), { recursive: true });
    await writeFile(oldCandidate, "# old suggestion\n", "utf8");

    await writeFile(path.join(tmp, editedSkill), await readFile(candidatePath));
    await runUpgrade({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(await readFile(oldCandidate, "utf8")).toBe("# old suggestion\n");
  });

  it("removes nothing on a dry run but reports what it would remove", async () => {
    const candidatePath = await initWithConflict();
    await writeFile(path.join(tmp, editedSkill), await readFile(candidatePath));

    const preview = await runUpgrade({ cwd: tmp, target: "codex", dryRun: true, nonInteractive: true });

    expect(preview.removed).toContain(path.posix.join(candidateDir, editedSkill));
    expect(await pathExists(candidatePath)).toBe(true);
  });

  it("removes nothing when the run does not cover every installed target", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    const skillPath = path.join(tmp, editedSkill);
    await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\n<!-- local edit -->\n`, "utf8");
    await runUpgrade({ cwd: tmp, nonInteractive: true });
    const candidatePath = path.join(tmp, candidateDir, editedSkill);
    await writeFile(skillPath, await readFile(candidatePath));

    const partial = await runUpgrade({ cwd: tmp, target: "claude", nonInteractive: true });

    expect(partial.removed).toEqual([]);
    expect(await pathExists(candidatePath)).toBe(true);
  });

  it("doctor reports a missing upgrades ignore and --fix restores it", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, upgradesIgnorePath));

    const diagnosis = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(diagnosis.missing).toContain(upgradesIgnorePath);

    await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });
    expect(isLocalIgnoreContentSafe(await readFile(path.join(tmp, upgradesIgnorePath), "utf8"))).toBe(true);
  });

  it("doctor reports a weakened upgrades ignore", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, upgradesIgnorePath), "*.tmp\n", "utf8");

    const diagnosis = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(diagnosis.missing.some((gap) => gap.includes("must ignore upgrade candidates"))).toBe(true);
  });
});

// ── judge ─────────────────────────────────────────────────────────────────────

describe("comprehension gate", () => {
  it("enables, reports, and disables without selecting a model", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const enabled = await runComprehensionEnable({ cwd: tmp, nonInteractive: true });
    expect(enabled.enabled).toBe(true);
    expect(enabled.evaluationMode).toBe("prefer-independent");
    expect(enabled.localIgnoreValid).toBe(true);
    expect(enabled.installedTargets).toContain("codex");
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-comprehension.toml"))).toBe(true);

    expect((await runComprehensionStatus({ cwd: tmp, nonInteractive: true })).enabled).toBe(true);
    expect((await runComprehensionDisable({ cwd: tmp, nonInteractive: true })).enabled).toBe(false);
  });

  it("refuses to enable when local records are not safely ignored", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/local/.gitignore"), "# unsafe\n", "utf8");

    await expect(runComprehensionEnable({ cwd: tmp, nonInteractive: true })).rejects.toThrow("akrctx doctor --fix");
    expect(isLocalIgnoreContentSafe("# unsafe\n")).toBe(false);
    expect(isLocalIgnoreContentSafe("*\n!.gitignore\n!comprehension/**\n")).toBe(false);
  });

  it("dry-run does not change the enabled state", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const preview = await runComprehensionEnable({ cwd: tmp, dryRun: true, nonInteractive: true });

    expect(preview.enabled).toBe(true);
    expect((await readConfig(tmp))?.comprehensionGate.enabled).toBe(false);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-comprehension.toml"))).toBe(false);
  });

  it("installs platform-native isolated agents and skips Pi", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });

    const result = await runComprehensionEnable({ cwd: tmp, nonInteractive: true });

    expect(result.installedTargets).toEqual(expect.arrayContaining(["codex", "claude", "copilot"]));
    expect(result.skippedTargets).toContain("pi");
    const claude = await readFile(path.join(tmp, ".claude/agents/akrctx-comprehension.md"), "utf8");
    const copilot = await readFile(path.join(tmp, ".github/agents/akrctx-comprehension.agent.md"), "utf8");
    expect(claude).toContain("permissionMode: plan");
    expect(claude).toContain("background: false");
    expect(copilot).toContain('tools: ["read", "search", "execute"]');
    expect(copilot).toContain("user-invocable: true");
  });

  it("refuses to enable when any versioned contract schema is missing or invalid", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const rubricPath = path.join(tmp, ".akrctx/comprehension/schemas/rubric.schema.json");
    await writeFile(rubricPath, "{}\n", "utf8");

    await expect(runComprehensionEnable({ cwd: tmp, nonInteractive: true })).rejects.toThrow("missing or invalid");
  });

  it("doctor detects an enabled gate without its independent agent", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.comprehensionGate.enabled = true;
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.suggestions.some((suggestion) => suggestion.text.includes("akrctx comprehension enable"))).toBe(true);
  });

  it("keeps personal session files out of Git by default", async () => {
    await execFileAsync("git", ["init"], { cwd: tmp });
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const relativeRecord = ".akrctx/local/comprehension/TASK-001/session/result.json";
    const recordPath = path.join(tmp, relativeRecord);
    await mkdir(path.dirname(recordPath), { recursive: true });
    await writeFile(recordPath, "{}\n", "utf8");

    await execFileAsync("git", ["check-ignore", "-q", relativeRecord], { cwd: tmp });
    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: tmp });
    expect(stdout).not.toContain(relativeRecord);
  });
});

describe("judge", () => {
  it("normalizes validation commands and preserves bounded redacted failure evidence", () => {
    expect(normalizeValidationCommand("  pnpm   test\n --runInBand  ")).toBe("pnpm test --runInBand");
    const output = redactValidationOutput(`token=super-secret\n${"x".repeat(20)}`, 32);
    expect(output).toContain("token=[REDACTED]");
    expect(output).not.toContain("super-secret");
    expect(output).toContain("[truncated]");
  });

  it("keeps observations separate from optional inferred or confirmed causes", () => {
    const evidence = captureValidationError("pnpm test", {
      code: 137,
      signal: null,
      stdout: "stdout line",
      stderr: "stderr line",
    });

    expect(evidence).toMatchObject({
      command: "pnpm test",
      status: "failed",
      exitCode: 137,
      signal: null,
    });
    expect(evidence.output).toContain("stderr line");

    expect(captureValidationError("pnpm test", { signal: "SIGTERM" })).toMatchObject({
      exitCode: null,
      signal: "SIGTERM",
      output: "[no diagnostic output]",
    });
  });

  it("redacts and bounds the current failure evidence at capture time", () => {
    const evidence = captureValidationError("pnpm test", {
      code: 1,
      stderr: `TOKEN=do-not-persist\n${"x".repeat(10_000)} https://private.example/secret`,
    });
    expect(evidence.output).toContain("TOKEN=[REDACTED]");
    expect(evidence.output).not.toContain("do-not-persist");
    expect(evidence.output).not.toContain("private.example");
    expect(evidence.output).toContain("[truncated]");
    expect(evidence).not.toHaveProperty("diagnosis");
  });

  it("redacts prefixed and compound secret variable names", () => {
    const output = redactValidationOutput(
      'NPM_TOKEN=npm-secret AWS_SECRET_ACCESS_KEY="aws secret" PRIVATE_KEY=private --api-key "cli secret"',
    );
    expect(output).toContain("NPM_TOKEN=[REDACTED]");
    expect(output).toContain("AWS_SECRET_ACCESS_KEY=[REDACTED]");
    expect(output).toContain("PRIVATE_KEY=[REDACTED]");
    expect(output).toContain("--api-key [REDACTED]");
    expect(output).not.toContain("npm-secret");
    expect(output).not.toContain("aws secret");
    expect(output).not.toContain("private");
    expect(output).not.toContain("cli secret");
  });

  it("redacts quoted secret-bearing keys in structured diagnostic output", () => {
    const output = redactValidationOutput(
      `{"AWS_SECRET_ACCESS_KEY":"json secret"}\n'api-key': 'yaml secret'\n"password" : unquoted-secret`,
    );

    expect(output).toContain('"AWS_SECRET_ACCESS_KEY":[REDACTED]');
    expect(output).toContain("'api-key': [REDACTED]");
    expect(output).toContain('"password" : [REDACTED]');
    expect(output).not.toContain("json secret");
    expect(output).not.toContain("yaml secret");
    expect(output).not.toContain("unquoted-secret");
  });

  it("redacts credentials embedded in a reported validation command", () => {
    const command = sanitizeValidationCommand(
      '  NPM_TOKEN="npm secret"   pnpm test --api-key cli-secret https://private.example/run  ',
    );
    expect(command).toBe("NPM_TOKEN=[REDACTED] pnpm test --api-key [REDACTED] [URL REDACTED]");
    expect(captureValidationError('AWS_SECRET_ACCESS_KEY="aws secret" pnpm test', { code: 1 }).command).toBe(
      "AWS_SECRET_ACCESS_KEY=[REDACTED] pnpm test",
    );
  });

  /** One passing entry per criterion the capsule declares, which is what APPROVED requires. */
  async function passingCriteria(taskId: string) {
    const declaration = await readAcceptanceCriteria(tmp, taskId);
    return declaration.ids.map((id) => ({ id, status: "pass", evidence: "Checked against the changed files." }));
  }

  async function createReviewFixture(
    options: { declares?: string[]; claims?: string[]; legacyCapsule?: boolean; checklist?: string } = {},
  ) {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Enforce judge approvals", { cwd: tmp, nonInteractive: true });
    // Fill the empty fenced block the generated capsule already ships under `## Validation`;
    // appending a second section would be shadowed by the first one the parser finds. Defaults to
    // a declared `pnpm test` so the fixture is a realistic completed capsule, not an unfinished one.
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    if (options.legacyCapsule) {
      await writeFile(taskFile, original.replace(/\n## Validation\n[\s\S]*?(?=\n## )/, "\n"), "utf8");
    } else {
      const declares = options.declares ?? ["pnpm test"];
      const filled = original.replace("```\n```", `\`\`\`\n${declares.join("\n")}\n\`\`\``);
      expect(filled).not.toBe(original);
      await writeFile(taskFile, filled, "utf8");
    }
    if (options.checklist !== undefined) {
      await writeFile(path.join(tmp, task.taskDir, "review-checklist.md"), options.checklist, "utf8");
    }
    await writeFile(path.join(tmp, "app.ts"), "export const value = 1;\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
    await writeFile(path.join(tmp, "app.ts"), "export const value = 2;\n", "utf8");
    const scope = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");
    const record = {
      schemaVersion: JUDGE_SCHEMA_VERSION,
      taskId: task.taskId,
      scope,
      verdict: "APPROVED",
      tests: (options.claims ?? ["pnpm test"]).map((command) => ({ command, status: "passed" })),
      criteria: await passingCriteria(task.taskId),
      observations: [],
      reviewedAt: new Date().toISOString(),
    };
    const recordPath = path.join(tmp, ".akrctx/local/judge/review.json");
    await mkdir(path.dirname(recordPath), { recursive: true });
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return { task, scope, recordPath };
  }

  function validContinuationRecord(task: { taskId: string; taskDir: string }): ContinuationRecord {
    return {
      schemaVersion: CONTINUATION_SCHEMA_VERSION,
      task: {
        taskId: task.taskId,
        capsulePath: task.taskDir,
        capsuleDigest: `sha256:${"a".repeat(64)}`,
        capsuleRevision: { gitCommit: null },
      },
      latestExecution: null,
      history: [],
    };
  }

  async function writeContinuationSidecar(task: { taskId: string; taskDir: string }, body: string): Promise<void> {
    await writeFile(path.join(tmp, task.taskDir, "continuation.json"), body, "utf8");
  }

  async function declareValidation(fenceBody: string) {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Parse validation declarations", { cwd: tmp, nonInteractive: true });
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    const filled = original.replace("```\n```", `\`\`\`\n${fenceBody}\n\`\`\``);
    expect(filled).not.toBe(original);
    await writeFile(taskFile, filled, "utf8");
    return task;
  }

  describe("readValidationDeclaration", () => {
    it("recognizes a `# optional` suffix and strips it from the command", async () => {
      const task = await declareValidation("pnpm test\npnpm lint # optional");

      const declaration = await readValidationDeclaration(tmp, task.taskId);

      expect(declaration.checks).toEqual([
        { command: "pnpm test", required: true },
        { command: "pnpm lint", required: false },
      ]);
      expect(declaration.commands).toEqual(["pnpm test", "pnpm lint"]);
    });

    it("recognizes optional-marker spacing and casing variants", async () => {
      const task = await declareValidation("pnpm a #optional\npnpm b # OPTIONAL\npnpm c #   Optional");

      const declaration = await readValidationDeclaration(tmp, task.taskId);

      expect(declaration.checks).toEqual([
        { command: "pnpm a", required: false },
        { command: "pnpm b", required: false },
        { command: "pnpm c", required: false },
      ]);
    });

    it("keeps the literal text of a line ending in an unrelated trailing comment", async () => {
      const task = await declareValidation("pnpm test # this checks the build");

      const declaration = await readValidationDeclaration(tmp, task.taskId);

      expect(declaration.checks).toEqual([{ command: "pnpm test # this checks the build", required: true }]);
    });

    it("reports `unknown` when the capsule predates the Validation section", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      const task = await runTask("Legacy capsule", { cwd: tmp, nonInteractive: true });
      const taskFile = path.join(tmp, task.taskDir, "task.md");
      const original = await readFile(taskFile, "utf8");
      await writeFile(taskFile, original.replace(/\n## Validation\n[\s\S]*?(?=\n## )/, "\n"), "utf8");

      const declaration = await readValidationDeclaration(tmp, task.taskId);

      expect(declaration.sectionPresent).toBe(false);
    });

    it("keeps an empty or malformed fence as an unfinished capsule, not documentation", async () => {
      const task = await declareValidation("");

      const declaration = await readValidationDeclaration(tmp, task.taskId);

      expect(declaration.sectionPresent).toBe(true);
      expect(declaration.kind).toBe("runtime");
      expect(declaration.checks).toEqual([]);
    });

    it("parses a lone `no-runtime-validation:` line as documentation", async () => {
      const task = await declareValidation("no-runtime-validation: investigation only, no code changed");

      const declaration = await readValidationDeclaration(tmp, task.taskId);

      expect(declaration.kind).toBe("documentation");
      expect(declaration.reason).toBe("investigation only, no code changed");
      expect(declaration.checks).toEqual([]);
      expect(declaration.commands).toEqual([]);
    });

    it("does not accept `no-runtime-validation:` without a reason", async () => {
      const task = await declareValidation("no-runtime-validation:");

      const declaration = await readValidationDeclaration(tmp, task.taskId);

      expect(declaration.kind).toBe("runtime");
    });

    it("does not accept `no-runtime-validation:` accompanied by other lines", async () => {
      const task = await declareValidation("no-runtime-validation: investigation only\npnpm test");

      const declaration = await readValidationDeclaration(tmp, task.taskId);

      expect(declaration.kind).toBe("runtime");
      expect(declaration.commands).toContain("pnpm test");
    });
  });

  it("cryptographically binds an approved review to its task and working-tree boundary", async () => {
    const { scope, recordPath } = await createReviewFixture();

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result).toMatchObject({
      valid: true,
      approved: true,
      verdict: "APPROVED",
      scopeDigest: scope.scopeDigest,
      reasons: [],
      // TASK-078: a WORKTREE boundary always adds the clarification `comparison unavailable` notice.
      notices: [expect.stringContaining("comparison unavailable")],
      declaredCommands: ["pnpm test"],
      reexecuted: [],
    });
  });

  it("rejects a symbolic base in the review record contract", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.scope.base = "origin/main";

    expect(validateRecord(record)).toContain("scope does not match the judge scope contract.");
  });

  it("rejects an incomplete hexadecimal base hash", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.scope.base = `${record.scope.base}a`;

    expect(validateRecord(record)).toContain("scope does not match the judge scope contract.");
  });

  it("accepts a checklist finalized before capture without a post-judge administrative write", async () => {
    const checklist = "# Review Checklist\n\n- [x] The capsule is ready for independent review.\n";
    const { recordPath } = await createReviewFixture({ checklist });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("reports a non-independent review as a notice without changing approval", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.independent = false;
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.valid).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.notices.some((n) => n.includes("non-independent") && n.includes("verification-only"))).toBe(true);
    expect(result.historicalVerdict.independence).toBe("declared-false");
  });

  it("reports historicalVerdict.independence as unknown when independent is absent", async () => {
    const { recordPath } = await createReviewFixture();

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.historicalVerdict.independence).toBe("unknown");
    expect(result.historicalVerdict.value).toBe("APPROVED");
  });

  it("rejects a non-boolean independent field", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.independent = "false";
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.valid).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.reasons.some((r) => r.includes("independent must be a boolean"))).toBe(true);
  });

  it("reports unresolved open questions as a notice without blocking approval", async () => {
    const { recordPath, task } = await createReviewFixture();
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    // Replace the section in place. Appending a second `## Open Questions` would be shadowed
    // by the generated one, which still holds the placeholder.
    const filled = original.replace(
      /\n## Open Questions\n[\s\S]*$/,
      "\n## Open Questions\n\n- Whether legacy invoices are in scope.\n",
    );
    expect(filled).not.toBe(original);
    await writeFile(taskFile, filled, "utf8");
    // The capsule is part of the reviewed boundary, so re-anchor the record to the edited tree;
    // otherwise this would assert a digest failure rather than the notice.
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.scope = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    // A judgement, not a mechanical check: it is surfaced, and it never moves the exit code.
    expect(result.notices).toEqual([
      "The task capsule lists 1 unresolved open question; confirm it would not have changed the implementation.",
      // TASK-078: a WORKTREE boundary always adds the clarification `comparison unavailable` notice.
      expect.stringContaining("comparison unavailable"),
    ]);
    expect(result.reasons).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.approved).toBe(true);
  });

  it("invalidates an approved review when code changes", async () => {
    const { recordPath } = await createReviewFixture();
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("scope.changeDigest no longer matches the repository.");
  });

  it("invalidates an approved review when an untracked file appears", async () => {
    const { recordPath } = await createReviewFixture();
    await writeFile(path.join(tmp, "new-module.ts"), "export const added = true;\n", "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("scope.changeDigest no longer matches the repository.");
  });

  it("withholds untracked files blocked by policy from the boundary", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Protect judge scope", { cwd: tmp, nonInteractive: true });
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
    await writeFile(path.join(tmp, ".env"), "SECRET=not-read\n", "utf8");

    const scope = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");

    expect(scope.excludedPaths).toContain(".env");
    expect(scope.changedFiles).not.toContain(".env");
  });

  it("withholds tracked files blocked by policy from the diff and the digest", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Protect tracked secrets", { cwd: tmp, nonInteractive: true });
    await writeFile(path.join(tmp, ".env"), "SECRET=base\n", "utf8");
    await writeFile(path.join(tmp, "app.ts"), "export const value = 1;\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "-f", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
    await writeFile(path.join(tmp, ".env"), "SECRET=rotated-in-boundary\n", "utf8");
    await writeFile(path.join(tmp, "app.ts"), "export const value = 2;\n", "utf8");

    const scope = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");
    const withSecretOnly = await (async () => {
      await writeFile(path.join(tmp, ".env"), "SECRET=rotated-again\n", "utf8");
      return createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");
    })();

    expect(scope.excludedPaths).toContain(".env");
    expect(scope.changedFiles).toEqual(["app.ts"]);
    // The secret's content never enters the digest, so rotating it again does not move it.
    expect(withSecretOnly.changeDigest).toBe(scope.changeDigest);
  });

  it("refuses to compute a boundary when policy.json cannot supply blocked patterns", async () => {
    const { task } = await createReviewFixture();
    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.blockedReadPatterns = "not-an-array";
    await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");

    // Falling back to a default pattern set here would silently reduce the exclusion this
    // feature promises, so an unusable policy has to stop the scope instead.
    await expect(createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE")).rejects.toThrow(
      "blockedReadPatterns is missing or not an array",
    );
  });

  it("refuses to compute a boundary when policy.json is malformed", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, ".akrctx/policy.json"), "{ not json", "utf8");

    await expect(createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE")).rejects.toThrow(
      "Cannot apply policy.json blockedReadPatterns",
    );
  });

  it("invalidates an approved review when a blocked path enters the boundary", async () => {
    const { recordPath } = await createReviewFixture();
    await writeFile(path.join(tmp, ".env"), "SECRET=appeared\n", "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("scope.excludedPaths no longer matches the repository.");
  });

  it("invalidates an approved review when the task capsule changes", async () => {
    const { task, recordPath } = await createReviewFixture();
    await writeFile(path.join(tmp, task.taskDir, "task.md"), "# Changed goal\n", "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("scope.taskDigest no longer matches the repository.");
  });

  it("keeps taskDigest sensitive to a real review-checklist change", async () => {
    const { task, recordPath } = await createReviewFixture();
    await writeFile(
      path.join(tmp, task.taskDir, "review-checklist.md"),
      "# Review Checklist\n\n- [x] changed\n",
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("scope.taskDigest no longer matches the repository.");
  });

  it("rejects a current review whose verdict is not APPROVED", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.verdict = "NEEDS_CHANGES";
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("Judge verdict is NEEDS_CHANGES, not APPROVED.");
  });

  it("rejects APPROVED when the judge record contains a failed validation", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.tests[0].status = "failed";
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.some((reason) => reason.startsWith("Judge record contains failed validation:"))).toBe(true);
  });

  it("names every blocking failure in one reason instead of repeating a command-less line", async () => {
    const { recordPath } = await createReviewFixture({ declares: ["pnpm test"], claims: ["pnpm test"] });
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.tests.push({ command: "echo a", status: "failed" }, { command: "echo b", status: "failed" });
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.filter((reason) => reason.startsWith("Judge record contains failed validation"))).toEqual([
      "Judge record contains failed validation: echo a, echo b.",
    ]);
  });

  it("rejects APPROVED when no validation command was executed", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.tests = [];
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("APPROVED requires at least one validation command that passed.");
  });

  it("rejects APPROVED when every validation command was left not-run", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.tests = [
      { command: "pnpm test", status: "not-run", evidence: "sandbox is read-only" },
      { command: "pnpm lint", status: "not-run" },
    ];
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("APPROVED requires at least one validation command that passed.");
  });

  it("rejects APPROVED backed only by a command the task capsule never declared", async () => {
    const { recordPath } = await createReviewFixture({ declares: ["pnpm test", "pnpm lint"], claims: ["echo ok"] });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.declaredCommands).toEqual(["pnpm test", "pnpm lint"]);
    expect(result.reasons).toContain(
      "APPROVED requires every command the task capsule declares as required to pass; these did not: pnpm test, pnpm lint.",
    );
  });

  it("rejects APPROVED backed only by an invented command when every declared command is optional", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test # optional", "pnpm lint # optional"],
      claims: ["echo unrelated"],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain(
      "APPROVED requires a passing run of a command the task capsule declares: pnpm test, pnpm lint.",
    );
  });

  it("rejects APPROVED when a required declared command was not claimed as passing", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test", "pnpm lint"],
      claims: ["pnpm lint", "echo extra-context"],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain(
      "APPROVED requires every command the task capsule declares as required to pass; these did not: pnpm test.",
    );
  });

  it("accepts APPROVED when every required declared command passed", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test", "pnpm lint"],
      claims: ["pnpm test", "pnpm lint", "echo extra-context"],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.reasons).toEqual([]);
    expect(result.approved).toBe(true);
  });

  it("names every missing required command when several are absent from tests", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test", "pnpm lint", "pnpm build"],
      claims: ["pnpm build"],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain(
      "APPROVED requires every command the task capsule declares as required to pass; these did not: pnpm test, pnpm lint.",
    );
  });

  it("treats a `# optional` suffixed command as non-blocking when it never passed", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test", "pnpm lint # optional"],
      claims: ["pnpm test"],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.reasons).toEqual([]);
    expect(result.approved).toBe(true);
  });

  it("reports a failed optional command as a notice, not a reason, and stays approved", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test", "pnpm lint # optional"],
      claims: ["pnpm test"],
    });
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.tests.push({ command: "pnpm lint", status: "failed" });
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.notices).toContain("Optional command `pnpm lint` failed; it does not block approval.");
  });

  it("still rejects a failed command that was never declared", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test"],
      claims: ["pnpm test"],
    });
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.tests.push({ command: "pnpm lint", status: "failed" });
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("Judge record contains failed validation: pnpm lint.");
  });

  it("leaves the declared-command rule dormant for a capsule predating the Validation section", async () => {
    const { recordPath } = await createReviewFixture({ legacyCapsule: true, claims: ["cargo test"] });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.declaredCommands).toEqual([]);
    expect(result.approved).toBe(true);
    expect(result.verifiedNow.value).toBe("unknown");
  });

  it("reports verifiedNow as not-applicable-to-runtime for a documentation-only capsule", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["no-runtime-validation: investigation only, no code changed"],
      claims: [],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(true);
    expect(result.verifiedNow.value).toBe("not-applicable-to-runtime");
  });

  it("reports verifiedNow as complete when every required command passed and the boundary is current", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test"],
      claims: ["pnpm test"],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.verifiedNow.value).toBe("complete");
    expect(result.verifiedNow.reviewBoundary).toBeNull();
    expect(result.verifiedNow.executionMetadata).toBeNull();
  });

  it("reports verifiedNow as incomplete when a required command did not pass", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test", "pnpm lint"],
      claims: ["pnpm lint"],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.verifiedNow.value).toBe("incomplete");
    expect(result.verifiedNow.reason.length).toBeGreaterThan(0);
  });

  it("rejects APPROVED when a current capsule left its Validation block empty", async () => {
    // Distinct from a legacy capsule: the section exists, so the commands were meant to be filled in.
    const { recordPath } = await createReviewFixture({ declares: [], claims: ["pnpm test"] });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain(
      "The task capsule has an empty or malformed `## Validation` block; declare the commands.",
    );
  });

  it("--run-tests re-executes declared commands and rejects a false passing claim", async () => {
    const failing = 'node -e "process.exit(1)"';
    const { recordPath } = await createApprovableSnapshotFixture([failing]);

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.approved).toBe(false);
    expect(result.reexecuted).toHaveLength(1);
    expect(result.reexecuted[0]).toMatchObject({ command: failing, passed: false });
    expect(result.reexecuted[0].evidence).toMatchObject({ status: "failed", exitCode: 1 });
    expect(result.reexecuted[0].evidence?.output).toContain("[no diagnostic output]");
    expect(result.reasons[0]).toContain(`Independent re-run of \`${failing}\` failed`);
  });

  it("--run-tests confirms an approval whose declared command really passes", async () => {
    const passing = 'node -e "process.exit(0)"';
    const { recordPath } = await createApprovableSnapshotFixture([passing]);

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.approved).toBe(true);
    expect(result.reexecuted[0]).toMatchObject({ command: passing, passed: true });
  });

  it("--run-tests leaves the boundary intact for a non-mutating command", async () => {
    const passing = 'node -e "process.exit(0)"';
    const { recordPath } = await createApprovableSnapshotFixture([passing]);

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.approved).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("--run-tests never executes a command that only the review record names", async () => {
    const sentinel = path.join(tmp, "must-not-run.txt");
    const injected = `node -e "require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran')"`;
    const { task } = await createReviewFixture({ declares: ["pnpm test"], claims: [] });
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/injected-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command: injected, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.reexecuted).toEqual([]);
    expect(await pathExists(sentinel)).toBe(false);
    expect(result.approved).toBe(false);
  });

  async function createApprovableSnapshotFixture(commands: string[]) {
    const { task } = await createReviewFixture({ declares: commands, claims: [] });
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/approval-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: commands.map((command) => ({ command, status: "passed" })),
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    return { task, snapshot, recordPath };
  }

  it("--run-tests executes the declared commands once the injected approval resolves true", async () => {
    const command = 'node -e "process.exit(0)"';
    const { recordPath } = await createApprovableSnapshotFixture([command]);

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.reexecuted[0]).toMatchObject({ command, passed: true });
    expect(result.approved).toBe(true);
  });

  it("--run-tests withholds every command when the injected approval resolves false", async () => {
    const sentinel = path.join(tmp, "denied-must-not-run.txt");
    const command = `node -e "require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran')"`;
    const { recordPath } = await createApprovableSnapshotFixture([command]);

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => false });

    expect(result.reexecuted).toEqual([]);
    expect(await pathExists(sentinel)).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.reasons).toContain(`Operator approval was not given for the declared commands: ${command}.`);
  });

  it("--run-tests refuses to execute when no approval callback is supplied at all", async () => {
    const sentinel = path.join(tmp, "unapproved-must-not-run.txt");
    const command = `node -e "require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran')"`;
    const { recordPath } = await createApprovableSnapshotFixture([command]);

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true });

    expect(result.reexecuted).toEqual([]);
    expect(await pathExists(sentinel)).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.reasons).toContain(`Operator approval was not given for the declared commands: ${command}.`);
  });

  it("--run-tests asks for approval exactly once, with the declared commands in parse order", async () => {
    const first = 'node -e "process.exit(0)"';
    const second = 'node -e "process.exitCode = 0"';
    const { recordPath } = await createApprovableSnapshotFixture([first, second]);
    const asked: string[][] = [];

    await verifyJudgeRecord(tmp, recordPath, {
      runTests: true,
      approve: async (commands) => {
        asked.push(commands);
        return true;
      },
    });

    expect(asked).toEqual([[first, second]]);
  });

  it("--run-tests refuses a WORKTREE candidate before approval is ever requested", async () => {
    const command = 'node -e "process.exit(0)"';
    const { recordPath } = await createReviewFixture({ declares: [command], claims: [command] });
    let asked = false;

    const result = await verifyJudgeRecord(tmp, recordPath, {
      runTests: true,
      approve: async () => {
        asked = true;
        return true;
      },
    });

    expect(asked).toBe(false);
    expect(result.reexecuted).toEqual([]);
    expect(result.approved).toBe(false);
    expect(result.reasons).toContain(
      "--run-tests requires a snapshot candidate; capture one with `akrctx judge snapshot <TASK-ID>` and verify that record.",
    );
  });

  it("--run-tests refuses a bare commit-ref candidate for the same reason", async () => {
    const command = 'node -e "process.exit(0)"';
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tmp })).stdout.trim();
    const scope = await createJudgeScope(tmp, task.taskId, "HEAD", head);
    const recordPath = path.join(tmp, ".akrctx/local/judge/commit-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.reexecuted).toEqual([]);
    expect(result.reasons).toContain(
      "--run-tests requires a snapshot candidate; capture one with `akrctx judge snapshot <TASK-ID>` and verify that record.",
    );
  });

  it("verification without --run-tests is unchanged on a WORKTREE candidate", async () => {
    const { recordPath } = await createReviewFixture();

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("invalidates a review produced by a different akrctx version", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.scope.cliVersion = "0.0.1-ancient";
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.some((reason: string) => reason.includes("produced by akrctx v0.0.1-ancient"))).toBe(true);
  });

  it("rejects a review record still using the previous schema version", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.schemaVersion = 1;
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(`schemaVersion must be ${JUDGE_SCHEMA_VERSION}.`);
  });

  it("rejects a record that still carries the removed issues property", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.issues = ["acceptance criterion 3 is not covered by any test"];
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("Unexpected review field: issues.");
  });

  it("rejects APPROVED when a declared criterion did not pass", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.criteria[1] = { ...record.criteria[1], status: "fail", evidence: "No test covers it." };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.join(" ")).toContain("AC-2 (fail)");
  });

  it("rejects a record that reports no result for a declared criterion", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    const dropped = record.criteria.pop();
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.join(" ")).toContain(dropped.id);
  });

  it("rejects a record that reports a criterion the capsule does not declare", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.criteria.push({ id: "AC-99", status: "pass", evidence: "Invented." });
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.join(" ")).toContain("AC-99");
  });

  it("reports a capsule whose criteria carry no identifier instead of approving it", async () => {
    const { task, recordPath } = await createReviewFixture();
    await writeFile(
      path.join(tmp, task.taskDir, "acceptance-criteria.md"),
      "# Acceptance Criteria\n\n- The outcome is implemented.\n",
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.join(" ")).toContain("AC-<n>");
  });

  it("approves with observations outside the declared criteria", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.observations = ["parseRef duplicates logic in resolveRef; outside the declared criteria."];
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.reasons).toEqual([]);
    expect(result.approved).toBe(true);
  });

  it("reads a stored version 5 record under the version 5 rules and marks it legacy", async () => {
    const { task, recordPath } = await createReviewFixture();
    const legacyScope = asSchemaVersion(
      await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE"),
      LEGACY_JUDGE_SCHEMA_VERSION,
    );
    const legacy = {
      schemaVersion: LEGACY_JUDGE_SCHEMA_VERSION,
      taskId: task.taskId,
      scope: legacyScope,
      verdict: "APPROVED",
      tests: [{ command: "pnpm test", status: "passed" }],
      issues: [],
      reviewedAt: new Date().toISOString(),
    };
    await writeFile(recordPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.reasons).toEqual([]);
    expect(result.approved).toBe(true);
    expect(result.legacy).toBe(true);
    expect(result.notices.join(" ")).toContain(`version ${LEGACY_JUDGE_SCHEMA_VERSION}`);
  });

  it("keeps the version 5 approval rules for a legacy record that lists issues", async () => {
    const { task, recordPath } = await createReviewFixture();
    const legacyScope = asSchemaVersion(
      await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE"),
      LEGACY_JUDGE_SCHEMA_VERSION,
    );
    const legacy = {
      schemaVersion: LEGACY_JUDGE_SCHEMA_VERSION,
      taskId: task.taskId,
      scope: legacyScope,
      verdict: "APPROVED",
      tests: [{ command: "pnpm test", status: "passed" }],
      issues: ["acceptance criterion 3 is not covered by any test"],
      reviewedAt: new Date().toISOString(),
    };
    await writeFile(recordPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.legacy).toBe(true);
    expect(result.reasons).toContain("APPROVED records must not list unresolved issues.");
  });

  it("emits only the current schema version", async () => {
    const { task } = await createReviewFixture();
    const scope = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");

    expect(JUDGE_SCHEMA_VERSION).toBe(6);
    expect(scope.schemaVersion).toBe(JUDGE_SCHEMA_VERSION);
  });

  it("applies the approval rules only to APPROVED verdicts", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.verdict = "NEEDS_CHANGES";
    record.tests = [];
    record.criteria = record.criteria.map((criterion: { id: string }) => ({
      ...criterion,
      status: "fail",
      evidence: "Not covered.",
    }));
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toEqual(["Judge verdict is NEEDS_CHANGES, not APPROVED."]);
  });

  it("CLI judge scope prints a human summary by default and JSON only with --json", async () => {
    const { task, scope } = await createReviewFixture();
    const previousCwd = process.cwd();
    const originalLog = console.log;
    const capture = async (args: string[]) => {
      const writes: string[] = [];
      console.log = (message?: unknown) => {
        writes.push(String(message));
      };
      try {
        process.chdir(tmp);
        await main(["node", "akrctx", ...args]);
      } finally {
        process.chdir(previousCwd);
        console.log = originalLog;
      }
      return writes.join("\n");
    };

    const human = await capture(["judge", "scope", task.taskId, "--base", "HEAD"]);
    const asJson = await capture(["judge", "scope", task.taskId, "--base", "HEAD", "--json"]);

    expect(human).toContain(scope.scopeDigest);
    expect(human).toContain("app.ts");
    expect(() => JSON.parse(human)).toThrow();
    expect(JSON.parse(asJson)).toEqual(scope);
  });

  it("rejects foreign task capsules in scope and snapshot capture by default", async () => {
    const { task } = await createReviewFixture();
    const foreignPath = path.join(tmp, ".akrctx/tasks/TASK-999-other-work/task.md");
    await mkdir(path.dirname(foreignPath), { recursive: true });
    await writeFile(foreignPath, "foreign\n", "utf8");

    await expect(createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE")).rejects.toThrow(
      /TASK-999.*\.akrctx\/tasks\/TASK-999-other-work\/task\.md.*--include-task TASK-999/,
    );
    await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(/foreign task capsule/);
  });

  it("records explicit foreign task inclusion in the scope digest", async () => {
    const { task } = await createReviewFixture();
    const foreignPath = path.join(tmp, ".akrctx/tasks/TASK-999-other-work/task.md");
    await mkdir(path.dirname(foreignPath), { recursive: true });
    await writeFile(foreignPath, "foreign\n", "utf8");

    const scope = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE", ["TASK-999"]);

    expect(scope.includedTaskIds).toEqual(["TASK-999"]);
    expect(scope.changedFiles).toContain(".akrctx/tasks/TASK-999-other-work/task.md");
    expect(scope.scopeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE")).rejects.toThrow(/foreign task capsule/);
  });

  it("reports every foreign task and ignores task-like paths outside capsule names", async () => {
    const { task } = await createReviewFixture();
    for (const directory of ["TASK-998-first", "TASK-999-second", "TASK-001ish"]) {
      const file = path.join(tmp, ".akrctx/tasks", directory, "task.md");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "changed\n", "utf8");
    }

    await expect(createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE")).rejects.toThrow(
      /TASK-998, TASK-999.*TASK-998-first\/task\.md.*TASK-999-second\/task\.md/,
    );
  });

  it("exposes foreign-capsule rejection and repeated inclusion through the CLI", async () => {
    const { task } = await createReviewFixture();
    for (const id of ["TASK-998", "TASK-999"]) {
      const file = path.join(tmp, `.akrctx/tasks/${id}-extra/task.md`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "changed\n", "utf8");
    }
    const previousCwd = process.cwd();
    const originalLog = console.log;
    const writes: string[] = [];
    console.log = (message?: unknown) => writes.push(String(message));
    try {
      process.chdir(tmp);
      await expect(main(["node", "akrctx", "judge", "scope", task.taskId, "--base", "HEAD"])).rejects.toThrow(
        /TASK-998, TASK-999.*--include-task TASK-998 --include-task TASK-999/,
      );
      await main([
        "node",
        "akrctx",
        "judge",
        "scope",
        task.taskId,
        "--base",
        "HEAD",
        "--json",
        "--include-task",
        "TASK-998",
        "--include-task",
        "TASK-999",
      ]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }
    expect(JSON.parse(writes.at(-1) ?? "{}").includedTaskIds).toEqual(["TASK-998", "TASK-999"]);
  });

  it("rejects a review whose inclusion list differs from the immutable snapshot", async () => {
    const { recordPath } = await createApprovableSnapshotFixture(['node -e "process.exit(0)"']);
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.scope.includedTaskIds = ["TASK-999"];
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.reasons[0]).toMatch(/Cannot recompute review scope: Snapshot .* different --include-task scope/);
  });

  it("validates include-task IDs before returning a snapshot scope", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    await expect(createJudgeScope(tmp, task.taskId, "HEAD", snapshot.candidate, ["NOT-A-TASK"])).rejects.toThrow(
      "Invalid task ID: NOT-A-TASK",
    );
  });

  describe("CLI judge verify --approve-commands", () => {
    const runCli = async (args: string[]) => {
      const previousCwd = process.cwd();
      const originalLog = console.log;
      const originalExitCode = process.exitCode;
      const writes: string[] = [];
      console.log = (message?: unknown) => {
        writes.push(String(message));
      };
      try {
        process.chdir(tmp);
        await main(["node", "akrctx", ...args]);
      } finally {
        process.chdir(previousCwd);
        console.log = originalLog;
      }
      const exitCode = process.exitCode;
      process.exitCode = originalExitCode;
      return { output: writes.join("\n"), exitCode };
    };

    // stdin is not a TTY under vitest, so these exercise the headless branch as written.
    it.each([
      { boundary: "CURRENT", legacy: false },
      { boundary: "NEWER_CHANGES", legacy: false },
      { boundary: "DIVERGED", legacy: false },
      { boundary: "DIVERGED", legacy: true },
      { boundary: null, legacy: false },
      { boundary: null, legacy: true },
    ])("labels approval separately from $boundary (legacy=$legacy)", async ({ boundary, legacy }) => {
      const command = 'node -e "process.exit(0)"';
      const { recordPath } = boundary
        ? await createApprovableSnapshotFixture([command])
        : await createReviewFixture({ declares: [command], claims: [command] });
      if (legacy) {
        const {
          criteria: _criteria,
          observations: _observations,
          ...record
        } = JSON.parse(await readFile(recordPath, "utf8"));
        await writeFile(
          recordPath,
          JSON.stringify({
            ...record,
            schemaVersion: LEGACY_JUDGE_SCHEMA_VERSION,
            scope: asSchemaVersion(record.scope, LEGACY_JUDGE_SCHEMA_VERSION),
            issues: [],
          }),
          "utf8",
        );
      }
      if (boundary === "NEWER_CHANGES") {
        await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
      } else if (boundary === "DIVERGED") {
        await execFileAsync("git", ["checkout", "--orphan", "other-lineage"], { cwd: tmp });
      }

      const expected = await verifyJudgeRecord(tmp, recordPath);
      const { output, exitCode } = await runCli(["judge", "verify", recordPath]);
      const json = await runCli(["judge", "verify", recordPath, "--json"]);

      expect(expected.approved).toBe(true);
      expect(expected.verifiedNow.reviewBoundary).toBe(boundary);
      expect(exitCode).toBeUndefined();
      expect(json.exitCode).toBeUndefined();
      expect(JSON.parse(json.output)).toEqual(expected);
      expect(output.split("\n")[0]).toBe("Judge verification: APPROVED for the reviewed boundary");
      expect(output).not.toContain("APPROVED and current");
      expect(output).toContain(`reviewBoundary    ${boundary ?? "not classified for this boundary type"}`);
      expect(output).toContain(`historicalVerdict APPROVED (${expected.historicalVerdict.independence})`);
      expect(output).toContain(`verifiedNow       ${expected.verifiedNow.value} — ${expected.verifiedNow.reason}`);
      expect(output).toContain("Validation was taken on trust.");
      if (legacy) expect(output).toContain("schema            legacy");
      if (boundary === "DIVERGED") {
        expect(output).toContain("verifiedNow       incomplete");
        expect(output).toContain("reviewBoundary: DIVERGED");
      }
      if (boundary === null) expect(output).not.toContain("reviewBoundary    CURRENT");
    });

    it("refuses headless re-execution and prints the invocation that would approve it", async () => {
      const sentinel = path.join(tmp, "cli-unapproved.txt");
      const command = `node -e "require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran')"`;
      const { recordPath } = await createApprovableSnapshotFixture([command]);

      const { output, exitCode } = await runCli(["judge", "verify", path.relative(tmp, recordPath), "--run-tests"]);

      expect(await pathExists(sentinel)).toBe(false);
      expect(exitCode).toBe(1);
      expect(output).toContain(command);
      expect(output).toContain(`--approve-commands ${JSON.stringify(command)}`);
    });

    it("executes when the repeated flags reproduce the declared list, commas included", async () => {
      // A CSV encoding would make this command unapprovable: it contains a comma and there is no
      // defined escape.
      const command = 'node -e "const [a,b] = [0,0]; process.exit(a)"';
      const { recordPath } = await createApprovableSnapshotFixture([command]);

      const { output, exitCode } = await runCli([
        "judge",
        "verify",
        path.relative(tmp, recordPath),
        "--run-tests",
        "--approve-commands",
        command,
      ]);

      expect(exitCode).toBeUndefined();
      expect(output).toContain("APPROVED for the reviewed boundary");
      expect(output).toContain("reviewBoundary    CURRENT");
      expect(output).toContain("re-ran");
    });

    it("refuses a reordered approval and names the first divergence", async () => {
      const first = 'node -e "process.exit(0)"';
      const second = 'node -e "process.exitCode = 0"';
      const { recordPath } = await createApprovableSnapshotFixture([first, second]);

      const { output, exitCode } = await runCli([
        "judge",
        "verify",
        path.relative(tmp, recordPath),
        "--run-tests",
        "--approve-commands",
        second,
        "--approve-commands",
        first,
      ]);

      expect(exitCode).toBe(1);
      expect(output).not.toContain("re-ran");
      expect(output).not.toContain("APPROVED for the reviewed boundary");
      expect(output).toContain(`expected ${JSON.stringify(first)}`);
      expect(output).toContain(`got ${JSON.stringify(second)}`);
    });

    it("refuses an approval that omits one declared command", async () => {
      const first = 'node -e "process.exit(0)"';
      const second = 'node -e "process.exitCode = 0"';
      const { recordPath } = await createApprovableSnapshotFixture([first, second]);

      const { output, exitCode } = await runCli([
        "judge",
        "verify",
        path.relative(tmp, recordPath),
        "--run-tests",
        "--approve-commands",
        first,
      ]);

      expect(exitCode).toBe(1);
      expect(output).not.toContain("APPROVED for the reviewed boundary");
    });

    it("ignores --approve-commands when --run-tests is not set", async () => {
      const command = 'node -e "process.exit(0)"';
      const { recordPath } = await createApprovableSnapshotFixture([command]);

      const withFlag = await runCli([
        "judge",
        "verify",
        path.relative(tmp, recordPath),
        "--approve-commands",
        "something else entirely",
      ]);
      const without = await runCli(["judge", "verify", path.relative(tmp, recordPath)]);

      expect(withFlag.output).toBe(without.output);
      expect(withFlag.exitCode).toBe(without.exitCode);
    });
  });

  it("captures an ignored immutable snapshot without changing Git state", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, "obsolete.ts"), "export const obsolete = true;\n", "utf8");
    await execFileAsync("git", ["add", "obsolete.ts"], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "add obsolete fixture"], { cwd: tmp });
    await rm(path.join(tmp, "obsolete.ts"));
    await writeFile(path.join(tmp, "untracked.ts"), "export const untracked = true;\n", "utf8");
    const gitState = async () => ({
      head: (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tmp })).stdout,
      branch: (await execFileAsync("git", ["branch", "--show-current"], { cwd: tmp })).stdout,
      status: (await execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: tmp })).stdout,
      staged: (await execFileAsync("git", ["diff", "--cached", "--binary"], { cwd: tmp })).stdout,
      refs: (await execFileAsync("git", ["for-each-ref", "--format=%(refname) %(objectname)"], { cwd: tmp })).stdout,
      stash: (await execFileAsync("git", ["stash", "list"], { cwd: tmp })).stdout,
    });
    const before = await gitState();

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    expect(await gitState()).toEqual(before);
    expect(snapshot.candidate).toBe(`SNAPSHOT:${snapshot.id}`);
    expect(await readFile(path.join(snapshot.worktreePath, "app.ts"), "utf8")).toContain("value = 2");
    expect(await pathExists(path.join(snapshot.worktreePath, "obsolete.ts"))).toBe(false);
    expect(await readFile(path.join(snapshot.worktreePath, "untracked.ts"), "utf8")).toContain("untracked = true");
    await execFileAsync("git", ["check-ignore", "-q", path.relative(tmp, snapshot.metadataPath)], { cwd: tmp });
  });

  it("rejects an accidentally empty committed boundary before publishing anything", async () => {
    const { task } = await createReviewFixture();
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "implementation"], { cwd: tmp });

    await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(
      /empty judge boundary.*HEAD as the base does not include commits.*--base origin\/main/i,
    );
    expect(await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => [])).toEqual([]);
    expect(
      (await readdir(path.join(tmp, ".akrctx/local/judge")).catch(() => [])).filter((entry) =>
        entry.startsWith(".capture-"),
      ),
    ).toEqual([]);
  });

  it("allows and integrity-binds an explicitly authorized empty snapshot", async () => {
    const { task } = await createReviewFixture();
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "implementation"], { cwd: tmp });

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD", [], true);
    expect(snapshot.emptyBoundaryAuthorized).toBe(true);
    expect(snapshot.scope.changedFiles).toEqual([]);
    expect(snapshot.scope.emptyBoundaryAuthorized).toBe(true);
    expect((await loadJudgeSnapshot(tmp, snapshot.candidate)).metadata.emptyBoundaryAuthorized).toBe(true);

    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    metadata.emptyBoundaryAuthorized = false;
    await writeFile(snapshot.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow(/metadata shape or identity is invalid/);
  });

  it("canonicalizes remote refs, local branches, tags, and hashes to one base identity", async () => {
    const { task } = await createReviewFixture({ declares: ['node -e "process.exit(0)"'] });
    const baseCommit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tmp })).stdout.trim();
    await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", baseCommit], { cwd: tmp });
    await execFileAsync("git", ["branch", "task-057-base", baseCommit], { cwd: tmp });
    await execFileAsync("git", ["tag", "task-057-tag", baseCommit], { cwd: tmp });

    const scopes = await Promise.all(
      ["origin/main", "task-057-base", "task-057-tag", baseCommit].map((base) =>
        createJudgeScope(tmp, task.taskId, base, "WORKTREE"),
      ),
    );

    for (const scope of scopes) expect(scope.base).toBe(baseCommit);
    expect(scopes[0].baseRef).toBe("origin/main");
    expect(scopes[1].baseRef).toBe("task-057-base");
    expect(scopes[2].baseRef).toBe("task-057-tag");
    expect(scopes[3].baseRef).toBeUndefined();
    expect(new Set(scopes.map((scope) => scope.scopeDigest)).size).toBe(1);
  });

  it("verifies a snapshot after its symbolic remote base ref is absent", async () => {
    const command = 'node -e "process.exit(0)"';
    const { task } = await createReviewFixture({ declares: [command], claims: [command] });
    const baseCommit = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tmp })).stdout.trim();
    await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", baseCommit], { cwd: tmp });
    await execFileAsync("git", ["tag", "task-057-tag", baseCommit], { cwd: tmp });
    const first = await captureJudgeSnapshot(tmp, task.taskId, "origin/main");
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "task-057-tag");
    const persisted = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    expect(first.id).toBe(snapshot.id);
    expect(first.scope.base).toBe(baseCommit);
    expect(snapshot.scope.base).toBe(baseCommit);
    expect(first.scope.baseRef).toBeUndefined();
    expect(snapshot.scope.baseRef).toBeUndefined();
    expect(persisted.sourceScope.baseRef).toBeUndefined();
    expect(persisted.scope.baseRef).toBeUndefined();
    const recordPath = path.join(tmp, ".akrctx/local/judge/origin-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await execFileAsync("git", ["update-ref", "-d", "refs/remotes/origin/main"], { cwd: tmp });

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result).toMatchObject({ valid: true, approved: true, reasons: [], reexecuted: [{ command, passed: true }] });
    expect(snapshot.scope.base).toBe(baseCommit);
    await execFileAsync("git", ["tag", "-d", "task-057-tag"], { cwd: tmp });
    expect(await execFileAsync("git", ["remote"], { cwd: snapshot.worktreePath })).toMatchObject({ stdout: "" });
  });

  it("rejects an unresolved base before publishing a snapshot", async () => {
    const { task } = await createReviewFixture();

    await expect(captureJudgeSnapshot(tmp, task.taskId, "origin/does-not-exist")).rejects.toThrow(
      "Cannot resolve Git commit: origin/does-not-exist",
    );
    expect(await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => [])).toEqual([]);
  });

  it("builds a snapshot's own CLI artifacts instead of relying on ignored live output", async () => {
    const { task } = await createReviewFixture();
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "akr-context",
      }),
      "utf8",
    );
    await mkdir(path.join(tmp, "src"), { recursive: true });
    await writeFile(path.join(tmp, "src/index.ts"), 'export const snapshotBuild = "snapshot build";\n', "utf8");
    await writeFile(path.join(tmp, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    expect(await readFile(path.join(snapshot.worktreePath, "dist/index.js"), "utf8")).toContain("snapshot build");
    expect(await pathExists(path.join(tmp, "dist/index.js"))).toBe(false);
  });

  it.each(["dist/index.js", "dist/index.js.map"])(
    "invalidates a snapshot when ignored artifact %s is tampered with",
    async (artifact) => {
      const { task } = await createReviewFixture();
      await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
      await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
      await mkdir(path.join(tmp, "src"), { recursive: true });
      await writeFile(path.join(tmp, "src/index.ts"), 'export const snapshotBuild = "snapshot build";\n', "utf8");

      const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
      await writeFile(
        path.join(snapshot.worktreePath, artifact),
        `${await readFile(path.join(snapshot.worktreePath, artifact), "utf8")}tampered\n`,
        "utf8",
      );

      await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow(/artifact integrity/);
    },
  );

  it("gives equivalent recaptures the same snapshot ID", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
    await mkdir(path.join(tmp, "src"), { recursive: true });
    await writeFile(path.join(tmp, "src/index.ts"), 'export const snapshotBuild = "snapshot build";\n', "utf8");

    const first = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const second = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    expect(second.id).toBe(first.id);
    expect(second.candidate).toBe(first.candidate);
  });

  it("keeps artifact identity independent from mutable ctime integrity", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
    await mkdir(path.join(tmp, "src"), { recursive: true });
    await writeFile(path.join(tmp, "src/index.ts"), 'export const snapshotBuild = "snapshot build";\n', "utf8");

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));

    expect(metadata.artifactContentDigest).toBeDefined();
    expect(metadata.artifactIntegrityDigest).toBeDefined();
    expect(metadata.artifactContentDigest).not.toBe(metadata.artifactIntegrityDigest);

    const recapture = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    expect(recapture.id).toBe(snapshot.id);
  });

  it("rejects an artifact whose content and mutable fingerprint are both replaced", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
    await mkdir(path.join(tmp, "src"), { recursive: true });
    await writeFile(path.join(tmp, "src/index.ts"), 'export const snapshotBuild = "snapshot build";\n', "utf8");

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const artifactPath = path.join(snapshot.worktreePath, "dist/index.js");
    await writeFile(artifactPath, `${await readFile(artifactPath, "utf8")}tampered\n`, "utf8");
    const artifactInfo = await stat(artifactPath);
    const artifactBytes = await readFile(artifactPath);
    const artifactContent = `sha256:${createHash("sha256").update("file\\0").update(artifactBytes).digest("hex")}`;
    const artifactStat = `sha256:${createHash("sha256").update("stat\\0").update(String(artifactInfo.ctimeMs)).digest("hex")}`;
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    const originalMapBytes = await readFile(path.join(snapshot.worktreePath, "dist/index.js.map"));
    const mapInfo = await stat(path.join(snapshot.worktreePath, "dist/index.js.map"));
    const mapContent = `sha256:${createHash("sha256").update("file\\0").update(originalMapBytes).digest("hex")}`;
    const mapStat = `sha256:${createHash("sha256").update("stat\\0").update(String(mapInfo.ctimeMs)).digest("hex")}`;
    const integrity = createHash("sha256")
      .update(`dist/index.js\\0${artifactContent}\\0${artifactStat}\\0`)
      .update(`dist/index.js.map\\0${mapContent}\\0${mapStat}\\0`)
      .digest("hex");
    metadata.artifactIntegrityDigest = `sha256:${integrity}`;
    await writeFile(snapshot.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow(
      "generated artifact content no longer matches its capture",
    );
  });

  it("rejects a non-regular package.json before reading it", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
    await execFileAsync("git", ["add", "package.json"], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "add package metadata"], { cwd: tmp });
    await rm(path.join(tmp, "package.json"), { recursive: true, force: true });
    await mkdir(path.join(tmp, "package.json"));

    await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(
      /package\.json must be a regular file/,
    );
  });

  it("rejects a package.json symlink before reading outside the snapshot", async () => {
    const { task } = await createReviewFixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), "akrctx-external-package-"));
    try {
      await writeFile(path.join(outside, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
      await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
      await symlink(path.join(outside, "package.json"), path.join(tmp, "package.json"));

      await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(
        /package.json.*outside the snapshot/,
      );

      const snapshots = await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => []);
      expect(snapshots).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects an akrctx package when its fixed entry is missing", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");

    await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(
      /fixed entry src\/index\.ts is missing/,
    );

    const snapshots = await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => []);
    expect(snapshots).toEqual([]);
  });

  it("rejects an akrctx entry symlink that points outside the snapshot", async () => {
    const { task } = await createReviewFixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), "akrctx-external-entry-"));
    try {
      const externalEntry = path.join(outside, "index.ts");
      await writeFile(externalEntry, 'export const leaked = "external entry";\n', "utf8");
      await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
      await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
      await mkdir(path.join(tmp, "src"), { recursive: true });
      await symlink(externalEntry, path.join(tmp, "src/index.ts"));

      await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(
        /must not be a symlink|outside the snapshot/,
      );

      const snapshots = await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => []);
      expect(snapshots).toEqual([]);
      expect(await pathExists(path.join(tmp, "dist/index.js"))).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects an akrctx absolute import that points outside the snapshot", async () => {
    const { task } = await createReviewFixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), "akrctx-external-absolute-"));
    try {
      const externalImport = path.join(outside, "external.ts");
      await writeFile(externalImport, 'export const leaked = "external absolute import";\n', "utf8");
      await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
      await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
      await mkdir(path.join(tmp, "src"), { recursive: true });
      await writeFile(
        path.join(tmp, "src/index.ts"),
        `import { leaked } from ${JSON.stringify(externalImport)};\nexport { leaked };\n`,
        "utf8",
      );

      await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(/outside the snapshot/);

      const snapshots = await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => []);
      expect(snapshots).toEqual([]);
      expect(await pathExists(path.join(tmp, "dist/index.js"))).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects a relative import symlink that points outside the snapshot", async () => {
    const { task } = await createReviewFixture();
    const outside = await mkdtemp(path.join(os.tmpdir(), "akrctx-external-relative-"));
    try {
      const externalImport = path.join(outside, "external.ts");
      await writeFile(externalImport, 'export const leaked = "external relative import";\n', "utf8");
      await writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "akr-context" }), "utf8");
      await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
      await mkdir(path.join(tmp, "src"), { recursive: true });
      await writeFile(
        path.join(tmp, "src/index.ts"),
        'import { leaked } from "./escape.ts";\nexport { leaked };\n',
        "utf8",
      );
      await symlink(externalImport, path.join(tmp, "src/escape.ts"));

      await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(/outside the snapshot/);

      const snapshots = await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => []);
      expect(snapshots).toEqual([]);
      expect(await pathExists(path.join(tmp, "dist/index.js"))).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("does not execute an akrctx candidate's build script while capturing a snapshot", async () => {
    const { task } = await createReviewFixture();
    const marker = path.join(tmp, "candidate-build-ran.txt");
    const encodedMarker = Buffer.from(marker).toString("base64");
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "akr-context",
        scripts: {
          build: `node -e "require('fs').writeFileSync(Buffer.from('${encodedMarker}','base64').toString(),'unexpected')"`,
        },
      }),
      "utf8",
    );
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
    await mkdir(path.join(tmp, "src"), { recursive: true });
    await writeFile(path.join(tmp, "src/index.ts"), 'export const safeEntry = "safe";\n', "utf8");

    await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    expect(await pathExists(marker)).toBe(false);
  });

  it("cleans up a snapshot capture when its local artifact build fails", async () => {
    const { task } = await createReviewFixture();
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "akr-context", scripts: { build: 'node -e "process.exit(1)"' } }),
      "utf8",
    );
    await mkdir(path.join(tmp, "src"), { recursive: true });
    await writeFile(path.join(tmp, "src/index.ts"), "export const =\n", "utf8");
    await writeFile(path.join(tmp, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");

    await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow(
      "Cannot build judge snapshot artifacts",
    );

    const snapshots = await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => []);
    expect(snapshots).toEqual([]);
  });

  it("does not execute a consumer project's build script while capturing a snapshot", async () => {
    const { task } = await createReviewFixture();
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "consumer-project",
        scripts: { build: "node -e \"require('fs').writeFileSync('consumer-build-ran.txt','unexpected')\"" },
      }),
      "utf8",
    );

    await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    expect(await pathExists(path.join(tmp, "consumer-build-ran.txt"))).toBe(false);
  });

  it("captures a snapshot when live file modes differ from a fresh checkout (mode-insensitive)", async () => {
    const restore = process.umask(0o022);
    const { task } = await createReviewFixture();
    const restore2 = process.umask(0o0002);
    try {
      const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
      expect(snapshot.candidate).toBe(`SNAPSHOT:${snapshot.id}`);
      expect(await pathExists(path.join(snapshot.worktreePath, "app.ts"))).toBe(true);
    } finally {
      process.umask(restore2);
      process.umask(restore);
    }
  });

  it("removes blocked tracked paths from a shallow review worktree", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, ".env"), "DO_NOT_COPY=secret\n", "utf8");
    await execFileAsync("git", ["add", ".env"], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "add blocked fixture"], { cwd: tmp });
    await rm(path.join(tmp, ".env"));

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const { stdout } = await execFileAsync("git", ["rev-list", "--count", "--all"], { cwd: snapshot.worktreePath });
    const remotes = await execFileAsync("git", ["remote"], { cwd: snapshot.worktreePath });

    expect(snapshot.scope.excludedPaths).toContain(".env");
    expect(await pathExists(path.join(snapshot.worktreePath, ".env"))).toBe(false);
    expect(Number(stdout.trim())).toBeLessThanOrEqual(2);
    expect(remotes.stdout).toBe("");
  });

  it("keeps snapshot approval valid while the live worktree moves", async () => {
    const { task } = await createReviewFixture({ declares: ['node -e "process.exit(0)"'], claims: [] });
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const command = 'node -e "process.exit(0)"';
    const recordPath = path.join(tmp, ".akrctx/local/judge/snapshot-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.approved).toBe(true);
    expect(result.reexecuted[0]).toMatchObject({ command, passed: true });
    expect(await readFile(path.join(snapshot.worktreePath, "app.ts"), "utf8")).toContain("value = 2");
  });

  it("invalidates a snapshot approval when snapshot content is tampered with", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/snapshot-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command: "pnpm test", status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(path.join(snapshot.worktreePath, "app.ts"), "export const value = 99;\n", "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.join("\n")).toContain("Snapshot integrity check failed");
  });

  it("invalidates a snapshot approval when the snapshot workspace is deleted", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/snapshot-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command: "pnpm test", status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await rm(snapshot.worktreePath, { recursive: true, force: true });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.join("\n")).toContain("Snapshot integrity check failed");
  });

  it("rejects a snapshot whose ignored dependency directory links to the live project", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    await mkdir(path.join(tmp, "node_modules"), { recursive: true });
    await symlink(path.join(tmp, "node_modules"), path.join(snapshot.worktreePath, "node_modules"), "dir");

    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow("dependency directory is a symlink");
  });

  it("refuses to read an old snapshot after blocked-read policy changes", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/snapshot-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command: "pnpm test", status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.blockedReadPatterns.push("*.new-secret");
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons.join("\n")).toContain("blocked-read policy changed after capture");
  });

  it("runs mutating snapshot validation away from the live worktree and detects it", async () => {
    const mutating = "node -e \"require('fs').writeFileSync('app.ts', 'export const value = 7;\\n')\"";
    const { task } = await createReviewFixture({ declares: [mutating], claims: [] });
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/snapshot-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command: mutating, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.approved).toBe(false);
    expect(result.reasons.join("\n")).toContain("Validation changed the snapshot");
    expect(await readFile(path.join(tmp, "app.ts"), "utf8")).toContain("value = 2");
    expect(await readFile(path.join(snapshot.worktreePath, "app.ts"), "utf8")).toContain("value = 2");
  });

  /**
   * pnpm does not install a tree: it installs a store under `node_modules/.pnpm` plus a farm
   * of symlinks that give each package its own resolution root. `leaf` is reachable only
   * through `dep`'s private directory, so a copy that flattens the links cannot resolve it.
   */
  async function writePnpmLayout(root: string): Promise<void> {
    const store = path.join(root, "node_modules/.pnpm");
    for (const [name, body] of [
      ["dep@1.0.0/node_modules/dep", 'module.exports = require("leaf");\n'],
      ["leaf@1.0.0/node_modules/leaf", 'module.exports = "leaf reached";\n'],
    ] as const) {
      await mkdir(path.join(store, name), { recursive: true });
      await writeFile(path.join(store, name, "index.js"), body, "utf8");
      await writeFile(
        path.join(store, name, "package.json"),
        `${JSON.stringify({ name: path.basename(name), version: "1.0.0", main: "index.js" })}\n`,
        "utf8",
      );
    }
    await symlink(".pnpm/dep@1.0.0/node_modules/dep", path.join(root, "node_modules/dep"), "dir");
    await symlink("../../leaf@1.0.0/node_modules/leaf", path.join(store, "dep@1.0.0/node_modules/leaf"), "dir");
  }

  it("materialises dependencies from the lockfile so validation resolves transitive packages", async () => {
    const command = "node -e \"if(require('dep')!=='leaf reached')process.exit(1)\"";
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Resolve deps from lockfile", { cwd: tmp, nonInteractive: true });
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    const filled = original.replace("```\n```", `\`\`\`\n${command}\n\`\`\``);
    expect(filled).not.toBe(original);
    await writeFile(taskFile, filled, "utf8");
    await writeFile(path.join(tmp, "app.ts"), "export const value = 1;\n", "utf8");
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\nnode_modules/\n", "utf8");
    await mkdir(path.join(tmp, "packages/dep"), { recursive: true });
    await mkdir(path.join(tmp, "packages/leaf"), { recursive: true });
    await writeFile(
      path.join(tmp, "packages/leaf/package.json"),
      `${JSON.stringify({ name: "leaf", version: "1.0.0", main: "index.js" })}\n`,
      "utf8",
    );
    await writeFile(path.join(tmp, "packages/leaf/index.js"), 'module.exports = "leaf reached";\n', "utf8");
    await writeFile(
      path.join(tmp, "packages/dep/package.json"),
      `${JSON.stringify({ name: "dep", version: "1.0.0", main: "index.js", dependencies: { leaf: "file:../leaf" } })}\n`,
      "utf8",
    );
    await writeFile(path.join(tmp, "packages/dep/index.js"), 'module.exports = require("leaf");\n', "utf8");
    await writeFile(
      path.join(tmp, "package.json"),
      `${JSON.stringify({ name: "app", version: "1.0.0", dependencies: { dep: "file:packages/dep" } })}\n`,
      "utf8",
    );
    await execFileAsync("pnpm", ["install"], { cwd: tmp, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
    await writeFile(path.join(tmp, "app.ts"), "export const value = 2;\n", "utf8");

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/lockfile-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify({
        schemaVersion: JUDGE_SCHEMA_VERSION,
        taskId: task.taskId,
        scope: snapshot.scope,
        verdict: "APPROVED",
        tests: [{ command, status: "passed" }],
        criteria: await passingCriteria(task.taskId),
        observations: [],
        reviewedAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });
    expect(result.reexecuted[0]).toMatchObject({ command, passed: true });
    expect(result.approved).toBe(true);
  });

  it("dereferences a dependency symlink that escapes the dependency tree", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\nnode_modules/\nsecrets-outside/\n", "utf8");
    await mkdir(path.join(tmp, "node_modules"), { recursive: true });
    await mkdir(path.join(tmp, "secrets-outside"), { recursive: true });
    await writeFile(path.join(tmp, "secrets-outside/data.txt"), "outside content\n", "utf8");
    // Absolute, and relative that climbs out: both leave the tree and must not survive as links.
    await symlink(path.join(tmp, "secrets-outside"), path.join(tmp, "node_modules/absolute-escape"), "dir");
    await symlink("../secrets-outside", path.join(tmp, "node_modules/relative-escape"), "dir");
    await symlink(path.join(tmp, "node_modules/nowhere"), path.join(tmp, "node_modules/broken"), "dir");

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const dependencies = path.join(snapshot.worktreePath, "node_modules");

    for (const name of ["absolute-escape", "relative-escape"]) {
      expect((await lstat(path.join(dependencies, name))).isSymbolicLink(), name).toBe(false);
      expect(await readFile(path.join(dependencies, name, "data.txt"), "utf8")).toBe("outside content\n");
    }
    expect(await pathExists(path.join(dependencies, "broken"))).toBe(false);
  });

  it("keeps every surviving dependency link inside the snapshot", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\nnode_modules/\n", "utf8");
    await writePnpmLayout(tmp);
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const dependencies = path.join(snapshot.worktreePath, "node_modules");

    const walk = async (directory: string): Promise<string[]> => {
      const found: string[] = [];
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          found.push(path.resolve(path.dirname(absolute), await readlink(absolute)));
        } else if (entry.isDirectory()) {
          found.push(...(await walk(absolute)));
        }
      }
      return found;
    };

    const targets = await walk(dependencies);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(path.relative(dependencies, target).startsWith(".."), target).toBe(false);
    }
  });

  it("recreates a symlink among the changed files instead of throwing", async () => {
    const { task } = await createReviewFixture();
    await symlink("app.ts", path.join(tmp, "app-link.ts"));
    await execFileAsync("git", ["add", "app-link.ts"], { cwd: tmp });

    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const link = path.join(snapshot.worktreePath, "app-link.ts");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe("app.ts");
  });

  it("verify --run-tests does not trust the snapshot's node_modules", async () => {
    const command =
      "node -e \"if(require('fs').existsSync('node_modules/MARKER.txt'))process.exit(0);else process.exit(1)\"";
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\nnode_modules/\n", "utf8");
    await mkdir(path.join(tmp, "node_modules"), { recursive: true });
    await writeFile(path.join(tmp, "node_modules/MARKER.txt"), "planted\n", "utf8");
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    expect(await readFile(path.join(snapshot.worktreePath, "node_modules/MARKER.txt"), "utf8")).toBe("planted\n");
    expect((await lstat(path.join(snapshot.worktreePath, "node_modules"))).isSymbolicLink()).toBe(false);
    const recordPath = path.join(tmp, ".akrctx/local/judge/dependency-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.reexecuted).toHaveLength(1);
    expect(result.reexecuted[0]).toMatchObject({ command, passed: false });
    expect(result.reexecuted[0].evidence).toMatchObject({ status: "failed" });
    expect(result.approved).toBe(false);
    expect(result.reasons.join("\n")).toContain("Independent re-run");
    expect(await readFile(path.join(snapshot.worktreePath, "app.ts"), "utf8")).toContain("value = 2");
    expect(await readFile(path.join(tmp, "app.ts"), "utf8")).toContain("value = 2");
  });

  it("verify --run-tests fails when the boundary declares dependencies but has no lockfile", async () => {
    const command = 'node -e "process.exit(0)"';
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    await writeFile(
      path.join(tmp, "package.json"),
      `${JSON.stringify({ name: "app", dependencies: { dep: "^1.0.0" } })}\n`,
      "utf8",
    );
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/no-lockfile-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.approved).toBe(false);
    expect(result.reexecuted).toEqual([]);
    expect(result.reasons.join("\n")).toContain("no lockfile");
  });

  it("allows ignored validation output inside the snapshot without touching live files", async () => {
    const command =
      "node -e \"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/out.js','ok')\"";
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\n", "utf8");
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/snapshot-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

    expect(result.approved).toBe(true);
    expect(await pathExists(path.join(snapshot.worktreePath, "dist/out.js"))).toBe(false);
    expect(await pathExists(path.join(tmp, "dist/out.js"))).toBe(false);
  });

  it("does not false-positive when an honest review writes ignored output inside the snapshot", async () => {
    const command =
      "node -e \"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/out.js','ok')\"";
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    await writeFile(path.join(tmp, ".gitignore"), ".akrctx/local/\ndist/\nnode_modules/\n", "utf8");
    await mkdir(path.join(tmp, "node_modules"), { recursive: true });
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    // An honest in-snapshot review writes ignored build output and dependency churn — both at the
    // root, both ignored — and neither moves a covered path's ctime or a tracked ancestor dir's,
    // so a later load must still succeed. (The inode number is excluded from the fingerprint
    // precisely because it would make this nondeterministic on FUSE mounts; see `statOf`.)
    await execFileAsync(
      "node",
      [
        "-e",
        "require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/out.js','ok');" +
          "require('fs').writeFileSync('node_modules/ran.txt','ok');",
      ],
      {
        cwd: snapshot.worktreePath,
        encoding: "utf8",
      },
    );
    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).resolves.toBeDefined();
  });

  it("detects a write-then-restore on a manifest-covered file at the next load", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const file = path.join(snapshot.worktreePath, "app.ts");
    const original = await readFile(file, "utf8");
    await writeFile(file, "export const value = 999;\n", "utf8");
    await writeFile(file, original, "utf8");
    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow("modified after capture");
  });

  it("detects a file created then deleted inside a tracked directory", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const scratch = path.join(snapshot.worktreePath, task.taskDir, "scratch.tmp");
    await writeFile(scratch, "transient\n", "utf8");
    await rm(scratch, { force: true });
    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow("modified after capture");
  });

  it("leaves no snapshot directory behind when capture fails its own verification", async () => {
    const { task } = await createReviewFixture();
    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.blockedReadPatterns.push("policy.json");
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    await expect(captureJudgeSnapshot(tmp, task.taskId, "HEAD")).rejects.toThrow();

    const remaining = await readdir(path.join(tmp, ".akrctx/local/judge/snapshots")).catch(() => []);
    expect(remaining).toEqual([]);
  });

  it("detects a manifest-covered file deleted then recreated with identical bytes", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const file = path.join(snapshot.worktreePath, "app.ts");
    const original = await readFile(file, "utf8");
    await rm(file, { force: true });
    await writeFile(file, original, "utf8");
    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow("modified after capture");
  });

  it("refuses to load a snapshot captured before write detection", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    metadata.version = 1;
    await writeFile(snapshot.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow("predates write detection");
  });

  it("refuses to load a snapshot captured with the previous inode-based fingerprint", async () => {
    // The fingerprint once included the inode number, which drifts on FUSE/network mounts and made
    // an honest snapshot permanently unreviewable. That field is gone and `SNAPSHOT_VERSION` moved;
    // a snapshot claiming the old version is refused, never silently accepted as if it carried the
    // current guarantee.
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    metadata.version = 2;
    await writeFile(snapshot.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow("predates write detection");
  });

  it("fails legacy snapshots without canonical base metadata with an explicit diagnostic", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    metadata.version = 4;
    await writeFile(snapshot.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow(
      "predates write detection and canonical Git base refs (legacy format)",
    );
  });

  it("distinguishes v5 snapshots from older legacy contracts", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    metadata.version = 5;
    await writeFile(snapshot.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    const error = await loadJudgeSnapshot(tmp, snapshot.candidate).catch((value: unknown) => value as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("predates the empty-boundary authorization contract");
    expect((error as Error).message).not.toContain("canonical Git base refs");
  });

  it("computes reviewContentDigest without ctime and reviewWorkspaceDigest with it, across two captures of the same content", async () => {
    const { task } = await createReviewFixture();
    const first = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const firstMetadata = JSON.parse(await readFile(first.metadataPath, "utf8"));
    await rm(path.join(tmp, ".akrctx/local/judge/snapshots", first.id), { recursive: true, force: true });
    const second = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const secondMetadata = JSON.parse(await readFile(second.metadataPath, "utf8"));

    expect(second.id).toBe(first.id);
    expect(secondMetadata.contentDigest).toBe(firstMetadata.contentDigest);
    expect(secondMetadata.reviewContentDigest).toBe(firstMetadata.reviewContentDigest);
    expect(secondMetadata.workspaceDigest).not.toBe(firstMetadata.workspaceDigest);
    expect(secondMetadata.reviewWorkspaceDigest).not.toBe(firstMetadata.reviewWorkspaceDigest);
  });

  it("excludes a valid continuation sidecar from reviewContentDigest but not from contentDigest", async () => {
    const { task } = await createReviewFixture();
    await writeContinuationSidecar(task, `${JSON.stringify(validContinuationRecord(task), null, 2)}\n`);
    const withSidecar = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const withSidecarMetadata = JSON.parse(await readFile(withSidecar.metadataPath, "utf8"));

    expect(withSidecarMetadata.reviewContentDigest).not.toBe(withSidecarMetadata.contentDigest);

    await rm(path.join(tmp, task.taskDir, "continuation.json"), { force: true });
    const bare = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const bareMetadata = JSON.parse(await readFile(bare.metadataPath, "utf8"));

    // Same app content, no sidecar: the review manifest and the full manifest are identical.
    expect(bareMetadata.reviewContentDigest).toBe(bareMetadata.contentDigest);
    // Excluding the valid sidecar makes the review identity of the two captures agree even though
    // one carried an extra tracked file.
    expect(withSidecarMetadata.reviewContentDigest).toBe(bareMetadata.reviewContentDigest);
  });

  it("keeps reviewWorkspaceDigest distinct from workspaceDigest when a valid sidecar is present", async () => {
    const { task } = await createReviewFixture();
    await writeContinuationSidecar(task, `${JSON.stringify(validContinuationRecord(task), null, 2)}\n`);
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));

    expect(metadata.reviewWorkspaceDigest).not.toBe(metadata.workspaceDigest);
  });

  it("keeps reviewContentDigest stable when only a valid sidecar's body changes", async () => {
    const { task } = await createReviewFixture();
    const recordA = validContinuationRecord(task);
    await writeContinuationSidecar(task, `${JSON.stringify(recordA, null, 2)}\n`);
    const snapshotA = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadataA = JSON.parse(await readFile(snapshotA.metadataPath, "utf8"));

    const recordB: ContinuationRecord = {
      ...recordA,
      task: { ...recordA.task, capsuleDigest: `sha256:${"b".repeat(64)}` },
    };
    await writeContinuationSidecar(task, `${JSON.stringify(recordB, null, 2)}\n`);
    const snapshotB = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadataB = JSON.parse(await readFile(snapshotB.metadataPath, "utf8"));

    expect(metadataA.contentDigest).not.toBe(metadataB.contentDigest);
    expect(metadataA.reviewContentDigest).toBe(metadataB.reviewContentDigest);
  });

  it("keeps an invalid continuation sidecar inside reviewContentDigest", async () => {
    const { task } = await createReviewFixture();
    await writeContinuationSidecar(task, "not json\n");
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));

    expect(metadata.reviewContentDigest).toBe(metadata.contentDigest);
  });

  it("keeps an unsupported-schema continuation sidecar inside reviewContentDigest", async () => {
    const { task } = await createReviewFixture();
    const record = { ...validContinuationRecord(task), schemaVersion: 2 };
    await writeContinuationSidecar(task, `${JSON.stringify(record, null, 2)}\n`);
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));

    expect(metadata.reviewContentDigest).toBe(metadata.contentDigest);
  });

  it("keeps an irregular continuation sidecar (symlink) inside reviewContentDigest", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, task.taskDir, "elsewhere.json"), "{}\n", "utf8");
    await symlink("elsewhere.json", path.join(tmp, task.taskDir, "continuation.json"));
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));

    expect(metadata.reviewContentDigest).toBe(metadata.contentDigest);
  });

  it("fails integrity when the immutable capture's sidecar is altered after capture", async () => {
    const { task } = await createReviewFixture();
    await writeContinuationSidecar(task, `${JSON.stringify(validContinuationRecord(task), null, 2)}\n`);
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const sidecar = path.join(snapshot.worktreePath, task.taskDir, "continuation.json");
    const tampered: ContinuationRecord = {
      ...validContinuationRecord(task),
      task: { ...validContinuationRecord(task).task, capsuleDigest: `sha256:${"c".repeat(64)}` },
    };
    await writeFile(sidecar, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
    await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).rejects.toThrow("Snapshot integrity check failed");
  });

  it("refuses to load a snapshot captured before the review content identity contract", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    metadata.version = 6;
    await writeFile(snapshot.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    const error = await loadJudgeSnapshot(tmp, snapshot.candidate).catch((value: unknown) => value as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("predates the review content identity contract");
  });

  it("loads deterministically: repeated loads of the same snapshot all succeed", async () => {
    // Guards against any per-call nondeterministic field in the fingerprint (a random, a clock,
    // or an inode number re-read on every load). The inode number was removed for exactly this
    // reason — it is synthesized by FUSE daemons and drifts over time — so a snapshot must load
    // the same way every time it is read.
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    for (let i = 0; i < 5; i += 1) {
      await expect(loadJudgeSnapshot(tmp, snapshot.candidate)).resolves.toBeDefined();
    }
  });

  it("reports snapshot currency separately from historical approval validity", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    expect((await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate)).status).toBe("CURRENT");
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
    const newer = await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate);
    expect(newer.status).toBe("NEWER_CHANGES");
    expect(newer.changedFiles).toContain("app.ts");

    await execFileAsync("git", ["checkout", "--orphan", "other-lineage"], { cwd: tmp });
    expect((await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate)).status).toBe("DIVERGED");
  });

  it("keeps reviewBoundary CURRENT when a continuation sidecar is created live, and reports it CREATED", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    await writeContinuationSidecar(task, `${JSON.stringify(validContinuationRecord(task), null, 2)}\n`);
    const state = await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate);

    expect(state.reviewBoundary).toBe("CURRENT");
    expect(state.executionMetadata).toBe("CREATED");
  });

  it("keeps reviewBoundary CURRENT when a captured continuation sidecar is deleted live, and reports it REMOVED", async () => {
    const { task } = await createReviewFixture();
    await writeContinuationSidecar(task, `${JSON.stringify(validContinuationRecord(task), null, 2)}\n`);
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    await rm(path.join(tmp, task.taskDir, "continuation.json"), { force: true });
    const state = await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate);

    expect(state.reviewBoundary).toBe("CURRENT");
    expect(state.executionMetadata).toBe("REMOVED");
  });

  it("keeps reviewBoundary CURRENT when a continuation sidecar is edited live, and reports it ADVANCED", async () => {
    const { task } = await createReviewFixture();
    await writeContinuationSidecar(task, `${JSON.stringify(validContinuationRecord(task), null, 2)}\n`);
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    const advanced: ContinuationRecord = {
      ...validContinuationRecord(task),
      task: { ...validContinuationRecord(task).task, capsuleDigest: `sha256:${"d".repeat(64)}` },
    };
    await writeContinuationSidecar(task, `${JSON.stringify(advanced, null, 2)}\n`);
    const state = await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate);

    expect(state.reviewBoundary).toBe("CURRENT");
    expect(state.executionMetadata).toBe("ADVANCED");
  });

  it("reports ADVANCED for a continuation sidecar replaced with rename, not CREATED plus REMOVED", async () => {
    const { task } = await createReviewFixture();
    await writeContinuationSidecar(task, `${JSON.stringify(validContinuationRecord(task), null, 2)}\n`);
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    const replacement: ContinuationRecord = {
      ...validContinuationRecord(task),
      task: { ...validContinuationRecord(task).task, capsuleDigest: `sha256:${"e".repeat(64)}` },
    };
    const staged = path.join(tmp, task.taskDir, "continuation.json.next");
    await writeFile(staged, `${JSON.stringify(replacement, null, 2)}\n`, "utf8");
    await rename(staged, path.join(tmp, task.taskDir, "continuation.json"));

    const state = await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate);

    expect(state.reviewBoundary).toBe("CURRENT");
    expect(state.executionMetadata).toBe("ADVANCED");
  });

  it("does not exclude an irregular continuation sidecar; editing it moves reviewBoundary off CURRENT", async () => {
    const { task } = await createReviewFixture();
    await writeFile(path.join(tmp, task.taskDir, "elsewhere.json"), "{}\n", "utf8");
    await symlink("elsewhere.json", path.join(tmp, task.taskDir, "continuation.json"));
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    await writeFile(path.join(tmp, task.taskDir, "elsewhere.json"), '{"changed":true}\n', "utf8");
    const state = await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate);

    expect(state.reviewBoundary).not.toBe("CURRENT");
  });

  it("moves reviewBoundary off CURRENT when real code changes accompany a sidecar change", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    await writeContinuationSidecar(task, `${JSON.stringify(validContinuationRecord(task), null, 2)}\n`);
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
    const state = await checkJudgeSnapshotCurrentState(tmp, snapshot.candidate);

    expect(["NEWER_CHANGES", "DIVERGED"]).toContain(state.reviewBoundary);
  });

  it("rejects current-state claims from non-approved snapshot records", async () => {
    const { task } = await createReviewFixture();
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const recordPath = path.join(tmp, ".akrctx/local/judge/rejected-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: snapshot.scope,
          verdict: "NEEDS_CHANGES",
          tests: [{ command: "pnpm test", status: "passed" }],
          criteria: (await passingCriteria(task.taskId)).map((criterion) => ({ ...criterion, status: "fail" })),
          observations: ["not approved"],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(checkJudgeReviewCurrentState(tmp, recordPath)).rejects.toThrow("valid APPROVED");
  });

  it("captures a catch-up delta linked to a strongly verified approved snapshot", async () => {
    const command = 'node -e "process.exit(0)"';
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    const parent = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const parentRecordPath = path.join(tmp, ".akrctx/local/judge/parent-review.json");
    await writeFile(
      parentRecordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: parent.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
    await writeFile(path.join(tmp, "new.ts"), "export const added = true;\n", "utf8");

    const catchUp = await captureJudgeCatchUpSnapshot(tmp, task.taskId, parentRecordPath, async () => true);
    const loaded = await loadJudgeSnapshot(tmp, catchUp.candidate);

    expect(catchUp.scope.base).toBe(parent.scope.base);
    expect(catchUp.scope.changedFiles).toEqual(["app.ts", "new.ts"]);
    expect(loaded.metadata.parent?.scopeDigest).toBe(parent.scope.scopeDigest);
    expect(loaded.metadata.parent?.recordDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("preserves explicit foreign task inclusion across catch-up snapshots", async () => {
    const command = 'node -e "process.exit(0)"';
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    const foreignPath = path.join(tmp, ".akrctx/tasks/TASK-999-other-work/task.md");
    await mkdir(path.dirname(foreignPath), { recursive: true });
    await writeFile(foreignPath, "foreign\n", "utf8");
    const parent = await captureJudgeSnapshot(tmp, task.taskId, "HEAD", ["TASK-999"]);
    const parentRecordPath = path.join(tmp, ".akrctx/local/judge/inclusive-parent-review.json");
    await writeFile(
      parentRecordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: parent.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");

    const catchUp = await captureJudgeCatchUpSnapshot(tmp, task.taskId, parentRecordPath, async () => true);

    expect(catchUp.scope.includedTaskIds).toEqual(["TASK-999"]);
    expect(catchUp.scope.base).toBe(parent.scope.base);
  });

  it("rejects catch-up when the parent passing claim fails independent re-execution", async () => {
    const command = 'node -e "process.exit(1)"';
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    const parent = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const parentRecordPath = path.join(tmp, ".akrctx/local/judge/false-parent-review.json");
    await writeFile(
      parentRecordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: parent.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(captureJudgeCatchUpSnapshot(tmp, task.taskId, parentRecordPath, async () => true)).rejects.toThrow(
      "Independent re-run",
    );
  });

  it("invalidates a catch-up snapshot when an ancestor snapshot is removed", async () => {
    const command = 'node -e "process.exit(0)"';
    const { task } = await createReviewFixture({ declares: [command], claims: [] });
    const parent = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const parentRecordPath = path.join(tmp, ".akrctx/local/judge/ancestor-review.json");
    await writeFile(
      parentRecordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: parent.scope,
          verdict: "APPROVED",
          tests: [{ command, status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
    const child = await captureJudgeCatchUpSnapshot(tmp, task.taskId, parentRecordPath, async () => true);
    await rm(parent.worktreePath, { recursive: true, force: true });

    await expect(loadJudgeSnapshot(tmp, child.candidate)).rejects.toThrow("parent snapshot");
  });

  it("prunes old snapshots explicitly and is dry-run by default", async () => {
    const { task } = await createReviewFixture();
    const first = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
    const second = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");

    const preview = await pruneJudgeSnapshots(tmp, { keep: 1 });
    expect(preview.dryRun).toBe(true);
    expect(preview.removed).toHaveLength(1);
    expect(await pathExists(path.dirname(first.metadataPath))).toBe(true);
    expect(await pathExists(path.dirname(second.metadataPath))).toBe(true);

    const applied = await pruneJudgeSnapshots(tmp, { keep: 1, dryRun: false });
    expect(applied.removed).toHaveLength(1);
    expect(applied.kept).toHaveLength(1);
    expect(
      Number(await pathExists(path.dirname(first.metadataPath))) +
        Number(await pathExists(path.dirname(second.metadataPath))),
    ).toBe(1);
  });

  it("rejects catch-up from non-approved or boundary-invalid parent records", async () => {
    const { task } = await createReviewFixture();
    const parent = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const parentRecordPath = path.join(tmp, ".akrctx/local/judge/parent-review.json");
    const record = {
      schemaVersion: JUDGE_SCHEMA_VERSION,
      taskId: task.taskId,
      scope: parent.scope,
      verdict: "NEEDS_CHANGES",
      tests: [{ command: "pnpm test", status: "passed" }],
      criteria: (await passingCriteria(task.taskId)).map((criterion) => ({ ...criterion, status: "fail" })),
      observations: ["still needs work"],
      reviewedAt: new Date().toISOString(),
    };
    await writeFile(parentRecordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await expect(captureJudgeCatchUpSnapshot(tmp, task.taskId, parentRecordPath)).rejects.toThrow("APPROVED");

    await writeFile(
      parentRecordPath,
      `${JSON.stringify(
        {
          ...record,
          verdict: "APPROVED",
          criteria: await passingCriteria(task.taskId),
          observations: [],
          scope: { ...parent.scope, changeDigest: "sha256:invalid" },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await expect(captureJudgeCatchUpSnapshot(tmp, task.taskId, parentRecordPath, async () => true)).rejects.toThrow(
      "verified current",
    );
  });

  it("CLI judge snapshot keeps human output short and exposes full JSON on demand", async () => {
    const { task } = await createReviewFixture();
    const previousCwd = process.cwd();
    const originalLog = console.log;
    const capture = async (args: string[]) => {
      const writes: string[] = [];
      console.log = (message?: unknown) => writes.push(String(message));
      try {
        process.chdir(tmp);
        await main(["node", "akrctx", ...args]);
      } finally {
        process.chdir(previousCwd);
        console.log = originalLog;
      }
      return writes.join("\n");
    };

    const human = await capture(["judge", "snapshot", task.taskId]);
    const json = JSON.parse(await capture(["judge", "snapshot", task.taskId, "--json"]));

    expect(human).toContain("You can keep working");
    expect(human).toContain("SNAPSHOT:");
    expect(human).toContain("<review.json>");
    expect(human).not.toContain("scopeDigest");
    expect(json.candidate).toMatch(/^SNAPSHOT:[0-9a-f]{20}$/);
    expect(json.scope.scopeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(json.emptyBoundaryAuthorized).toBe(false);
    expect(json.worktreePath).toContain(".akrctx/local/judge/snapshots/");

    const recordPath = path.join(tmp, ".akrctx/local/judge/cli-review.json");
    await writeFile(
      recordPath,
      `${JSON.stringify(
        {
          schemaVersion: JUDGE_SCHEMA_VERSION,
          taskId: task.taskId,
          scope: json.scope,
          verdict: "APPROVED",
          tests: [{ command: "pnpm test", status: "passed" }],
          criteria: await passingCriteria(task.taskId),
          observations: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const currentHuman = await capture(["judge", "current", recordPath]);
    expect(currentHuman).toContain("CURRENT");
    expect(currentHuman).toContain("reviewBoundary");
    expect(currentHuman).toContain("executionMetadata");
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
    const currentJson = JSON.parse(await capture(["judge", "current", recordPath, "--json"]));
    expect(currentJson.status).toBe("NEWER_CHANGES");
    expect(currentJson.changedFiles).toContain("app.ts");
    expect(currentJson.reviewBoundary).toBe("NEWER_CHANGES");
    expect(currentJson.executionMetadata).toBe("ABSENT");

    await capture(["judge", "snapshot", task.taskId]);
    const prunePreview = JSON.parse(await capture(["judge", "prune", "--keep", "1", "--json"]));
    expect(prunePreview.dryRun).toBe(true);
    expect(prunePreview.removed).toHaveLength(1);
    const pruneApplied = JSON.parse(await capture(["judge", "prune", "--keep", "1", "--force", "--json"]));
    expect(pruneApplied.dryRun).toBe(false);
    expect(pruneApplied.removed).toHaveLength(1);
  });

  it("CLI judge snapshot makes --allow-empty visible in human and JSON output", async () => {
    const { task } = await createReviewFixture();
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "implementation"], { cwd: tmp });
    const previousCwd = process.cwd();
    const originalLog = console.log;
    const capture = async (args: string[]) => {
      const writes: string[] = [];
      console.log = (message?: unknown) => writes.push(String(message));
      try {
        process.chdir(tmp);
        await main(["node", "akrctx", ...args]);
      } finally {
        process.chdir(previousCwd);
        console.log = originalLog;
      }
      return writes.join("\n");
    };

    const human = await capture(["judge", "snapshot", task.taskId, "--allow-empty"]);
    const json = JSON.parse(await capture(["judge", "snapshot", task.taskId, "--allow-empty", "--json"]));
    expect(human).toContain("authorized by --allow-empty");
    expect(human).toContain("SNAPSHOT:");
    expect(json.emptyBoundaryAuthorized).toBe(true);
    expect(json.scope.emptyBoundaryAuthorized).toBe(true);
  });

  it("enable generates agent files for installed targets and sets enabled in config", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    expect(result.installedTargets).toContain("codex");
    expect(result.skippedTargets).not.toContain("codex");
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-judge.toml"))).toBe(true);
    const config = await readConfig(tmp);
    expect(config?.judge?.enabled).toBe(true);
    expect(config?.judge?.trigger).toBe("post-implementation");
  });

  it("enable refuses a missing deterministic review contract", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".akrctx/judge/schemas/review.schema.json"));

    await expect(runJudgeEnable({ cwd: tmp, nonInteractive: true })).rejects.toThrow("akrctx upgrade");
  });

  it("enable skips pi and does not error", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });

    const result = await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    expect(result.skippedTargets).toContain("pi");
    expect(result.installedTargets).toContain("codex");
    expect(result.installedTargets).toContain("claude");
    expect(result.installedTargets).toContain("copilot");
  });

  it("generated judge files do not contain a model field", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    const claudeFile = await readFile(path.join(tmp, ".claude/agents/akrctx-judge.md"), "utf8");
    const copilotFile = await readFile(path.join(tmp, ".github/agents/akrctx-judge.agent.md"), "utf8");
    const codexFile = await readFile(path.join(tmp, ".codex/agents/akrctx-judge.toml"), "utf8");

    expect(claudeFile).not.toMatch(/^model:/m);
    expect(copilotFile).not.toMatch(/^model:/m);
    expect(codexFile).not.toMatch(/^model\s*=/m);
  });

  it("CLI judge enable --dry-run reports 'would enable' instead of claiming success", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const previousCwd = process.cwd();
    const writes: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      writes.push(String(message));
    };

    try {
      process.chdir(tmp);
      await main(["node", "akrctx", "judge", "enable", "--dry-run"]);
    } finally {
      process.chdir(previousCwd);
      console.log = originalLog;
    }

    expect(writes.join("\n")).toContain("would enable (dry-run)");
    expect(writes.join("\n")).not.toContain("Judge: enabled");
    const config = await readConfig(tmp);
    expect(config?.judge?.enabled).toBe(false);
  });

  it("disable sets enabled to false without removing files", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    await runJudgeDisable({ cwd: tmp, nonInteractive: true });

    const config = await readConfig(tmp);
    expect(config?.judge?.enabled).toBe(false);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-judge.toml"))).toBe(true);
  });

  it("status reflects enabled state and lists present files", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    const status = await runJudgeStatus({ cwd: tmp, nonInteractive: true });

    expect(status.enabled).toBe(true);
    expect(status.presentFiles).toContain(".claude/agents/akrctx-judge.md");
    expect(status.missingFiles).toHaveLength(0);
  });

  it("init does not install judge files by default", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-judge.toml"))).toBe(false);
    const config = await readConfig(tmp);
    expect(config?.judge?.enabled).toBe(false);
  });

  it("doctor detects judge.enabled=true without agent files and suggests akrctx judge enable", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.judge = { enabled: true, trigger: "post-implementation" };
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.suggestions.some((s) => s.text.includes("akrctx judge enable"))).toBe(true);
  });
});

// ── doctor --fix ─────────────────────────────────────────────────────────────

describe("doctor --fix", () => {
  it("recreates missing harness files", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"), { force: true });

    const result = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    expect(result.fixed?.some((f) => f.includes("akrctx-doctor/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(true);
  });

  it.each([
    // The config is written through JSON.stringify, which omits undefined values, so the
    // first case really does produce a file with no `targets` key at all.
    ["absent", (config: Record<string, unknown>) => Object.assign(config, { targets: undefined })],
    ["empty", (config: Record<string, unknown>) => Object.assign(config, { targets: [] })],
    ["unrecognizable", (config: Record<string, unknown>) => Object.assign(config, { targets: ["not-an-agent"] })],
  ])("leaves a config whose targets list is %s untouched and keeps the gap", async (_label, damage) => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    damage(config);
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    // Repair must not answer "which agent is this repository for?" by guessing. Writing
    // ["codex"] into a Claude install both retargets the project and clears the gap that
    // would have told the human to fix it, which is worse than leaving it broken.
    const repaired = JSON.parse(await readFile(configPath, "utf8"));
    expect(repaired.targets ?? []).not.toContain("codex");
    expect(result.missing).toContain(".akrctx/config.json — targets must list at least one supported target");
    expect(result.readiness).toBeLessThan(100);
  });

  it("repairs a partly invalid targets list from the entries it can trust", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.targets = ["claude", "not-an-agent"];
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    expect(JSON.parse(await readFile(configPath, "utf8")).targets).toEqual(["claude"]);
  });

  it("repairs config gaps without overwriting user values", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.workflowRules = undefined;
    config.defaults.allowedWorkflows = undefined;
    config.defaults.workflow = "TDD";
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    expect(result.fixed).toContain(".akrctx/config.json");
    const fixed = JSON.parse(await readFile(configPath, "utf8"));
    expect(fixed.defaults.workflow).toBe("TDD");
    expect(fixed.defaults.allowedWorkflows).toBeDefined();
    expect(fixed.workflowRules).toBeDefined();
  });

  it("repairs policy gaps by merging missing keys", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const policyPath = path.join(tmp, ".akrctx/policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.writePolicy = undefined;
    policy.protectedFileMerge = undefined;
    policy.blockedReadPatterns = [".env"];
    await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    expect(result.fixed).toContain(".akrctx/policy.json");
    const fixed = JSON.parse(await readFile(policyPath, "utf8"));
    expect(fixed.writePolicy).toBeDefined();
    expect(fixed.protectedFileMerge).toEqual({
      agentMayEdit: "after-explicit-human-approval",
      approvalScope: "current-conversation",
      requireDiffPreview: true,
    });
    expect(fixed.blockedReadPatterns).toContain(".env");
    expect(fixed.blockedReadPatterns).toContain("*.pem");
  });

  it("detects and repairs an unsafe local comprehension ignore file", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const ignorePath = path.join(tmp, ".akrctx/local/.gitignore");
    await writeFile(ignorePath, "# no ignore rules\n", "utf8");

    const diagnosis = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(diagnosis.missing.some((gap) => gap.includes("must ignore local records"))).toBe(true);

    const fixed = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });
    expect(fixed.fixed).toContain(".akrctx/local/.gitignore");
    expect(isLocalIgnoreContentSafe(await readFile(ignorePath, "utf8"))).toBe(true);
  });

  it("repairs invalid comprehension gate configuration", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.comprehensionGate = { enabled: true, trigger: "always", evaluationMode: "same-session" };
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const diagnosis = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(diagnosis.missing.some((gap) => gap.includes("comprehensionGate.trigger"))).toBe(false);
    expect(
      diagnosis.suggestions.some(
        (suggestion) => suggestion.severity === "warning" && suggestion.text.includes('trigger is "always"'),
      ),
    ).toBe(true);

    await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });
    const repaired = JSON.parse(await readFile(configPath, "utf8"));
    expect(repaired.comprehensionGate).toEqual({
      enabled: true,
      trigger: "always",
      evaluationMode: "prefer-independent",
    });
  });

  it("repairs missing files across all installed targets, not just the first", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await rm(path.join(tmp, ".claude/skills/akrctx-doctor/SKILL.md"), { force: true });
    await rm(path.join(tmp, ".pi/skills/akrctx-doctor/SKILL.md"), { force: true });

    const result = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    expect(result.fixed?.some((f) => f.includes(".claude/skills/akrctx-doctor/SKILL.md"))).toBe(true);
    expect(result.fixed?.some((f) => f.includes(".pi/skills/akrctx-doctor/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".claude/skills/akrctx-doctor/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".pi/skills/akrctx-doctor/SKILL.md"))).toBe(true);
  });

  it("reports nothing fixed for a healthy setup", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const result = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    expect(result.fixed).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(await pathExists(path.join(tmp, "AGENTS.akrctx.suggested.md"))).toBe(false);
  });

  it("repairs a missing skill without creating a protected-file merge suggestion", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"), { force: true });

    const result = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    expect(result.fixed).toContain(".agents/skills/akrctx-doctor/SKILL.md");
    expect(result.conflicts).toEqual([]);
    expect(await pathExists(path.join(tmp, "AGENTS.akrctx.suggested.md"))).toBe(false);
  });

  it("never treats doctor --fix as approval to modify a protected instruction", async () => {
    await writeFile(path.join(tmp, "AGENTS.md"), "# Project-owned instructions\n", "utf8");
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const before = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    const wikiPath = path.join(tmp, ".akrctx/wiki/architecture.md");
    await writeFile(wikiPath, "# Project-owned architecture\n", "utf8");

    const result = await runDoctor({ cwd: tmp, fix: true, force: true, nonInteractive: true });

    expect(await readFile(path.join(tmp, "AGENTS.md"), "utf8")).toBe(before);
    expect(await readFile(wikiPath, "utf8")).toBe("# Project-owned architecture\n");
    expect(await pathExists(path.join(tmp, "AGENTS.akrctx.suggested.md"))).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.includes("AGENTS.akrctx.suggested.md"))).toBe(true);
  });

  it("dry-run fix does not write files but reports what would be fixed", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"), { force: true });

    const result = await runDoctor({ cwd: tmp, fix: true, dryRun: true, nonInteractive: true });

    expect(result.fixed?.some((f) => f.includes("akrctx-doctor/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(false);
  });
});

// ── clarification gate ────────────────────────────────────────────────────────

describe("clarification gate", () => {
  async function capsuleWith(sections: string): Promise<string> {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix invoice regression", { cwd: tmp, nonInteractive: true });
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    // Replace from `## Clarifications` to end of file: both sections are the tail of the
    // generated capsule, so a fixture supplies them together or not at all.
    const replaced = original.replace(/\n## Clarifications\n[\s\S]*$/, `\n${sections}`);
    expect(replaced).not.toBe(original);
    await writeFile(taskFile, replaced, "utf8");
    return task.taskId;
  }

  it("generates both sections empty, with no date and no session heading", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix invoice regression", { cwd: tmp, nonInteractive: true });

    const taskMd = await readFile(path.join(tmp, task.taskDir, "task.md"), "utf8");

    expect(taskMd).toContain("## Clarifications");
    expect(taskMd).toContain("## Open Questions");
    // A session heading is stamped when a question is actually answered. Emitting one at
    // creation would date a session that never happened and make the file non-deterministic.
    // The section's instructions name the `### Session YYYY-MM-DD` format, so this asserts
    // no heading was written, not that the format is never mentioned.
    expect(taskMd).not.toMatch(/^### Session/m);
    expect(taskMd).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("produces byte-identical task.md across runs (no clock dependency)", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const first = await runTask("Fix invoice regression", { cwd: tmp, nonInteractive: true });
    const firstMd = await readFile(path.join(tmp, first.taskDir, "task.md"), "utf8");
    await rm(path.join(tmp, first.taskDir), { recursive: true, force: true });
    const second = await runTask("Fix invoice regression", { cwd: tmp, nonInteractive: true });

    const secondMd = await readFile(path.join(tmp, second.taskDir, "task.md"), "utf8");

    expect(secondMd).toBe(firstMd);
  });

  it("ships both sections in the shipped _template", async () => {
    const template = taskTemplateFiles["tasks/_template/task.md"];

    expect(template).toContain("## Clarifications");
    expect(template).toContain("## Open Questions");
  });

  it("does not add a capsule file: the capsule is still exactly five files", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix invoice regression", { cwd: tmp, nonInteractive: true });

    const entries = await readdir(path.join(tmp, task.taskDir));

    expect(entries.filter((entry) => entry.endsWith(".md")).sort()).toEqual([...capsuleFiles].sort());
  });

  it("reads the bullets of each section", async () => {
    const taskId = await capsuleWith(
      [
        "## Clarifications",
        "",
        "### Session 2026-08-05",
        "",
        "- Q: Cents or minor units? / A: Minor units.",
        "",
        "## Open Questions",
        "",
        "- Whether legacy invoices are in scope.",
        "",
      ].join("\n"),
    );

    const state = await readClarificationState(tmp, taskId);

    expect(state.clarificationsSectionPresent).toBe(true);
    expect(state.clarifications).toEqual(["Q: Cents or minor units? / A: Minor units."]);
    expect(state.openQuestions).toEqual(["Whether legacy invoices are in scope."]);
  });

  it("joins a bullet wrapped across lines into one entry", async () => {
    const taskId = await capsuleWith(
      [
        "## Clarifications",
        "",
        "- None recorded yet.",
        "",
        "## Open Questions",
        "",
        "- Whether Copilot really emits snake_case is taken from its published",
        "  reference, not from execution.",
        "- A second question.",
        "",
      ].join("\n"),
    );

    const state = await readClarificationState(tmp, taskId);

    expect(state.openQuestions).toEqual([
      "Whether Copilot really emits snake_case is taken from its published reference, not from execution.",
      "A second question.",
    ]);
  });

  it("treats the generated placeholder as empty", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix invoice regression", { cwd: tmp, nonInteractive: true });

    const state = await readClarificationState(tmp, task.taskId);

    expect(state.clarificationsSectionPresent).toBe(true);
    expect(state.clarifications).toEqual([]);
    expect(state.openQuestions).toEqual([]);
  });

  it.each([
    "None.",
    "None!",
    "Ninguna.",
    "N/A",
    "none",
    "NONE",
    "Ninguno",
    "None recorded yet.",
    "None remaining.",
    "None left.",
    "None yet.",
    "None so far.",
    "None  so   far.",
    "None open.",
    "None pending.",
  ])("treats a %s bullet as empty in both sections", async (variant) => {
    const taskId = await capsuleWith(
      ["## Clarifications", "", `- ${variant}`, "", "## Open Questions", "", `- ${variant}`, ""].join("\n"),
    );

    const state = await readClarificationState(tmp, taskId);

    expect(state.clarifications).toEqual([]);
    expect(state.openQuestions).toEqual([]);
  });

  it("keeps a bullet that starts with None but continues with real content", async () => {
    const variant = "None of the callers validate X";
    const taskId = await capsuleWith(
      ["## Clarifications", "", `- ${variant}`, "", "## Open Questions", "", `- ${variant}`, ""].join("\n"),
    );

    const state = await readClarificationState(tmp, taskId);

    expect(state.clarifications).toEqual([variant]);
    expect(state.openQuestions).toEqual([variant]);
  });

  it("reports a capsule written before this section existed without erroring", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Fix invoice regression", { cwd: tmp, nonInteractive: true });
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    // A TASK-001…005-shaped capsule: `## Open Questions` exists, `## Clarifications` does not.
    await writeFile(taskFile, original.replace(/\n## Clarifications\n[\s\S]*?(?=\n## Open Questions\n)/, "\n"), "utf8");

    const state = await readClarificationState(tmp, task.taskId);

    expect(state.clarificationsSectionPresent).toBe(false);
    expect(state.clarifications).toEqual([]);
    expect(state.openQuestions).toEqual([]);
  });

  it("returns an absent state for a task id that has no capsule", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const state = await readClarificationState(tmp, "TASK-999");

    expect(state).toEqual({ clarificationsSectionPresent: false, clarifications: [], openQuestions: [] });
  });

  it("ignores a question written as a bare paragraph, which is why the skill demands a bullet", async () => {
    const taskId = await capsuleWith(
      [
        "## Clarifications",
        "",
        "- None recorded yet.",
        "",
        "## Open Questions",
        "",
        "Whether legacy invoices are in scope is still undecided.",
        "",
      ].join("\n"),
    );

    const state = await readClarificationState(tmp, taskId);

    // The parser cannot accept paragraphs: both sections carry explanatory prose by design,
    // so prose-as-content would make every generated capsule look full of questions. The
    // instruction therefore has to require the bullet, and this pins the consequence of the
    // two drifting apart — a question nobody sees.
    expect(state.openQuestions).toEqual([]);
  });

  it("emits the same akrctx-task skill text to all four targets", () => {
    const bodyOf = (files: Record<string, string>, prefix: string) => files[`${prefix}/akrctx-task/SKILL.md`];
    const bodies = [
      bodyOf(claudeSkills, ".claude/skills"),
      bodyOf(codexSkills, ".agents/skills"),
      bodyOf(copilotSkills, ".github/skills"),
      bodyOf(piSkills, ".pi/skills"),
    ];

    expect(bodies.every((body) => typeof body === "string" && body.length > 0)).toBe(true);
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain("Clarify before implementing");
    // The clarification contract is portable: no target's copy may name a host-specific
    // question UI, or the artifact would stop being identical across hosts.
    for (const body of bodies) expect(body).not.toContain("AskUserQuestion");
  });

  it("names the native question UI in the claude target reference only", () => {
    const mentioning = Object.entries(targetReferenceTemplates)
      .filter(([, text]) => text.includes("AskUserQuestion"))
      .map(([target]) => target);

    expect(mentioning).toEqual(["claude"]);
  });
});

// ── per-criterion judge results ───────────────────────────────────────────────

describe("acceptance criterion identifiers", () => {
  async function capsule(criteria: string): Promise<{ taskId: string; taskDir: string }> {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Report per-criterion results", { cwd: tmp, nonInteractive: true });
    await writeFile(path.join(tmp, task.taskDir, "acceptance-criteria.md"), criteria, "utf8");
    return task;
  }

  it("reads identifiers in declared order and joins wrapped continuation lines", async () => {
    const task = await capsule(
      "# Acceptance Criteria\n\n- AC-1: The parser reads an identifier.\n- AC-2: The parser joins\n  a wrapped line.\n",
    );

    const declaration = await readAcceptanceCriteria(tmp, task.taskId);

    expect(declaration.filePresent).toBe(true);
    expect(declaration.ids).toEqual(["AC-1", "AC-2"]);
    expect(declaration.problems).toEqual([]);
    expect(declaration.criteria[1].text).toBe("AC-2: The parser joins a wrapped line.");
  });

  it("names the offending line when a criterion carries no identifier", async () => {
    const task = await capsule("# Acceptance Criteria\n\n- AC-1: Identified.\n- Not identified at all.\n");

    const declaration = await readAcceptanceCriteria(tmp, task.taskId);

    expect(declaration.ids).toEqual(["AC-1"]);
    expect(declaration.problems).toHaveLength(1);
    expect(declaration.problems[0]).toContain("line 4");
    expect(declaration.problems[0]).toContain("Not identified at all.");
  });

  it("names the offending line when an identifier repeats", async () => {
    const task = await capsule("# Acceptance Criteria\n\n- AC-1: First.\n- AC-1: Second.\n");

    const declaration = await readAcceptanceCriteria(tmp, task.taskId);

    expect(declaration.problems).toHaveLength(1);
    expect(declaration.problems[0]).toContain("line 4");
    expect(declaration.problems[0]).toContain("AC-1");
  });

  it("creates capsules whose criteria already carry identifiers", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Ship identified criteria", { cwd: tmp, nonInteractive: true });

    const declaration = await readAcceptanceCriteria(tmp, task.taskId);

    expect(declaration.problems).toEqual([]);
    expect(declaration.ids.length).toBeGreaterThan(0);
    const template = await readFile(path.join(tmp, ".akrctx/tasks/_template/acceptance-criteria.md"), "utf8");
    for (const line of template.split("\n").filter((line) => line.startsWith("- "))) {
      expect(line).toMatch(/^- AC-[1-9][0-9]*: /);
    }
  });
});

describe("task migrate-criteria", () => {
  async function legacyCapsule(criteria: string): Promise<{ taskId: string; taskDir: string }> {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Migrate my criteria", { cwd: tmp, nonInteractive: true });
    await writeFile(path.join(tmp, task.taskDir, "acceptance-criteria.md"), criteria, "utf8");
    return task;
  }

  it("adds identifiers to every top-level bullet and leaves continuation lines alone", async () => {
    const task = await legacyCapsule(
      "# Acceptance Criteria\n\n- First criterion.\n- Second criterion\n  continues here.\n\nClosing prose.\n",
    );

    const results = await migrateAcceptanceCriteriaIdentifiers(tmp, { taskId: task.taskId });

    expect(results).toEqual([
      { taskId: task.taskId, file: `${task.taskDir}/acceptance-criteria.md`, changed: true, criteria: 2 },
    ]);
    expect(await readFile(path.join(tmp, task.taskDir, "acceptance-criteria.md"), "utf8")).toBe(
      "# Acceptance Criteria\n\n- AC-1: First criterion.\n- AC-2: Second criterion\n  continues here.\n\nClosing prose.\n",
    );
  });

  it("is idempotent and reports no change for an already migrated capsule", async () => {
    const task = await legacyCapsule("# Acceptance Criteria\n\n- One.\n- Two.\n");

    await migrateAcceptanceCriteriaIdentifiers(tmp, { taskId: task.taskId });
    const second = await migrateAcceptanceCriteriaIdentifiers(tmp, { taskId: task.taskId });

    expect(second[0].changed).toBe(false);
    expect(await readFile(path.join(tmp, task.taskDir, "acceptance-criteria.md"), "utf8")).toBe(
      "# Acceptance Criteria\n\n- AC-1: One.\n- AC-2: Two.\n",
    );
  });

  it("rejects duplicate identifiers instead of silently repointing an existing review", async () => {
    const task = await legacyCapsule("# Acceptance Criteria\n\n- AC-1: One.\n- AC-1: Two.\n- Three.\n");

    // Unconditional renumbering was a bug: it changed the identity of the second criterion.
    const results = await migrateAcceptanceCriteriaIdentifiers(tmp, { taskId: task.taskId });

    expect(results[0].changed).toBe(false);
    expect(results[0].problems?.[0]).toContain("line 4");
    expect(await readFile(path.join(tmp, task.taskDir, "acceptance-criteria.md"), "utf8")).toBe(
      "# Acceptance Criteria\n\n- AC-1: One.\n- AC-1: Two.\n- Three.\n",
    );
  });

  it("writes nothing with --dry-run and migrates every capsule when no task is named", async () => {
    const task = await legacyCapsule("# Acceptance Criteria\n\n- Only one.\n");
    const original = await readFile(path.join(tmp, task.taskDir, "acceptance-criteria.md"), "utf8");

    const planned = await migrateAcceptanceCriteriaIdentifiers(tmp, { dryRun: true });

    expect(planned).toHaveLength(1);
    expect(planned[0].changed).toBe(true);
    expect(await readFile(path.join(tmp, task.taskDir, "acceptance-criteria.md"), "utf8")).toBe(original);
  });
});

describe("TASK-081 checklist claim classes", () => {
  const shipped = () => taskTemplateFiles["tasks/_template/review-checklist.md"];

  async function generated(): Promise<string> {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Classify checklist claims", { cwd: tmp, nonInteractive: true });
    return readFile(path.join(tmp, task.taskDir, "review-checklist.md"), "utf8");
  }

  function sectionOf(markdown: string, heading: string): string {
    const parts = markdown.split(/^## /m).slice(1);
    return parts.find((part) => part.startsWith(`${heading}\n`)) ?? "";
  }

  it("separates Evidence References from Process Attestations in both producers", async () => {
    for (const checklist of [shipped(), await generated()]) {
      expect(checklist).toContain("\n## Evidence References\n");
      expect(checklist).toContain("\n## Process Attestations\n");
      expect(checklist.indexOf("## Evidence References")).toBeLessThan(checklist.indexOf("## Process Attestations"));
    }
  });

  it("ships the same checklist from the template and from akrctx task", async () => {
    expect(await generated()).toBe(shipped());
  });

  it("keeps evidence references free of checkboxes", () => {
    const evidence = sectionOf(shipped(), "Evidence References");

    expect(evidence).toContain("AC-");
    expect(evidence).toContain("task.md");
    expect(evidence).not.toMatch(/\[[ x]\]/);
  });

  it("labels every attestation with an actor and states that a checked box is self-reported", () => {
    const attestations = sectionOf(shipped(), "Process Attestations");
    const boxes = attestations.split("\n").filter((line) => /^- \[[ x]\]/.test(line));

    expect(attestations).toContain("self-reported");
    expect(attestations).toMatch(/not independent(ly)? verif/i);
    expect(attestations).toMatch(/authenticated human approval/);
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) expect(box).toMatch(/^- \[ \] (Implementing agent|Human operator): /);
  });

  it("drops the duplicated mechanical-result checkboxes", () => {
    const checklist = shipped();

    expect(checklist).not.toMatch(/tests or validation commands/i);
    expect(checklist).not.toMatch(/regenerated from src\/templates/i);
    expect(checklist).not.toMatch(/build, .*tests/i);
  });

  it("keeps TASK-051: ready-for-review is the last box and no box waits for approval", () => {
    const boxes = shipped()
      .split("\n")
      .filter((line) => /^- \[ \]/.test(line));

    expect(boxes.at(-1)).toMatch(/ready for independent review/);
    expect(shipped()).toMatch(/before snapshot capture/);
    expect(shipped()).not.toMatch(/approved|APPROVED|review (is )?completed/);
  });

  it("leaves existing capsules untouched by init and upgrade planning", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Keep my checklist", { cwd: tmp, nonInteractive: true });
    const file = path.join(tmp, task.taskDir, "review-checklist.md");
    const legacy = "# Review Checklist\n\n- [x] Goal is clear.\n- [ ] Mixed, unclassified item.\n";
    await writeFile(file, legacy, "utf8");

    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    expect(await readFile(file, "utf8")).toBe(legacy);
  });
});

describe("TASK-082 workflow declaration reader", () => {
  const cli = path.resolve("dist/index.js");

  async function workflowCapsule(plan: string | undefined, task = "# Task\n"): Promise<string> {
    const taskDir = ".akrctx/tasks/TASK-082-fixture";
    await mkdir(path.join(tmp, taskDir), { recursive: true });
    await writeFile(path.join(tmp, taskDir, "task.md"), task);
    if (plan !== undefined) await writeFile(path.join(tmp, taskDir, "plan.md"), plan);
    return taskDir;
  }

  it.each([
    ["TDD", "TDD"],
    ["- research-first", "research-first"],
    ["* SDD+TDD.", "SDD+TDD"],
    ["+ EDD", "EDD"],
    ["  -   fast-patch.  ", "fast-patch"],
    ["TDD.", "TDD"],
    ["UI review", "UI review"],
    ["bespoke workflow.", "bespoke workflow"],
    ["- research-first, then TDD", "research-first, then TDD"],
    ["SDD+TDD. This is the declared string.", "SDD+TDD. This is the declared string"],
  ])("reads and normalizes the plan declaration %s", async (declaration, expected) => {
    await workflowCapsule(
      `# Plan\n\n## Workflow\n\n${declaration}\n\nReason: Keep the declared string.\n\n## Steps\n\n1. Work.\n`,
    );

    expect((await showTask(tmp, "TASK-082")).workflow).toBe(expected);
  });

  it("reads whitespace and CRLF without requiring a blank line after the heading", async () => {
    await workflowCapsule("# Plan\r\n\r\n## Workflow  \r\n\t-  UI review.  \r\n\r\n## Steps\r\nWork.\r\n");

    expect((await showTask(tmp, "TASK-082")).workflow).toBe("UI review");
  });

  it("prefers a non-empty plan declaration over a conflicting legacy value", async () => {
    await workflowCapsule("## Workflow\n\n- EDD.\n", "## Recommended Workflow\n\nTDD\n");

    expect((await showTask(tmp, "TASK-082")).workflow).toBe("EDD");
  });

  it.each([undefined, "# Plan\n", "## Workflow\n\n## Steps\n\nWork.\n", "## Workflow\n\n \t\n"])(
    "uses the legacy heading when the plan has no declaration (%s)",
    async (plan) => {
      await workflowCapsule(plan, "# Task\n\n## Recommended Workflow\n\n- TDD.\n\n## Scope\n\nWork.\n");

      expect((await showTask(tmp, "TASK-082")).workflow).toBe("TDD");
    },
  );

  it("keeps workflow absent rather than reading a neighboring section or recommending one", async () => {
    await workflowCapsule(
      "## Workflow\n\n## Steps\n\nSDD\n",
      "# Fix an API bug\n\n## Recommended Workflow\n\n## Scope\n\nTDD\n",
    );

    expect((await showTask(tmp, "TASK-082")).workflow).toBeUndefined();
  });

  it("does not mistake a different heading or a prose mention for the declaration", async () => {
    await workflowCapsule("# Plan\n\nThe heading ## Workflow mentions TDD.\n\n## Workflow Reason\n\nEDD\n");

    expect((await showTask(tmp, "TASK-082")).workflow).toBeUndefined();
  });

  it("keeps capsule bytes, mtimes and the showTask result shape unchanged", async () => {
    const plan = "## Workflow\n\n- UI review.\n\nReason: Check visuals.\n";
    const task = "## Recommended Workflow\n\nTDD\n";
    const taskDir = await workflowCapsule(plan, task);
    const names = ["task.md", "plan.md"];
    const before = await Promise.all(names.map((name) => stat(path.join(tmp, taskDir, name))));

    const result = await showTask(tmp, "TASK-082");

    expect(Object.keys(result).sort()).toEqual(["files", "taskDir", "taskId", "workflow"]);
    expect(result.files).toEqual({ "task.md": task, "plan.md": plan });
    for (const [index, name] of names.entries()) {
      expect(await readFile(path.join(tmp, taskDir, name), "utf8")).toBe(result.files[name]);
      expect((await stat(path.join(tmp, taskDir, name))).mtimeMs).toBe(before[index].mtimeMs);
    }
  });

  it.each(["TDD.", "- fast-patch.", "- UI review", "custom workflow."])(
    "reports the declaration %s through task show --json without adding fields",
    async (declaration) => {
      await workflowCapsule(`## Workflow\n\n${declaration}\n`);
      const { stdout } = await execFileAsync("node", [cli, "task", "show", "TASK-082", "--json"], { cwd: tmp });
      const result = JSON.parse(stdout);

      expect(Object.keys(result).sort()).toEqual(["files", "taskDir", "taskId", "workflow"]);
      expect(result.workflow).toBe(declaration.replace(/^- /, "").replace(/\.$/, ""));
    },
  );

  it("omits workflow from JSON when neither declaration is present", async () => {
    await workflowCapsule("# Plan\n\n## Workflow\n\n## Steps\n\nWork.\n");
    const { stdout } = await execFileAsync("node", [cli, "task", "show", "TASK-082", "--json"], { cwd: tmp });

    expect(Object.keys(JSON.parse(stdout)).sort()).toEqual(["files", "taskDir", "taskId"]);
  });
});

describe("TASK-076 judge round accounting", () => {
  const cli = path.resolve("dist/index.js");
  const JUDGE_DIR = ".akrctx/local/judge";
  const digestOf = (seed: string) => `sha256:${createHash("sha256").update(seed).digest("hex")}`;

  interface FixtureRecord {
    taskId?: unknown;
    verdict?: unknown;
    reviewedAt?: unknown;
    digest?: string | null;
    candidate?: string;
    independent?: boolean;
    criteria?: Array<{ id: string; status: string; evidence: string }>;
    extra?: Record<string, unknown>;
  }

  function recordBody(input: FixtureRecord): Record<string, unknown> {
    const body: Record<string, unknown> = { schemaVersion: 5, tests: [] };
    body.taskId = "taskId" in input ? input.taskId : "TASK-001";
    if ("verdict" in input) body.verdict = input.verdict;
    else body.verdict = "APPROVED";
    if ("reviewedAt" in input) {
      if (input.reviewedAt !== undefined) body.reviewedAt = input.reviewedAt;
    } else {
      body.reviewedAt = "2026-08-01T10:00:00Z";
    }
    const scope: Record<string, unknown> = { candidate: input.candidate ?? "WORKTREE" };
    if (input.digest !== null) scope.scopeDigest = input.digest ?? digestOf("default");
    body.scope = scope;
    if (input.independent !== undefined) body.independent = input.independent;
    if (input.criteria) body.criteria = input.criteria;
    return { ...body, ...input.extra };
  }

  async function put(relative: string, input: FixtureRecord | string): Promise<string> {
    const target = path.join(tmp, JUDGE_DIR, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, typeof input === "string" ? input : `${JSON.stringify(recordBody(input), null, 2)}\n`);
    return `${JUDGE_DIR}/${relative}`;
  }

  beforeEach(async () => {
    await mkdir(path.join(tmp, ".akrctx"), { recursive: true });
    await writeFile(
      path.join(tmp, ".akrctx/policy.json"),
      JSON.stringify({ blockedReadPatterns: [".env", "*.pem", "secrets/", "private/"] }),
    );
  });

  async function treeState(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const info = await lstat(full);
        if (entry.isDirectory()) {
          out.push(`d ${path.relative(tmp, full)} ${info.mtimeMs}`);
          await walk(full);
        } else if (entry.isSymbolicLink()) {
          out.push(`l ${path.relative(tmp, full)} ${await readlink(full)}`);
        } else {
          out.push(`f ${path.relative(tmp, full)} ${info.mtimeMs} ${(await readFile(full)).toString("base64")}`);
        }
      }
    };
    await walk(tmp);
    return out.sort();
  }

  it("counts every historical name shape and lists project-relative source files", async () => {
    const files = [
      "TASK-001-review.json",
      "TASK-001-review-2.json",
      "TASK-001-review-final2-approved.json",
      "TASK-001-a328907c6fd343c8e431.json",
      "TASK-001-d7ed997c8f67bfdcb94c.review.json",
      "TASK-001-2026-07-22T191831Z.json",
      "TASK-001/review.json",
      "records/TASK-001-old.json",
      "TASK-001-no-extension",
    ];
    for (const [index, name] of files.entries()) {
      await put(name, {
        reviewedAt: `2026-08-01T10:${String(index).padStart(2, "0")}:00Z`,
        digest: digestOf(name),
      });
    }

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0].rounds).toHaveLength(files.length);
    expect(report.tasks[0].rounds.flatMap((round) => round.files).sort()).toEqual(
      files.map((name) => `${JUDGE_DIR}/${name}`).sort(),
    );
    expect(report.skipped).toEqual([]);
  });

  it("does not traverse snapshots/ and skips symbolic links without counting them", async () => {
    await put("TASK-001-real.json", { digest: digestOf("real") });
    await put("snapshots/abc/worktree/TASK-001-inside.json", { digest: digestOf("inside") });
    await symlink(path.join(tmp, JUDGE_DIR, "TASK-001-real.json"), path.join(tmp, JUDGE_DIR, "TASK-001-link.json"));

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds).toHaveLength(1);
    expect(report.tasks[0].rounds[0].files).toEqual([`${JUDGE_DIR}/TASK-001-real.json`]);
    expect(JSON.stringify(report)).not.toContain("inside");
    expect(report.skipped).toEqual([
      { file: `${JUDGE_DIR}/TASK-001-link.json`, reason: expect.stringContaining("symbolic link") },
    ]);
  });

  it("enters only TASK-<n>/ and records/ and reports other directories as one skipped entry", async () => {
    await put("TASK-001-real.json", { digest: digestOf("real") });
    await put("TASK-001/review.json", { reviewedAt: "2026-08-02T10:00:00Z", digest: digestOf("dir") });
    await put("records/TASK-001-old.json", { reviewedAt: "2026-08-03T10:00:00Z", digest: digestOf("rec") });
    await put("TASK-001/nested/deep.json", { reviewedAt: "2026-08-04T10:00:00Z", digest: digestOf("deep") });
    await put("TASK-083-workspace/.akrctx/local/judge/TASK-001-copy.json", { digest: digestOf("real") });
    await put("TASK-083-workspace/README.md", "# not a record\n");

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds).toHaveLength(3);
    expect(JSON.stringify(report.tasks)).not.toContain("workspace");
    expect(report.skipped.map((entry) => entry.file)).toEqual([
      `${JUDGE_DIR}/TASK-001/nested`,
      `${JUDGE_DIR}/TASK-083-workspace`,
    ]);
    for (const entry of report.skipped) expect(entry.reason).toMatch(/^unattributable: .*not traversed/);
  });

  it("honors blocked-read policy and fails closed when the policy is unreadable", async () => {
    await put("TASK-001-ok.json", { digest: digestOf("ok") });
    await put("private/TASK-001-hidden.json", { digest: digestOf("hidden") });
    await put("TASK-001-key.pem", { digest: digestOf("pem") });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds).toHaveLength(1);
    expect(report.skipped.map((entry) => entry.file).sort()).toEqual([
      `${JUDGE_DIR}/TASK-001-key.pem`,
      `${JUDGE_DIR}/private`,
    ]);
    for (const entry of report.skipped) expect(entry.reason).toContain("blocked");

    await rm(path.join(tmp, ".akrctx/policy.json"));
    await expect(collectJudgeRounds(tmp)).rejects.toThrow("blockedReadPatterns");
  });

  it("skips malformed and non-record files with a reason and labels unattributable ones", async () => {
    await put("TASK-001-ok.json", { digest: digestOf("ok") });
    await put("broken.json", "{ not json");
    await put("timings.jsonl", '{"phase":"snapshot"}\n{"phase":"verify"}\n');
    await put("array.json", "[1,2]");
    await put("no-task.json", { taskId: undefined, digest: digestOf("x") });
    await put("bad-verdict.json", { taskId: "TASK-002", verdict: "MAYBE", digest: digestOf("y") });
    await put("bad-task.json", { taskId: "TASK-x", digest: digestOf("z") });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks.map((task) => task.taskId)).toEqual(["TASK-001"]);
    const byFile = Object.fromEntries(report.skipped.map((entry) => [entry.file, entry.reason]));
    expect(Object.keys(byFile).sort()).toEqual(
      ["array.json", "bad-task.json", "bad-verdict.json", "broken.json", "no-task.json", "timings.jsonl"].map(
        (name) => `${JUDGE_DIR}/${name}`,
      ),
    );
    for (const name of ["array.json", "bad-task.json", "broken.json", "no-task.json", "timings.jsonl"]) {
      expect(byFile[`${JUDGE_DIR}/${name}`]).toMatch(/^unattributable: /);
    }
    expect(byFile[`${JUDGE_DIR}/bad-verdict.json`]).toContain("TASK-002");
    expect(byFile[`${JUDGE_DIR}/bad-verdict.json`]).not.toMatch(/^unattributable/);
  });

  it("accepts an older schema without full record verification", async () => {
    await put("TASK-001-v2.json", { extra: { schemaVersion: 2, unexpected: true } });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds).toHaveLength(1);
    expect(report.skipped).toEqual([]);
  });

  it("counts exact copies once and lists every source file sorted", async () => {
    const key = { reviewedAt: "2026-08-31T14:46:02Z", digest: digestOf("same") };
    await put("TASK-001-approved.json", key);
    await put("TASK-001-approved-raw.json", { ...key, extra: { tests: [{ command: "x", status: "passed" }] } });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds).toHaveLength(1);
    expect(report.tasks[0].rounds[0].files).toEqual([
      `${JUDGE_DIR}/TASK-001-approved-raw.json`,
      `${JUDGE_DIR}/TASK-001-approved.json`,
    ]);
    expect(report.tasks[0].rounds[0].ambiguous).toBe(false);
    expect(report.unknown.filter((entry) => entry.reason.includes("conflict"))).toEqual([]);
  });

  it("treats equivalent UTC offsets as one round and reports the UTC instant", async () => {
    const digest = digestOf("offset");
    await put("TASK-001-a.json", { reviewedAt: "2026-09-02T17:04:36+02:00", digest });
    await put("TASK-001-b.json", { reviewedAt: "2026-09-02T15:04:36.000Z", digest });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds).toHaveLength(1);
    expect(report.tasks[0].rounds[0].reviewedAt).toBe("2026-09-02T15:04:36.000Z");
  });

  it("does not merge records with the same digest at different instants", async () => {
    const digest = digestOf("d");
    await put("TASK-001-a.json", { reviewedAt: "2026-08-01T10:00:00Z", digest });
    await put("TASK-001-b.json", { reviewedAt: "2026-08-01T10:00:01Z", digest });

    expect((await collectJudgeRounds(tmp)).tasks[0].rounds).toHaveLength(2);
  });

  it.each([
    ["verdict", { verdict: "NEEDS_CHANGES" }, {}],
    ["independence", { independent: true }, {}],
    ["independence (false against absent)", { independent: false }, {}],
    [
      "criterion statuses",
      { criteria: [{ id: "AC-1", status: "fail", evidence: "x" }] },
      { criteria: [{ id: "AC-1", status: "pass", evidence: "x" }] },
    ],
  ])("marks one ambiguous round when copies disagree on %s", async (_label, left, right) => {
    const key = { reviewedAt: "2026-08-01T10:00:00Z", digest: digestOf("conflict") };
    await put("TASK-001-left.json", { ...key, ...left });
    await put("TASK-001-right.json", { ...key, ...right });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds).toHaveLength(1);
    expect(report.tasks[0].rounds[0].ambiguous).toBe(true);
    const files = [`${JUDGE_DIR}/TASK-001-left.json`, `${JUDGE_DIR}/TASK-001-right.json`];
    expect(report.unknown).toContainEqual({ taskId: "TASK-001", files, reason: expect.stringContaining("conflict") });
  });

  it("sets verdict to null and independence to null when copies conflict", async () => {
    const key = { reviewedAt: "2026-08-01T10:00:00Z", digest: digestOf("nulls") };
    await put("TASK-001-a.json", { ...key, verdict: "APPROVED", independent: true });
    await put("TASK-001-b.json", { ...key, verdict: "BLOCKED", independent: false });

    const round = (await collectJudgeRounds(tmp)).tasks[0].rounds[0];

    expect(round.verdict).toBeNull();
    expect(round.independent).toBeNull();
  });

  it("does not treat evidence wording differences as a conflict", async () => {
    const key = { reviewedAt: "2026-08-01T10:00:00Z", digest: digestOf("wording") };
    await put("TASK-001-a.json", { ...key, criteria: [{ id: "AC-1", status: "pass", evidence: "one" }] });
    await put("TASK-001-b.json", { ...key, criteria: [{ id: "AC-1", status: "pass", evidence: "another" }] });

    const round = (await collectJudgeRounds(tmp)).tasks[0].rounds[0];

    expect(round.ambiguous).toBe(false);
  });

  it("reports declared independence as true, false or null", async () => {
    await put("TASK-001-a.json", { reviewedAt: "2026-08-01T10:00:00Z", digest: digestOf("a"), independent: true });
    await put("TASK-001-b.json", { reviewedAt: "2026-08-02T10:00:00Z", digest: digestOf("b"), independent: false });
    await put("TASK-001-c.json", { reviewedAt: "2026-08-03T10:00:00Z", digest: digestOf("c") });

    const rounds = (await collectJudgeRounds(tmp)).tasks[0].rounds;

    expect(rounds.map((round) => round.independent)).toEqual([true, false, null]);
  });

  it.each([
    ["missing reviewedAt", { reviewedAt: undefined, digest: digestOf("k") }, "reviewedAt"],
    ["unparseable reviewedAt", { reviewedAt: "yesterday", digest: digestOf("k") }, "reviewedAt"],
    ["reviewedAt without an offset", { reviewedAt: "2026-08-01T10:00:00", digest: digestOf("k") }, "reviewedAt"],
    ["missing scopeDigest", { reviewedAt: "2026-08-01T10:00:00Z", digest: null }, "scopeDigest"],
    ["malformed scopeDigest", { reviewedAt: "2026-08-01T10:00:00Z", digest: "sha256:abc" }, "scopeDigest"],
  ])("puts a record with %s in unknown, uncounted, and makes the task unknown", async (_label, input, field) => {
    await put("TASK-001-good.json", { reviewedAt: "2026-08-01T09:00:00Z", digest: digestOf("good") });
    const bad = await put("TASK-001-bad.json", input as FixtureRecord);

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds).toHaveLength(1);
    expect(report.tasks[0].state).toBe("unknown");
    expect(report.unknown).toContainEqual({ taskId: "TASK-001", files: [bad], reason: expect.stringContaining(field) });
    expect(report.closed.taskCount + report.open.taskCount).toBe(0);
    expect(report.skipped).toEqual([]);
  });

  it("sorts rounds by UTC instant with scopeDigest as the display tie-breaker", async () => {
    const early = "2026-08-01T10:00:00Z";
    await put("TASK-001-late.json", { reviewedAt: "2026-08-02T10:00:00Z", digest: digestOf("late") });
    await put("TASK-001-z.json", { reviewedAt: early, digest: `sha256:${"b".repeat(64)}` });
    await put("TASK-001-a.json", { reviewedAt: early, digest: `sha256:${"a".repeat(64)}` });

    const rounds = (await collectJudgeRounds(tmp)).tasks[0].rounds;

    expect(rounds.map((round) => round.scopeDigest.slice(7, 8))).toEqual(["a", "b", digestOf("late").slice(7, 8)]);
  });

  it.each([
    ["APPROVED", "closed"],
    ["NEEDS_CHANGES", "open"],
    ["BLOCKED", "open"],
  ])("derives the task state from the latest round: %s is %s", async (verdict, state) => {
    await put("TASK-001-first.json", { reviewedAt: "2026-08-01T10:00:00Z", digest: digestOf("1"), verdict: "BLOCKED" });
    await put("TASK-001-last.json", { reviewedAt: "2026-08-02T10:00:00Z", digest: digestOf("2"), verdict });
    await put("TASK-001-zz.json", { reviewedAt: "2026-07-01T10:00:00Z", digest: digestOf("0"), verdict: "APPROVED" });

    expect((await collectJudgeRounds(tmp)).tasks[0].state).toBe(state);
  });

  it("makes the state unknown for conflicting verdicts at the latest instant", async () => {
    const at = "2026-08-02T10:00:00Z";
    await put("TASK-001-a.json", { reviewedAt: at, digest: digestOf("a"), verdict: "APPROVED" });
    await put("TASK-001-b.json", { reviewedAt: at, digest: digestOf("b"), verdict: "NEEDS_CHANGES" });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].state).toBe("unknown");
    expect(report.unknown.some((entry) => entry.reason.includes("state"))).toBe(true);
  });

  it("keeps a state when rounds at the latest instant agree", async () => {
    const at = "2026-08-02T10:00:00Z";
    await put("TASK-001-a.json", { reviewedAt: at, digest: digestOf("a"), verdict: "APPROVED" });
    await put("TASK-001-b.json", { reviewedAt: at, digest: digestOf("b"), verdict: "APPROVED" });

    expect((await collectJudgeRounds(tmp)).tasks[0].state).toBe("closed");
  });

  it("makes the state unknown when the latest round is ambiguous", async () => {
    await put("TASK-001-old.json", { reviewedAt: "2026-08-01T10:00:00Z", digest: digestOf("old") });
    const key = { reviewedAt: "2026-08-02T10:00:00Z", digest: digestOf("new") };
    await put("TASK-001-x.json", { ...key, verdict: "APPROVED" });
    await put("TASK-001-y.json", { ...key, verdict: "NEEDS_CHANGES" });

    expect((await collectJudgeRounds(tmp)).tasks[0].state).toBe("unknown");
  });

  it("keeps an ambiguous earlier round from changing the state", async () => {
    const key = { reviewedAt: "2026-08-01T10:00:00Z", digest: digestOf("early") };
    await put("TASK-001-x.json", { ...key, verdict: "APPROVED" });
    await put("TASK-001-y.json", { ...key, verdict: "NEEDS_CHANGES" });
    await put("TASK-001-final.json", { reviewedAt: "2026-08-02T10:00:00Z", digest: digestOf("final") });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].state).toBe("closed");
    expect(report.tasks[0].rounds[0].ambiguous).toBe(true);
  });

  it("aggregates closed and open separately, excluding unknown tasks, and nulls empty groups", async () => {
    const rounds = async (taskId: string, verdicts: string[]) => {
      for (const [index, verdict] of verdicts.entries()) {
        await put(`${taskId}-${index}.json`, {
          taskId,
          verdict,
          reviewedAt: `2026-08-0${index + 1}T10:00:00Z`,
          digest: digestOf(`${taskId}${index}`),
        });
      }
    };
    await rounds("TASK-001", ["NEEDS_CHANGES", "APPROVED"]);
    await rounds("TASK-002", ["APPROVED"]);
    await rounds("TASK-003", ["NEEDS_CHANGES", "NEEDS_CHANGES", "BLOCKED"]);
    await put("TASK-004-x.json", { taskId: "TASK-004", reviewedAt: undefined });

    const report = await collectJudgeRounds(tmp);

    expect(report.closed).toEqual({ taskCount: 2, roundCount: 3, mean: 1.5, max: 2 });
    expect(report.open).toEqual({ taskCount: 1, roundCount: 3, mean: 3, max: 3 });
    expect(report.tasks.map((task) => [task.taskId, task.state])).toEqual([
      ["TASK-001", "closed"],
      ["TASK-002", "closed"],
      ["TASK-003", "open"],
      ["TASK-004", "unknown"],
    ]);
  });

  it("reports empty groups with zero counts and null mean and max", async () => {
    await put("TASK-001-x.json", { verdict: "BLOCKED" });

    const report = await collectJudgeRounds(tmp);

    expect(report.closed).toEqual({ taskCount: 0, roundCount: 0, mean: null, max: null });
    expect(report.open).toEqual({ taskCount: 1, roundCount: 1, mean: 1, max: 1 });
  });

  it("reports an empty directory without inventing observations", async () => {
    const report = await collectJudgeRounds(tmp);

    expect(report).toEqual({
      tasks: [],
      closed: { taskCount: 0, roundCount: 0, mean: null, max: null },
      open: { taskCount: 0, roundCount: 0, mean: null, max: null },
      unknown: [],
      skipped: [],
    });
  });

  it("labels the category unknown without boundary metadata and still counts the round", async () => {
    await put("TASK-001-worktree.json", { candidate: "WORKTREE", digest: digestOf("w") });
    await put("TASK-001-snap.json", {
      reviewedAt: "2026-08-02T10:00:00Z",
      candidate: `SNAPSHOT:${"a".repeat(20)}`,
      digest: digestOf("s"),
    });

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks[0].rounds.map((round) => round.category)).toEqual(["unknown", "unknown"]);
    expect(report.unknown.filter((entry) => entry.reason.includes("category"))).toHaveLength(2);
    expect(report.tasks[0].state).toBe("closed");
  });

  it("never infers the category from the filename", async () => {
    await put("TASK-001-catchup-approved.json", { candidate: "WORKTREE", digest: digestOf("cu") });

    expect((await collectJudgeRounds(tmp)).tasks[0].rounds[0].category).toBe("unknown");
  });

  it("classifies ordinary and catch-up rounds from snapshot metadata", async () => {
    const command = 'node -e "process.exit(0)"';
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Round accounting fixture", { cwd: tmp, nonInteractive: true });
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    await writeFile(taskFile, original.replace("```\n```", `\`\`\`\n${command}\n\`\`\``), "utf8");
    await writeFile(path.join(tmp, "app.ts"), "export const value = 1;\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
    await writeFile(path.join(tmp, "app.ts"), "export const value = 2;\n", "utf8");

    const parent = await captureJudgeSnapshot(tmp, task.taskId, "HEAD");
    const declaration = await readAcceptanceCriteria(tmp, task.taskId);
    const parentRecord = path.join(tmp, JUDGE_DIR, "parent.json");
    await mkdir(path.dirname(parentRecord), { recursive: true });
    await writeFile(
      parentRecord,
      JSON.stringify({
        schemaVersion: JUDGE_SCHEMA_VERSION,
        taskId: task.taskId,
        scope: parent.scope,
        verdict: "APPROVED",
        tests: [{ command, status: "passed" }],
        criteria: declaration.ids.map((id) => ({ id, status: "pass", evidence: "Checked." })),
        observations: [],
        reviewedAt: "2026-08-01T10:00:00Z",
      }),
    );
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
    const child = await captureJudgeCatchUpSnapshot(tmp, task.taskId, parentRecord, async () => true);
    await writeFile(
      path.join(tmp, JUDGE_DIR, "child.json"),
      JSON.stringify({
        schemaVersion: JUDGE_SCHEMA_VERSION,
        taskId: task.taskId,
        scope: child.scope,
        verdict: "APPROVED",
        tests: [],
        criteria: [],
        observations: [],
        reviewedAt: "2026-08-02T10:00:00Z",
      }),
    );

    const report = await collectJudgeRounds(tmp, task.taskId);

    expect(report.tasks[0].rounds.map((round) => round.category)).toEqual(["ordinary", "catch-up"]);
    expect(report.unknown.filter((entry) => entry.reason.includes("category"))).toEqual([]);
    expect(report.closed.roundCount).toBe(2);
  });

  it("applies the task filter before aggregation and keeps unattributable skipped files", async () => {
    await put("TASK-001-a.json", { taskId: "TASK-001", digest: digestOf("1") });
    await put("TASK-002-a.json", { taskId: "TASK-002", digest: digestOf("2"), verdict: "BLOCKED" });
    await put("TASK-002-bad.json", { taskId: "TASK-002", verdict: "MAYBE" });
    await put("TASK-003-gap.json", { taskId: "TASK-003", reviewedAt: undefined });
    await put("garbage.json", "nope");

    const report = await collectJudgeRounds(tmp, "TASK-002");

    expect(report.tasks.map((task) => task.taskId)).toEqual(["TASK-002"]);
    expect(report.closed.taskCount).toBe(0);
    expect(report.open.taskCount).toBe(1);
    expect(report.unknown.every((entry) => entry.taskId === "TASK-002" || entry.taskId === null)).toBe(true);
    expect(report.skipped.map((entry) => entry.file).sort()).toEqual([
      `${JUDGE_DIR}/TASK-002-bad.json`,
      `${JUDGE_DIR}/garbage.json`,
    ]);
  });

  it("rejects a malformed task filter", async () => {
    await expect(collectJudgeRounds(tmp, "task-1")).rejects.toThrow("TASK-");
  });

  it("sorts tasks, unknown entries and skipped entries deterministically", async () => {
    await put("TASK-010-a.json", { taskId: "TASK-010", digest: digestOf("10") });
    await put("TASK-002-a.json", { taskId: "TASK-002", digest: digestOf("2") });
    await put("z.json", "bad");
    await put("a.json", "bad");

    const report = await collectJudgeRounds(tmp);

    expect(report.tasks.map((task) => task.taskId)).toEqual(["TASK-002", "TASK-010"]);
    expect(report.skipped.map((entry) => entry.file)).toEqual([`${JUDGE_DIR}/a.json`, `${JUDGE_DIR}/z.json`]);
  });

  it("is strictly read-only", async () => {
    await put("TASK-001-a.json", { digest: digestOf("a") });
    await put("TASK-001-b.json", { digest: digestOf("a") });
    await put("TASK-002-gap.json", { taskId: "TASK-002", reviewedAt: undefined });
    await put("junk.json", "nope");
    await put("snapshots/x/snapshot.json", "{}");
    const before = await treeState();

    await collectJudgeRounds(tmp);
    await collectJudgeRounds(tmp, "TASK-001");
    renderJudgeRounds(await collectJudgeRounds(tmp));

    expect(await treeState()).toEqual(before);
  });

  it("emits JSON with exactly the contract's fields through the CLI", async () => {
    await put("TASK-001-a.json", { digest: digestOf("a"), independent: true });
    await put("TASK-002-a.json", { taskId: "TASK-002", digest: digestOf("b"), verdict: "BLOCKED" });
    await put("junk.json", "nope");

    const { stdout } = await execFileAsync("node", [cli, "judge", "rounds", "--json"], { cwd: tmp });
    const report = JSON.parse(stdout);

    expect(Object.keys(report).sort()).toEqual(["closed", "open", "skipped", "tasks", "unknown"]);
    expect(Object.keys(report.closed).sort()).toEqual(["max", "mean", "roundCount", "taskCount"]);
    expect(Object.keys(report.tasks[0]).sort()).toEqual(["rounds", "state", "taskId"]);
    expect(Object.keys(report.tasks[0].rounds[0]).sort()).toEqual([
      "ambiguous",
      "category",
      "files",
      "independent",
      "reviewedAt",
      "scopeDigest",
      "verdict",
    ]);
    expect(report).toEqual(await collectJudgeRounds(tmp));

    const filtered = JSON.parse(
      (await execFileAsync("node", [cli, "judge", "rounds", "TASK-002", "--json"], { cwd: tmp })).stdout,
    );
    expect(filtered.tasks.map((task: { taskId: string }) => task.taskId)).toEqual(["TASK-002"]);
  });

  it("renders every field and entry in human output, including empty collections", async () => {
    await put("TASK-001-a.json", { digest: digestOf("a"), independent: true });
    await put("TASK-001-b.json", { digest: digestOf("a"), independent: true });

    const report = await collectJudgeRounds(tmp);
    const text = renderJudgeRounds(report).join("\n");
    const round = report.tasks[0].rounds[0];

    for (const value of [
      "TASK-001",
      "closed",
      round.reviewedAt,
      round.scopeDigest,
      "APPROVED",
      "independent true",
      `category ${round.category}`,
      "round category unknown",
      ...round.files,
    ]) {
      expect(text).toContain(value);
    }
    expect(text).toMatch(/skipped \(0\):\n\s+none/);
    expect(text).toContain("open: taskCount 0, roundCount 0, mean null, max null");

    const human = (await execFileAsync("node", [cli, "judge", "rounds"], { cwd: tmp })).stdout;
    expect(human.trimEnd()).toBe(renderJudgeRounds(report).join("\n"));

    await rm(path.join(tmp, JUDGE_DIR), { recursive: true });
    const nothing = renderJudgeRounds(await collectJudgeRounds(tmp)).join("\n");
    expect(nothing).toMatch(/tasks \(0\):\n\s+none/);
    expect(nothing).toMatch(/unknown \(0\):\n\s+none/);
    expect(nothing).toMatch(/skipped \(0\):\n\s+none/);
  });
});

describe("TASK-077 criterion proof declarations", () => {
  interface ProofFixtureOptions {
    criteria: string;
    declares?: string[];
    tests?: Array<{ command: string; status: string }>;
    statuses?: Record<string, string>;
    files?: Record<string, string>;
    snapshot?: boolean;
  }

  async function proofCapsule(criteria: string, declares: string[] = ["pnpm test"]) {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Declare criterion proof", { cwd: tmp, nonInteractive: true });
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    const filled = original.replace("```\n```", `\`\`\`\n${declares.join("\n")}\n\`\`\``);
    expect(filled).not.toBe(original);
    await writeFile(taskFile, filled, "utf8");
    await writeFile(path.join(tmp, task.taskDir, "acceptance-criteria.md"), criteria, "utf8");
    return task;
  }

  async function proofFixture(options: ProofFixtureOptions) {
    const task = await proofCapsule(options.criteria, options.declares);
    for (const [file, content] of Object.entries(options.files ?? {})) {
      await mkdir(path.dirname(path.join(tmp, file)), { recursive: true });
      await writeFile(path.join(tmp, file), content, "utf8");
    }
    await writeFile(path.join(tmp, "app.ts"), "export const value = 1;\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
    await writeFile(path.join(tmp, "app.ts"), "export const value = 2;\n", "utf8");
    const scope = options.snapshot
      ? (await captureJudgeSnapshot(tmp, task.taskId, "HEAD")).scope
      : await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");
    const declaration = await readAcceptanceCriteria(tmp, task.taskId);
    const record = {
      schemaVersion: JUDGE_SCHEMA_VERSION,
      taskId: task.taskId,
      scope,
      verdict: "APPROVED",
      tests: options.tests ?? [{ command: "pnpm test", status: "passed" }],
      criteria: declaration.ids.map((id) => ({
        id,
        status: options.statuses?.[id] ?? "pass",
        evidence: "Checked against the changed files.",
      })),
      observations: [],
      reviewedAt: new Date().toISOString(),
    };
    const recordPath = path.join(tmp, ".akrctx/local/judge/proof-review.json");
    await mkdir(path.dirname(recordPath), { recursive: true });
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return { task, recordPath };
  }

  const header = "# Acceptance Criteria\n\n";

  describe("declaration parser", () => {
    it("reads proof lines, keeps them out of the prose and deduplicates identical pairs", async () => {
      const task = await proofCapsule(
        `${header}- AC-1: Builds.\n  proof-command: pnpm build\n  proof-command: pnpm test\n  proof-command: pnpm build\n  proof-doc: docs/a.md#Heading\n  proof-doc: docs/b.md\n- AC-2: Plain.\n`,
      );

      const declaration = await readAcceptanceCriteria(tmp, task.taskId);

      expect(declaration.problems).toEqual([]);
      expect(declaration.ids).toEqual(["AC-1", "AC-2"]);
      expect(declaration.criteria[0].text).toBe("AC-1: Builds.");
      expect(declaration.criteria[0].proofs).toEqual([
        { kind: "command", reference: "pnpm build", line: 4 },
        { kind: "command", reference: "pnpm test", line: 5 },
        { kind: "doc", reference: "docs/a.md#Heading", line: 7 },
        { kind: "doc", reference: "docs/b.md", line: 8 },
      ]);
      expect(declaration.criteria[1].proofs).toEqual([]);
    });

    it("still folds ordinary continuation prose around a proof line", async () => {
      const task = await proofCapsule(
        `${header}- AC-1: First part\n  proof-command: pnpm test\n  second part.\n- AC-2: Next.\n`,
      );

      const declaration = await readAcceptanceCriteria(tmp, task.taskId);

      expect(declaration.problems).toEqual([]);
      expect(declaration.criteria[0].text).toBe("AC-1: First part second part.");
      expect(declaration.criteria[0].proofs).toHaveLength(1);
    });

    it.each([
      ["an empty command", "- AC-1: A.\n  proof-command:\n", "line 4", "empty"],
      ["an empty document", "- AC-1: A.\n  proof-doc:   \n", "line 4", "empty"],
      ["a generic proof field", "- AC-1: A.\n  proof: pnpm test\n", "line 4", "unsupported"],
      ["an unknown proof kind", "- AC-1: A.\n  proof-test: it works\n", "line 4", "unsupported"],
      ["a differently cased kind", "- AC-1: A.\n  Proof-Command: pnpm test\n", "line 4", "unsupported"],
      ["an orphaned line before any criterion", "  proof-command: pnpm test\n- AC-1: A.\n", "line 3", "orphaned"],
      ["an unindented orphan", "- AC-1: A.\n\nproof-doc: docs/a.md\n", "line 5", "orphaned"],
      [
        "an orphan in the retired footer",
        "- AC-1: A.\nRetired: AC-2\n  proof-command: pnpm test\n",
        "line 5",
        "orphaned",
      ],
    ])("reports %s as a capsule defect with its line", async (_name, body, line, kind) => {
      const task = await proofCapsule(header + body);

      const declaration = await readAcceptanceCriteria(tmp, task.taskId);

      expect(declaration.problems).toHaveLength(1);
      expect(declaration.problems[0]).toContain(line);
      expect(declaration.problems[0]).toContain("acceptance-criteria.md");
      expect(declaration.problems[0]).toContain(kind);
    });

    it.each([
      ["an absolute path", "/etc/passwd"],
      ["a traversal path", "../outside.md"],
      ["an embedded traversal", "docs/../../outside.md"],
      ["a remote URL", "https://example.com/spec.md"],
      ["a file URL", "file:///etc/passwd"],
      ["a Windows drive path", "C:\\spec.md"],
      ["a policy-blocked file", ".env"],
      ["a policy-blocked directory", "secrets/spec.md"],
      ["a policy-blocked pattern", "docs/server.pem"],
      ["a fragment without a path", "#Heading"],
      ["an empty fragment", "docs/a.md#"],
    ])("rejects %s as a proof-doc reference", async (_name, reference) => {
      const task = await proofCapsule(`${header}- AC-1: A.\n  proof-doc: ${reference}\n`);

      const declaration = await readAcceptanceCriteria(tmp, task.taskId);

      expect(declaration.problems).toHaveLength(1);
      expect(declaration.problems[0]).toContain("line 4");
      expect(declaration.problems[0]).toContain("proof-doc");
    });

    it("drops a rejected reference so verification never looks at its target", async () => {
      const task = await proofCapsule(
        `${header}- AC-1: A.\n  proof-doc: ../outside.md\n  proof-doc: .env\n  proof-doc: docs/ok.md\n`,
      );

      const declaration = await readAcceptanceCriteria(tmp, task.taskId);

      expect(declaration.problems).toHaveLength(2);
      expect(declaration.criteria[0].proofs).toEqual([{ kind: "doc", reference: "docs/ok.md", line: 6 }]);
    });

    it("keeps retired identifiers as non-criteria next to proof declarations", async () => {
      const task = await proofCapsule(
        `${header}- AC-1: A.\n  proof-command: pnpm test\n\nRetired: AC-2\nRetired: AC-3\n`,
      );

      const declaration = await readAcceptanceCriteria(tmp, task.taskId);

      expect(declaration.problems).toEqual([]);
      expect(declaration.ids).toEqual(["AC-1"]);
    });

    it("leaves a capsule without declarations valid and untouched by migration", async () => {
      const body = `${header}- AC-1: Old prose.\n  wrapped line that mentions a proof of concept.\n- AC-2: Other.\n`;
      const task = await proofCapsule(body);

      const declaration = await readAcceptanceCriteria(tmp, task.taskId);
      const migration = await migrateAcceptanceCriteriaIdentifiers(tmp, { dryRun: true });

      expect(declaration.problems).toEqual([]);
      expect(declaration.criteria.map((criterion) => criterion.proofs)).toEqual([[], []]);
      expect(migration.every((entry) => !entry.changed)).toBe(true);
    });

    it("lets migration number a bullet in a capsule that also has a proof defect", async () => {
      const task = await proofCapsule(`${header}- Unnumbered.\n  proof: pnpm test\n`);

      const migration = await migrateAcceptanceCriteriaIdentifiers(tmp, { dryRun: true });

      const entry = migration.find((item) => item.file.includes(task.taskId));
      expect(entry?.changed).toBe(true);
      expect(entry?.problems ?? []).toEqual([]);
    });
  });

  describe("command proof in verify", () => {
    const one = (extra: string) => `${header}- AC-1: Works.\n${extra}`;

    it("accepts a declared passing command on trust and says the execution was not observed", async () => {
      const { recordPath } = await proofFixture({ criteria: one("  proof-command: pnpm test\n") });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.notices.join("\n")).toContain("AC-1: execution not observed: command accepted on trust");
      expect(result.notices.join("\n")).toContain("pnpm test");
    });

    it("emits no proof text for a capsule that declares no proof", async () => {
      const { recordPath } = await proofFixture({ criteria: one("") });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.notices.join("\n")).not.toContain("execution not observed");
      expect(result.notices.join("\n")).not.toContain("proof");
    });

    it("keeps a criterion without proof assessable when it is reported not-evaluated", async () => {
      const { recordPath } = await proofFixture({ criteria: one(""), statuses: { "AC-1": "not-evaluated" } });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(false);
      expect(result.reasons.join("\n")).not.toContain("proof requirement unmet");
      expect(result.reasons.join("\n")).not.toContain("criterion not evaluated");
    });

    it("reports a command the capsule does not declare as an unmet proof requirement", async () => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm e2e\n"),
        tests: [
          { command: "pnpm test", status: "passed" },
          { command: "pnpm e2e", status: "passed" },
        ],
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(false);
      expect(result.reasons.join("\n")).toMatch(
        /AC-1: proof requirement unmet.*pnpm e2e.*not a command the capsule declares/,
      );
    });

    it.each([
      ["absent", []],
      ["not-run", [{ command: "pnpm lint", status: "not-run" }]],
      ["failed", [{ command: "pnpm lint", status: "failed" }]],
    ])("reports %s evidence for a required proof command as unmet", async (_name, extra) => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm lint\n"),
        declares: ["pnpm test", "pnpm lint # optional"],
        tests: [{ command: "pnpm test", status: "passed" }, ...extra],
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(false);
      expect(result.reasons.join("\n")).toMatch(/AC-1: proof requirement unmet.*pnpm lint/);
    });

    it("keeps the optional-failure notice and still blocks the criterion that requires the command", async () => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm lint\n"),
        declares: ["pnpm test", "pnpm lint # optional"],
        tests: [
          { command: "pnpm test", status: "passed" },
          { command: "pnpm lint", status: "failed" },
        ],
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.notices.join("\n")).toContain("Optional command `pnpm lint` failed");
      expect(result.reasons.join("\n")).toContain("AC-1: proof requirement unmet");
    });

    it("accepts a globally optional command that passed when a criterion requires it", async () => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm lint # optional\n"),
        declares: ["pnpm test", "pnpm lint # optional"],
        tests: [
          { command: "pnpm test", status: "passed" },
          { command: "pnpm lint", status: "passed" },
        ],
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("treats several command references as conjunctive and names only the unmet one", async () => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm test\n  proof-command: pnpm build\n"),
        declares: ["pnpm test", "pnpm build"],
        tests: [{ command: "pnpm test", status: "passed" }],
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      const unmet = result.reasons.filter((reason) => reason.includes("proof requirement unmet"));
      expect(unmet).toHaveLength(1);
      expect(unmet[0]).toContain("pnpm build");
      expect(unmet[0]).not.toContain("pnpm test");
    });

    it("does not let a passing command force a pass", async () => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm test\n"),
        statuses: { "AC-1": "fail" },
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(false);
      expect(result.reasons.join("\n")).toContain("APPROVED requires every declared criterion to pass");
      expect(result.reasons.join("\n")).not.toContain("proof requirement unmet");
    });

    it("names an unmet proof next to a not-evaluated criterion instead of hiding it", async () => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm e2e\n"),
        statuses: { "AC-1": "not-evaluated" },
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      const text = result.reasons.join("\n");
      expect(text).toContain("AC-1: criterion not evaluated");
      expect(text).toContain("AC-1: proof requirement unmet");
    });

    it("names a not-evaluated criterion whose proof is available as not evaluated only", async () => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm test\n"),
        statuses: { "AC-1": "not-evaluated" },
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      const text = result.reasons.join("\n");
      expect(text).toContain("AC-1: criterion not evaluated");
      expect(text).not.toContain("proof requirement unmet");
    });

    it("rejects a malformed declaration through the existing capsule-defect channel", async () => {
      const { recordPath } = await proofFixture({ criteria: one("  proof:\n") });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(false);
      expect(result.reasons.join("\n")).toContain("acceptance-criteria.md line 4");
    });

    it("removes the trust notice after a successful observed re-run and runs nothing extra", async () => {
      const passing = 'node -e "process.exit(0)"';
      const sentinel = path.join(tmp, "proof-must-not-run.txt");
      const injected = `node -e "require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran')"`;
      const { recordPath } = await proofFixture({
        criteria: one(`  proof-command: ${passing}\n  proof-command: ${injected}\n`),
        declares: [passing],
        tests: [{ command: passing, status: "passed" }],
        snapshot: true,
      });

      const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

      expect(result.reexecuted).toHaveLength(1);
      expect(result.reexecuted[0]).toMatchObject({ command: passing, passed: true });
      expect(result.notices.join("\n")).not.toContain(
        `execution not observed: command accepted on trust: \`${passing}\``,
      );
      expect(result.reasons.join("\n")).toContain("proof requirement unmet");
      await expect(stat(sentinel)).rejects.toThrow();
    });

    it("adds an unmet-proof reason to the existing failure when the observed re-run fails", async () => {
      const failing = 'node -e "process.exit(1)"';
      const { recordPath } = await proofFixture({
        criteria: one(`  proof-command: ${failing}\n`),
        declares: [failing],
        tests: [{ command: failing, status: "passed" }],
        snapshot: true,
      });

      const result = await verifyJudgeRecord(tmp, recordPath, { runTests: true, approve: async () => true });

      const text = result.reasons.join("\n");
      expect(result.approved).toBe(false);
      expect(text).toContain("Independent re-run of");
      expect(text).toMatch(/AC-1: proof requirement unmet.*process\.exit\(1\)/);
    });

    it("does not infer a per-test result from reporter text", async () => {
      const { recordPath } = await proofFixture({
        criteria: one("  proof-command: pnpm test\n"),
        tests: [{ command: "pnpm test", status: "passed", evidence: "✗ proof test one failed" } as never],
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(true);
      expect(result.reasons).toEqual([]);
    });
  });

  describe("documentary proof in verify", () => {
    const withDoc = (reference: string) => `${header}- AC-1: Documented.\n  proof-doc: ${reference}\n`;

    it("accepts an existing unchanged document without any mechanical effect", async () => {
      const { recordPath } = await proofFixture({
        criteria: withDoc("docs/behavior.md#Behavior"),
        files: { "docs/behavior.md": "# Behavior\n" },
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.notices.join("\n")).not.toMatch(/proof-doc .* unavailable/);
    });

    it("does not let an existing document force a pass", async () => {
      const { recordPath } = await proofFixture({
        criteria: withDoc("docs/unrelated.md"),
        files: { "docs/unrelated.md": "# Unrelated\n" },
        statuses: { "AC-1": "fail" },
      });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(false);
      expect(result.reasons.join("\n")).toContain("APPROVED requires every declared criterion to pass");
    });

    it("reports a missing document as unavailable without failing the criterion", async () => {
      const { recordPath } = await proofFixture({ criteria: withDoc("docs/missing.md") });

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.approved).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.notices.join("\n")).toMatch(/AC-1: proof-doc `docs\/missing\.md` unavailable/);
    });

    it("reports a link that escapes the repository as unavailable and never follows it", async () => {
      const outside = path.join(path.dirname(tmp), `${path.basename(tmp)}-secret.md`);
      await writeFile(outside, "# Outside\n", "utf8");
      const { recordPath } = await proofFixture({
        criteria: withDoc("docs/link.md"),
        files: { "docs/placeholder.md": "# Placeholder\n" },
      });
      await symlink(outside, path.join(tmp, "docs/link.md"));
      const before = (await stat(outside)).atimeMs;

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.reasons.join("\n")).not.toContain("proof requirement unmet");
      expect(result.notices.join("\n")).toMatch(/AC-1: proof-doc `docs\/link\.md` unavailable/);
      expect((await stat(outside)).atimeMs).toBe(before);
      await rm(outside);
    });
  });

  describe("shipped guidance", () => {
    it("shows the proof syntax in the capsule template and in a new capsule", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      const task = await runTask("Show the proof syntax", { cwd: tmp, nonInteractive: true });

      for (const file of [".akrctx/tasks/_template/acceptance-criteria.md", `${task.taskDir}/acceptance-criteria.md`]) {
        const markdown = await readFile(path.join(tmp, file), "utf8");
        expect(markdown).toContain("proof-command:");
        expect(markdown).toContain("proof-doc:");
      }
      const declaration = await readAcceptanceCriteria(tmp, task.taskId);
      expect(declaration.problems).toEqual([]);
      expect(declaration.criteria.every((criterion) => criterion.proofs.length === 0)).toBe(true);
    });

    it("describes how a declared proof constrains the verdict in the judge files", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      await runJudgeEnable({ cwd: tmp, nonInteractive: true });

      const instructions = await readFile(path.join(tmp, ".codex/agents/akrctx-judge.toml"), "utf8");
      const readme = await readFile(path.join(tmp, ".akrctx/judge/README.md"), "utf8");
      const schema = JSON.parse(await readFile(path.join(tmp, ".akrctx/judge/schemas/review.schema.json"), "utf8"));

      for (const text of [instructions, readme]) {
        expect(text).toContain("proof-command:");
        expect(text).toContain("proof-doc:");
        expect(text).toContain("proof requirement unmet");
        expect(text).toContain("execution not observed: command accepted on trust");
      }
      expect(schema.properties.criteria.description).toContain("proof");
      expect(Object.keys(schema.properties.criteria.items.properties)).toEqual(["id", "status", "evidence"]);
    });
  });
});

describe("TASK-078 clarification signal", () => {
  const sha = async (ref: string) => (await execFileAsync("git", ["rev-parse", ref], { cwd: tmp })).stdout.trim();
  const git = (...args: string[]) => execFileAsync("git", args, { cwd: tmp });
  const reset = async () => {
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
  };

  interface Capsule {
    contract?: string;
    clarifications?: string | null;
    criteria?: string;
  }

  const taskMarkdown = ({ contract = "The tool reports X.", clarifications }: Capsule) => {
    const clarificationText =
      clarifications === undefined ? "### Session 2026-10-01\n- The human chose option A." : clarifications;
    return `# TASK-X

## Goal

Demo.

## Contract

${contract}

## Validation

\`\`\`
pnpm test
\`\`\`
${clarificationText === null ? "" : `\n## Clarifications\n\n${clarificationText}\n`}
## Open Questions

- None.
`;
  };
  const criteriaMarkdown = (criteria = "- AC-1: It works.") => `# Acceptance Criteria\n\n${criteria}\n`;

  async function writeCapsule(taskDir: string, capsule: Capsule) {
    await writeFile(path.join(tmp, taskDir, "task.md"), taskMarkdown(capsule), "utf8");
    await writeFile(path.join(tmp, taskDir, "acceptance-criteria.md"), criteriaMarkdown(capsule.criteria), "utf8");
  }

  async function writeRecord(task: { taskId: string }, scope: unknown, name: string) {
    const declaration = await readAcceptanceCriteria(tmp, task.taskId);
    const recordPath = path.join(tmp, ".akrctx/local/judge", name);
    await mkdir(path.dirname(recordPath), { recursive: true });
    await writeFile(
      recordPath,
      `${JSON.stringify({
        schemaVersion: JUDGE_SCHEMA_VERSION,
        taskId: task.taskId,
        scope,
        verdict: "APPROVED",
        tests: [{ command: "pnpm test", status: "passed" }],
        criteria: declaration.ids.map((id) => ({ id, status: "pass", evidence: "Checked." })),
        observations: [],
        reviewedAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    );
    return recordPath;
  }

  async function initRepo() {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await git("init");
    await git("config", "user.email", "tests@example.com");
    await git("config", "user.name", "akrctx tests");
  }

  const isSignal = (notice: string) => /^(Heuristic notice|Clarification comparison)/.test(notice);

  /** Verify a record over a base -> candidate boundary. */
  async function verifyBoundary(options: {
    base: Capsule;
    candidate: Capsule;
    mode?: "commit" | "snapshot" | "worktree";
    capsuleInBase?: boolean;
  }) {
    const mode = options.mode ?? "commit";
    await initRepo();
    let task: Awaited<ReturnType<typeof runTask>>;
    let base: string;
    if (options.capsuleInBase === false) {
      await git("add", ".");
      await git("commit", "-m", "init");
      base = await sha("HEAD");
      task = await runTask("Clarification signal", { cwd: tmp, nonInteractive: true });
      await writeCapsule(task.taskDir, options.candidate);
      await git("add", ".");
      await git("commit", "-m", "capsule");
    } else {
      task = await runTask("Clarification signal", { cwd: tmp, nonInteractive: true });
      await writeCapsule(task.taskDir, options.base);
      await git("add", ".");
      await git("commit", "-m", "base");
      base = await sha("HEAD");
      await writeCapsule(task.taskDir, options.candidate);
      if (mode === "commit") {
        await git("add", ".");
        await git("commit", "-m", "candidate");
      }
    }
    const scope =
      mode === "snapshot"
        ? (await captureJudgeSnapshot(tmp, task.taskId, base)).scope
        : await createJudgeScope(tmp, task.taskId, base, mode === "worktree" ? "WORKTREE" : "HEAD");
    const recordPath = await writeRecord(task, scope, "clarification-review.json");
    const result = await verifyJudgeRecord(tmp, recordPath);
    return { task, scope, base, recordPath, result, signal: result.notices.filter(isSignal) };
  }

  const changedContract = { contract: "The tool reports Y." };

  describe("normalization", () => {
    const same = (a: string, b: string) => expect(normalizeBlocks(a)).toEqual(normalizeBlocks(b));
    const differ = (a: string, b: string) => expect(normalizeBlocks(a)).not.toEqual(normalizeBlocks(b));

    it("ignores CRLF, and whitespace reflow inside paragraphs and list items", () => {
      same(
        "One  sentence\nwraps here.\n\n- item one\n  continues\n",
        "One sentence wraps\nhere.\r\n\r\n- item one continues\r\n",
      );
    });

    it("ignores exactly one terminal full stop on prose and list items", () => {
      same("The tool reports X.", "The tool reports X");
      same("- Item.", "- Item");
      differ("The tool reports X...", "The tool reports X");
      differ("Is it X?", "Is it X");
      differ("See (X).", "See (X");
    });

    it("keeps operators, paths, numbers, quoting and block order significant", () => {
      differ("a < b", "a <= b");
      differ("Edit src/a.ts", "Edit src/b.ts");
      differ("Allow 1.5 seconds", "Allow 15 seconds");
      differ('Say "x" now', "Say 'x' now");
      differ("**must** run", "must run");
      differ("First.\n\nSecond.", "Second.\n\nFirst.");
      differ("A\n\nB", "A B");
    });

    it("keeps inline code, fenced code and headings exact", () => {
      differ("Run `a  b` now", "Run `a b` now");
      differ("```\nfoo  bar\n```", "```\nfoo bar\n```");
      differ("```\nfoo.\n```", "```\nfoo\n```");
      differ("## Contract", "### Contract");
      same("Run `a b`.\n", "Run `a b`");
    });

    it("keeps proof-command:, proof-doc: and Retired: lines exact and separate", () => {
      differ("- AC-1: A.\n  proof-command: pnpm  test\n", "- AC-1: A.\n  proof-command: pnpm test\n");
      differ("Retired: AC-5", "Retired: AC-6");
      differ("proof-doc: docs/a.md.", "proof-doc: docs/a.md");
      expect(normalizeBlocks("- AC-1: A\n  proof-doc: docs/a.md\n  proof-command: pnpm test")).toHaveLength(3);
    });

    it("counts raw added and deleted lines", () => {
      expect(countLineChanges(["a", "b", "c"], ["a", "x", "c", "d"])).toEqual({ added: 2, deleted: 1 });
      expect(countLineChanges([], ["a"])).toEqual({ added: 1, deleted: 0 });
    });
  });

  describe("heuristic notice", () => {
    it("reports a changed Contract without new clarification content", async () => {
      const { signal, base, result } = await verifyBoundary({ base: {}, candidate: changedContract });

      expect(signal).toHaveLength(1);
      expect(signal[0]).toContain("task.md `## Contract`");
      expect(signal[0]).toContain("+1/-1 raw lines");
      expect(signal[0]).toContain(`base ${base.slice(0, 12)} to candidate`);
      expect(signal[0]).toMatch(/path \.akrctx\/tasks\/TASK-\d+-[^/]+\/task\.md/);
      expect(signal[0]).toContain("does not show that a consultation was skipped");
      expect(signal[0]).not.toContain("The tool reports Y");
      expect(signal[0].length).toBeLessThanOrEqual(1024);
      expect(result.reasons).toEqual([]);
    });

    it("reports a changed acceptance-criteria.md, and a Contract change as a second notice", async () => {
      const onlyCriteria = await verifyBoundary({ base: {}, candidate: { criteria: "- AC-1: It works well." } });
      expect(onlyCriteria.signal).toHaveLength(1);
      expect(onlyCriteria.signal[0]).toContain("acceptance-criteria.md changed");
      await reset();

      const both = await verifyBoundary({ base: {}, candidate: { ...changedContract, criteria: "- AC-1: Other." } });
      expect(both.signal).toHaveLength(2);
    });

    it("stays silent for reflow, CRLF and one terminal full stop", async () => {
      const { signal } = await verifyBoundary({
        base: { contract: "The tool reports\nX.\n\nIt never blocks." },
        candidate: { contract: "The tool   reports X\r\n\r\nIt never blocks", criteria: "- AC-1: It works" },
      });
      expect(signal).toEqual([]);
    });

    it("never changes valid or approved", async () => {
      const withNotice = await verifyBoundary({ base: {}, candidate: changedContract });
      expect(withNotice.signal).toHaveLength(1);
      await reset();
      const control = await verifyBoundary({
        base: {},
        candidate: {
          ...changedContract,
          clarifications: "### Session 2026-10-01\n- The human chose option A.\n- The human chose Y.",
        },
      });
      expect(control.signal).toEqual([]);
      expect(withNotice.result.valid).toBe(control.result.valid);
      expect(withNotice.result.approved).toBe(control.result.approved);
      expect(withNotice.result.valid).toBe(true);
      expect(withNotice.result.approved).toBe(true);
    });

    it("caps a notice at 1024 characters and keeps the boundary ID and section", () => {
      const longPath = `.akrctx/tasks/TASK-001-${"very-long-name-".repeat(100)}/task.md`;
      const pointer = "base abcdef123456 to candidate SNAPSHOT:0123456789abcdef0123";
      const notice = boundedNotice("task.md `## Contract`", 3, 4, pointer, longPath);
      expect(notice.length).toBeLessThanOrEqual(1024);
      expect(notice).toContain("SNAPSHOT:0123456789abcdef0123");
      expect(notice).toContain("task.md `## Contract`");
      expect(notice).toContain("…");
    });
  });

  describe("new clarification content", () => {
    const withBullets = (...bullets: string[]): Capsule => ({
      ...changedContract,
      clarifications: `### Session 2026-10-01\n- The human chose option A.\n${bullets.join("\n")}`,
    });
    const signalFor = async (candidate: Capsule) => {
      const { signal } = await verifyBoundary({ base: {}, candidate });
      await reset();
      return signal.length;
    };

    it("is suppressed by a new bullet, including a wrapped one", async () => {
      expect(await signalFor(withBullets("- The human chose Y.\n  The reason is cost."))).toBe(0);
    });

    it("is suppressed by No ambiguity: with an explanation", async () => {
      expect(await signalFor(withBullets("- No ambiguity: the change is a rename."))).toBe(0);
    });

    it("is not suppressed by an empty No ambiguity:", async () => {
      expect(await signalFor(withBullets("- No ambiguity:"))).toBe(1);
      expect(await signalFor(withBullets("- no ambiguity:   "))).toBe(1);
    });

    it("is not suppressed by a heading or date change, a duplicate bullet or a None placeholder", async () => {
      for (const clarifications of [
        "### Session 2026-10-09\n- The human chose option A.",
        "### Session 2026-10-01\n- The human chose option A.\n### Session 2026-10-09\n- The human chose option A",
        "### Session 2026-10-01\n- The human chose option A.\n- None.",
        "### Session 2026-10-01\n- The human chose option A.\n- None recorded yet.",
      ]) {
        expect(await signalFor({ ...changedContract, clarifications })).toBe(1);
      }
    });
  });

  describe("reviewed boundary", () => {
    it("compares a snapshot against its base and ignores the live workspace", async () => {
      const { signal, scope, task, recordPath } = await verifyBoundary({
        base: {},
        candidate: changedContract,
        mode: "snapshot",
      });

      expect(scope.candidate).toMatch(/^SNAPSHOT:/);
      expect(signal).toHaveLength(1);
      expect(signal[0]).toContain(`candidate ${scope.candidate}`);

      // A live edit after the snapshot must neither add nor hide a notice.
      await writeCapsule(task.taskDir, {
        ...changedContract,
        clarifications: "### Session 2026-10-01\n- The human chose option A.\n- Added only in the live tree.",
      });
      const again = await verifyJudgeRecord(tmp, recordPath);
      expect(again.notices.filter((notice) => notice.startsWith("Heuristic notice"))).toHaveLength(1);
    });

    it("reports comparison unavailable for WORKTREE without changing the verdict", async () => {
      const { signal, result } = await verifyBoundary({ base: {}, candidate: changedContract, mode: "worktree" });

      expect(signal).toHaveLength(1);
      expect(signal[0]).toContain("comparison unavailable");
      expect(signal[0]).not.toContain("Heuristic notice");
      expect(result.valid).toBe(true);
      expect(result.approved).toBe(true);
    });

    it("reports comparison unavailable when a compared file is missing in the base", async () => {
      await initRepo();
      const task = await runTask("Clarification signal", { cwd: tmp, nonInteractive: true });
      await writeCapsule(task.taskDir, {});
      await rm(path.join(tmp, task.taskDir, "acceptance-criteria.md"));
      await git("add", ".");
      await git("commit", "-m", "base");
      const base = await sha("HEAD");
      await writeCapsule(task.taskDir, {});
      await git("add", ".");
      await git("commit", "-m", "candidate");
      const scope = await createJudgeScope(tmp, task.taskId, base, "HEAD");
      const recordPath = await writeRecord(task, scope, "missing.json");

      const result = await verifyJudgeRecord(tmp, recordPath);

      expect(result.notices.some((notice) => /comparison unavailable.*acceptance-criteria\.md/.test(notice))).toBe(
        true,
      );
      expect(result.approved).toBe(true);
    });

    it("stays inconclusive, with no notice, for a new capsule and for a capsule without Clarifications", async () => {
      const added = await verifyBoundary({ base: {}, candidate: changedContract, capsuleInBase: false });
      expect(added.signal).toEqual([]);
      await reset();

      const predating = await verifyBoundary({ base: { clarifications: null }, candidate: changedContract });
      expect(predating.signal).toEqual([]);
      await reset();

      const later = await verifyBoundary({ base: {}, candidate: { ...changedContract, clarifications: null } });
      expect(later.signal).toEqual([]);
    });

    it("replays TASK-075's first-added capsule as inconclusive: Contract and Clarifications arrive together", async () => {
      const { signal } = await verifyBoundary({
        base: {},
        candidate: {
          contract: "### Statuses\n\nThe status enum is pass, fail or not-evaluated.",
          clarifications: "### Session 2026-09-20\n- Four earlier clarifications were recorded.",
        },
        capsuleInBase: false,
      });
      expect(signal).toEqual([]);
    });
  });

  describe("unexpected failure", () => {
    it("reports comparison unavailable with the reason and never aborts verify", async () => {
      const control = await verifyBoundary({ base: {}, candidate: changedContract });
      const failing = vi
        .spyOn(clarificationSignal, "clarificationSignalNotices")
        .mockRejectedValue(new Error("simulated failure\nsecond line"));
      try {
        const result = await verifyJudgeRecord(tmp, control.recordPath);
        const signal = result.notices.filter(isSignal);

        expect(signal).toEqual([
          "Clarification comparison unavailable: simulated failure. No conclusion about consultation is drawn.",
        ]);
        expect(result.valid).toBe(control.result.valid);
        expect(result.approved).toBe(control.result.approved);
        expect(result.reasons).toEqual(control.result.reasons);
      } finally {
        failing.mockRestore();
      }
    });
  });

  describe("documented detection limits", () => {
    const signalCount = async (base: Capsule, candidate: Capsule) => {
      const { signal } = await verifyBoundary({ base, candidate });
      await reset();
      return signal.length;
    };

    it("false positives: a clearer paraphrase, other punctuation edits and a reorder still notify", async () => {
      expect(await signalCount({}, { contract: "The tool tells you about X." })).toBe(1);
      expect(await signalCount({}, { contract: "The tool reports X!" })).toBe(1);
      expect(
        await signalCount({ contract: "First rule.\n\nSecond rule." }, { contract: "Second rule.\n\nFirst rule." }),
      ).toBe(1);
    });

    it("false negatives: normalization-covered edits, an unrelated bullet and No ambiguity stay silent", async () => {
      expect(await signalCount({ contract: "Is it fast." }, { contract: "Is it fast" })).toBe(0);
      const bullet = (text: string): Capsule => ({
        ...changedContract,
        clarifications: `### Session 2026-10-01\n- The human chose option A.\n- ${text}`,
      });
      expect(await signalCount({}, bullet("Unrelated note."))).toBe(0);
      expect(await signalCount({}, bullet("No ambiguity: self-reported."))).toBe(0);
    });
  });
});

describe("TASK-080 mechanical change lane", () => {
  const SLOW = 120_000;
  const GENERATOR = `import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
const mode = process.argv[2] ?? "";
for (const file of ["data/a.txt", "data/b.txt"]) writeFileSync(file, readFileSync(file, "utf8").toUpperCase());
if (mode === "--stray") {
  mkdirSync("ignored", { recursive: true });
  writeFileSync("ignored/out.txt", "x");
}
if (mode === "--touch") writeFileSync("data/c.txt", readFileSync("data/c.txt"));
if (mode === "--delete") rmSync("data/old.txt");
if (mode === "--add") writeFileSync("data/new.txt", "new\\n");
if (mode === "--relink") {
  unlinkSync("data/link.txt");
  symlinkSync("target-b", "data/link.txt");
}
if (mode === "--exec") chmodSync("data/a.txt", 0o755);
if (mode === "--rootblip") {
  writeFileSync("blip", "");
  rmSync("blip");
}
`;
  const RUN = 'node "$AKRCTX_GENERATOR_ROOT/tools/gen.mjs"';
  const VALIDATION = 'node -e "process.exit(0)"';

  interface Fixture {
    generator: { taskId: string };
    task: { taskId: string; taskDir: string };
    landed: string;
    candidate: string;
    include: string[];
    declare: (declaration: unknown) => Promise<void>;
  }

  interface FixtureOptions {
    command?: string;
    prepare?: string[];
    paths?: string[] | (() => string[]);
    inputs?: string[];
    generatorSource?: string;
    reviewedSource?: string;
    setupBase?: () => Promise<void>;
    generateCandidate?: () => Promise<void>;
    includeTaskIds?: () => string[];
    review?: "approved" | "needs-changes" | "missing" | "commit-candidate";
    afterLanding?: () => Promise<void>;
    editCandidate?: () => Promise<void>;
    declarationOverride?: (declaration: Record<string, unknown>) => unknown;
    skipGeneration?: boolean;
    baseFiles?: Record<string, string>;
  }

  async function sh(...args: string[]): Promise<string> {
    return (await execFileAsync("git", args, { cwd: tmp })).stdout.trim();
  }

  async function fillValidation(taskDir: string): Promise<void> {
    const file = path.join(tmp, taskDir, "task.md");
    const original = await readFile(file, "utf8");
    await writeFile(file, original.replace("```\n```", `\`\`\`\n${VALIDATION}\n\`\`\``), "utf8");
  }

  async function approvedGeneratorRecord(
    generatorTaskId: string,
    snapshotScope: unknown,
    verdict: string,
    recordFile: string,
  ) {
    const declaration = await readAcceptanceCriteria(tmp, generatorTaskId);
    await mkdir(path.dirname(path.join(tmp, recordFile)), { recursive: true });
    await writeFile(
      path.join(tmp, recordFile),
      `${JSON.stringify({
        schemaVersion: JUDGE_SCHEMA_VERSION,
        taskId: generatorTaskId,
        scope: snapshotScope,
        verdict,
        tests: [{ command: VALIDATION, status: "passed" }],
        criteria: declaration.ids.map((id) => ({ id, status: "pass", evidence: "Reviewed the generator." })),
        observations: [],
        reviewedAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    );
  }

  async function mechanicalFixture(options: FixtureOptions = {}): Promise<Fixture> {
    const recordFile = ".akrctx/local/judge/generator-approved.json";
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await sh("init");
    await sh("config", "user.email", "tests@example.com");
    await sh("config", "user.name", "akrctx tests");
    await mkdir(path.join(tmp, "data"), { recursive: true });
    const baseFiles = options.baseFiles ?? {
      "data/a.txt": "alpha\n",
      "data/b.txt": "beta\n",
      "data/c.txt": "gamma\n",
      "data/old.txt": "old\n",
    };
    for (const [file, content] of Object.entries(baseFiles)) {
      await mkdir(path.dirname(path.join(tmp, file)), { recursive: true });
      await writeFile(path.join(tmp, file), content, "utf8");
    }
    await symlink("target-a", path.join(tmp, "data/link.txt"));
    await writeFile(
      path.join(tmp, ".gitignore"),
      `${await readFile(path.join(tmp, ".gitignore"), "utf8").catch(() => "")}\nignored/\n`,
    );
    const generator = await runTask("Land the generator", { cwd: tmp, nonInteractive: true });
    await fillValidation(generator.taskDir);
    await options.setupBase?.();
    await sh("add", "-A");
    await sh("commit", "-m", "base");

    const landedSource = options.generatorSource ?? GENERATOR;
    await mkdir(path.join(tmp, "tools"), { recursive: true });
    await writeFile(path.join(tmp, "tools/gen.mjs"), options.reviewedSource ?? landedSource, "utf8");
    if (options.review !== "missing") {
      const reviewed = await captureJudgeSnapshot(tmp, generator.taskId, "HEAD");
      await approvedGeneratorRecord(
        generator.taskId,
        reviewed.scope,
        options.review === "needs-changes" ? "NEEDS_CHANGES" : "APPROVED",
        recordFile,
      );
      if (options.review === "commit-candidate") {
        const record = JSON.parse(await readFile(path.join(tmp, recordFile), "utf8"));
        record.scope.candidate = "HEAD";
        await writeFile(path.join(tmp, recordFile), JSON.stringify(record), "utf8");
      }
    }
    await writeFile(path.join(tmp, "tools/gen.mjs"), landedSource, "utf8");
    await sh("add", "-A");
    await sh("commit", "-m", "land generator");
    const landed = await sh("rev-parse", "HEAD");
    await options.afterLanding?.();

    const task = await runTask("Mechanical change", { cwd: tmp, nonInteractive: true });
    await fillValidation(task.taskDir);
    const declaration = {
      generator: {
        command: options.command ?? RUN,
        commit: landed,
        review: recordFile,
        inputs: options.inputs ?? ["tools/gen.mjs"],
        prepare: options.prepare ?? [],
      },
      paths: typeof options.paths === "function" ? options.paths() : (options.paths ?? ["data/a.txt", "data/b.txt"]),
    };
    const declare = async (value: unknown) => {
      const file = path.join(tmp, task.taskDir, "task.md");
      const markdown = (await readFile(file, "utf8")).replace(/\n## Migration[\s\S]*$/, "");
      await writeFile(file, `${markdown}\n## Migration\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`);
    };
    await declare(options.declarationOverride ? options.declarationOverride(declaration) : declaration);
    if (options.generateCandidate) {
      await options.generateCandidate();
    } else if (!options.skipGeneration) {
      for (const file of ["data/a.txt", "data/b.txt"]) {
        const full = path.join(tmp, file);
        await writeFile(full, (await readFile(full, "utf8")).toUpperCase());
      }
    }
    await options.editCandidate?.();
    const include = options.includeTaskIds?.() ?? [];
    const snapshot = await captureJudgeSnapshot(tmp, task.taskId, "HEAD", include);
    return { generator, task, landed, candidate: snapshot.candidate, include, declare };
  }

  async function reproduce(fixture: Fixture, approve: (commands: string[]) => Promise<boolean> = async () => true) {
    const { reproduceMechanicalChange } = await import("../src/mechanical-reproduction.js");
    return reproduceMechanicalChange(tmp, fixture.task.taskId, {
      base: "HEAD",
      candidate: fixture.candidate,
      includedTaskIds: fixture.include,
      approve,
    });
  }

  async function treeDigest(root: string): Promise<string> {
    const lines: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (entry.name === ".git") continue;
        const full = path.join(directory, entry.name);
        const relative = path.relative(root, full);
        if (entry.isDirectory()) {
          lines.push(`d ${relative}`);
          await visit(full);
        } else if (entry.isSymbolicLink()) {
          lines.push(`l ${relative} ${await readlink(full)}`);
        } else {
          lines.push(
            `f ${relative} ${createHash("sha256")
              .update(await readFile(full))
              .digest("hex")}`,
          );
        }
      }
    };
    await visit(root);
    return createHash("sha256").update(lines.join("\n")).digest("hex");
  }

  describe("declaration", () => {
    async function read(value: unknown, raw?: string) {
      const { readMigrationDeclaration } = await import("../src/mechanical-reproduction.js");
      const dir = path.join(tmp, "capsule");
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, "task.md"),
        `# T\n\n## Migration\n\n\`\`\`json\n${raw ?? JSON.stringify(value)}\n\`\`\`\n`,
      );
      return readMigrationDeclaration(dir, [".env", "secrets/"]);
    }
    type Declaration = { generator: Record<string, unknown>; paths: unknown };
    const valid = (): Declaration => ({
      generator: {
        command: "node tool.mjs",
        commit: "a".repeat(40),
        review: ".akrctx/local/judge/r.json",
        inputs: ["tools/gen.mjs"],
        prepare: [],
      },
      paths: ["data/a.txt"],
    });

    it("accepts the documented shape, including an empty prepare list", async () => {
      const result = await read(valid());
      expect(result.problems).toEqual([]);
      expect(result.declaration?.paths).toEqual(["data/a.txt"]);
    });

    it.each([
      ["an unknown top-level key", (d: Declaration) => ({ ...d, extra: 1 }), "Unknown key in migration: extra"],
      [
        "an unknown generator key",
        (d: Declaration) => ({ ...d, generator: { ...d.generator, shell: "sh" } }),
        "Unknown key in generator: shell",
      ],
      [
        "an empty command",
        (d: Declaration) => ({ ...d, generator: { ...d.generator, command: " " } }),
        "generator.command must be a non-empty string",
      ],
      [
        "a short commit",
        (d: Declaration) => ({ ...d, generator: { ...d.generator, commit: "abc123" } }),
        "full Git SHA",
      ],
      [
        "an empty review",
        (d: Declaration) => ({ ...d, generator: { ...d.generator, review: "" } }),
        "generator.review must be a non-empty string",
      ],
      [
        "empty inputs",
        (d: Declaration) => ({ ...d, generator: { ...d.generator, inputs: [] } }),
        "generator.inputs must be a non-empty array",
      ],
      [
        "duplicate inputs",
        (d: Declaration) => ({ ...d, generator: { ...d.generator, inputs: ["a.mjs", "a.mjs"] } }),
        "generator.inputs lists a.mjs more than once",
      ],
      [
        "a missing prepare list",
        (d: Declaration) => ({ ...d, generator: { ...d.generator, prepare: undefined } }),
        "generator.prepare must be an array",
      ],
      [
        "a malformed prepare entry",
        (d: Declaration) => ({ ...d, generator: { ...d.generator, prepare: ["ok", 3] } }),
        "generator.prepare[1]",
      ],
      ["empty paths", (d: Declaration) => ({ ...d, paths: [] }), "paths must be a non-empty array"],
      [
        "duplicate paths",
        (d: Declaration) => ({ ...d, paths: ["a.txt", "a.txt"] }),
        "paths lists a.txt more than once",
      ],
      ["an absolute path", (d: Declaration) => ({ ...d, paths: ["/etc/passwd"] }), "must not be absolute"],
      ["a traversal path", (d: Declaration) => ({ ...d, paths: ["../x.txt"] }), "must not traverse upward"],
      ["a glob", (d: Declaration) => ({ ...d, paths: ["data/*.txt"] }), "exact path, not a glob"],
      ["a directory path", (d: Declaration) => ({ ...d, paths: ["data/"] }), "normalized file path"],
      ["an unnormalized path", (d: Declaration) => ({ ...d, paths: ["data//a.txt"] }), "normalized file path"],
      ["a .git path", (d: Declaration) => ({ ...d, paths: [".git/config"] }), "must not touch .git"],
      ["a blocked path", (d: Declaration) => ({ ...d, paths: [".env"] }), "blocked by blockedReadPatterns"],
    ])("refuses %s with a named reason", async (_label, mutate, reason) => {
      const result = await read(mutate(valid()));
      expect(result.declaration).toBeNull();
      expect(result.problems.join("\n")).toContain(reason);
    });

    it("refuses text that is not one JSON object", async () => {
      expect((await read(null, "{ nope")).problems[0]).toContain("not valid JSON");
      expect((await read(null, "[]")).problems[0]).toContain("must be a JSON object");
    });

    it("reports a capsule without a Migration section", async () => {
      const { readMigrationDeclaration } = await import("../src/mechanical-reproduction.js");
      await mkdir(path.join(tmp, "plain"), { recursive: true });
      await writeFile(path.join(tmp, "plain/task.md"), "# T\n\n## Validation\n");
      const result = await readMigrationDeclaration(path.join(tmp, "plain"), []);
      expect(result.sectionPresent).toBe(false);
      expect(result.declaration).toBeNull();
    });
  });

  describe("reproduction", () => {
    it(
      "reproduces the generated paths exactly and leaves the project and snapshot untouched",
      async () => {
        const fixture = await mechanicalFixture({ prepare: ['node -e "process.exit(0)"'] });
        const before = await treeDigest(tmp);
        const seen: string[][] = [];

        const result = await reproduce(fixture, async (commands) => {
          seen.push(commands);
          return true;
        });

        expect(result.reasons).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.reproduced).toEqual(["data/a.txt", "data/b.txt"]);
        expect(seen).toEqual([['node -e "process.exit(0)"', RUN]]);
        expect(result.nonGeneratedChanges).toContain(`${fixture.task.taskDir}/task.md`);
        expect(await treeDigest(tmp)).toBe(before);
        await expect(loadJudgeSnapshot(tmp, fixture.candidate)).resolves.toBeDefined();
      },
      SLOW,
    );

    it(
      "names a generated path that differs from the candidate",
      async () => {
        const fixture = await mechanicalFixture({
          editCandidate: async () => writeFile(path.join(tmp, "data/b.txt"), "BETA edited by hand\n"),
        });

        const result = await reproduce(fixture);

        expect(result.ok).toBe(false);
        expect(result.differing).toEqual(["data/b.txt"]);
        expect(result.reproduced).toEqual(["data/a.txt"]);
        expect(result.reasons.join("\n")).toContain("data/b.txt does not match the candidate (bytes)");
      },
      SLOW,
    );

    it(
      "does not accept idempotency: a candidate that equals the base is an error",
      async () => {
        const fixture = await mechanicalFixture({
          baseFiles: { "data/a.txt": "ALPHA\n", "data/b.txt": "BETA\n", "data/c.txt": "g\n", "data/old.txt": "o\n" },
          skipGeneration: true,
        });

        const result = await reproduce(fixture);

        expect(result.ok).toBe(false);
        expect(result.reasons.join("\n")).toContain("Declared path data/a.txt has no change");
        expect(result.reasons.join("\n")).toContain("Declared path data/b.txt has no change");
      },
      SLOW,
    );

    it(
      "compares the executable bit",
      async () => {
        const exec = await mechanicalFixture({
          command: `${RUN} --exec`,
          editCandidate: async () => undefined,
        });
        const execResult = await reproduce(exec);
        expect(execResult.differing).toContain("data/a.txt");
        expect(execResult.reasons.join("\n")).toContain("data/a.txt does not match the candidate (executable bit)");
      },
      SLOW,
    );

    it(
      "detects a changed symlink target without following it",
      async () => {
        const fixture = await mechanicalFixture({
          command: `${RUN} --relink`,
          paths: ["data/a.txt", "data/b.txt", "data/link.txt"],
          editCandidate: async () => {
            await rm(path.join(tmp, "data/link.txt"));
            await symlink("target-c", path.join(tmp, "data/link.txt"));
          },
        });

        const result = await reproduce(fixture);

        expect(result.differing).toEqual(["data/link.txt"]);
        expect(result.reasons.join("\n")).toContain("data/link.txt does not match the candidate (symlink target)");
      },
      SLOW,
    );

    it(
      "reproduces a symlink retarget when the candidate matches",
      async () => {
        const fixture = await mechanicalFixture({
          command: `${RUN} --relink`,
          paths: ["data/a.txt", "data/b.txt", "data/link.txt"],
          editCandidate: async () => {
            await rm(path.join(tmp, "data/link.txt"));
            await symlink("target-b", path.join(tmp, "data/link.txt"));
          },
        });

        const result = await reproduce(fixture);

        expect(result.reasons).toEqual([]);
        expect(result.reproduced).toContain("data/link.txt");
      },
      SLOW,
    );

    it(
      "detects a file replaced by a symlink in the candidate",
      async () => {
        const fixture = await mechanicalFixture({
          editCandidate: async () => {
            await rm(path.join(tmp, "data/a.txt"));
            await symlink("elsewhere", path.join(tmp, "data/a.txt"));
          },
        });

        const result = await reproduce(fixture);

        expect(result.reasons.join("\n")).toContain("data/a.txt does not match the candidate (file type)");
      },
      SLOW,
    );

    it(
      "covers deletions and additions",
      async () => {
        const deleted = await mechanicalFixture({
          command: `${RUN} --delete`,
          paths: ["data/a.txt", "data/b.txt", "data/old.txt"],
          editCandidate: async () => rm(path.join(tmp, "data/old.txt")),
        });
        expect((await reproduce(deleted)).reasons).toEqual([]);
      },
      SLOW,
    );

    it(
      "names a deletion the candidate did not make",
      async () => {
        const kept = await mechanicalFixture({
          command: `${RUN} --delete`,
          paths: ["data/a.txt", "data/b.txt", "data/old.txt"],
        });
        const result = await reproduce(kept);
        expect(result.reasons.join("\n")).toContain("data/old.txt does not match the candidate (existence)");
      },
      SLOW,
    );

    it(
      "names an addition the candidate lacks",
      async () => {
        const fixture = await mechanicalFixture({
          command: `${RUN} --add`,
          paths: ["data/a.txt", "data/b.txt", "data/new.txt"],
        });
        const result = await reproduce(fixture);
        expect(result.reasons.join("\n")).toContain("data/new.txt does not match the candidate (existence)");
      },
      SLOW,
    );

    it(
      "fails on a write outside the declared paths, including an ignored output",
      async () => {
        const fixture = await mechanicalFixture({
          command: `${RUN} --stray`,
          editCandidate: async () => undefined,
        });

        const result = await reproduce(fixture);

        expect(result.ok).toBe(false);
        expect(result.unexpectedWrites).toContain("ignored/out.txt");
        expect(result.reasons.join("\n")).toContain("wrote outside the declared paths");
      },
      SLOW,
    );

    it(
      "fails on a write-then-restore of an undeclared file",
      async () => {
        const fixture = await mechanicalFixture({ command: `${RUN} --touch` });

        const result = await reproduce(fixture);

        expect(result.unexpectedWrites).toEqual(["data/c.txt"]);
        expect(result.ok).toBe(false);
      },
      SLOW,
    );

    it(
      "fails on a file created and deleted in the worktree root",
      async () => {
        const fixture = await mechanicalFixture({ command: `${RUN} --rootblip` });

        const result = await reproduce(fixture);

        expect(result.ok).toBe(false);
        expect(result.unexpectedWrites).toContain(".");
      },
      SLOW,
    );

    it(
      "refuses a declared path behind a symlinked directory",
      async () => {
        const fixture = await mechanicalFixture({
          paths: ["data/a.txt", "linked/x.txt"],
          editCandidate: async () => {
            await symlink("data", path.join(tmp, "linked"));
          },
        });

        const result = await reproduce(fixture);

        expect(result.reasons.join("\n")).toContain("paths entry linked/x.txt has a symlink ancestor: linked");
      },
      SLOW,
    );
  });

  describe("provenance", () => {
    it.each([
      ["a missing review record", "missing", "generator.review"],
      ["a record that is not APPROVED", "needs-changes", "not a verified APPROVED record"],
      ["a record for a commit candidate", "commit-candidate", "immutable SNAPSHOT candidate"],
    ] as const)(
      "refuses %s",
      async (_label, review, reason) => {
        const fixture = await mechanicalFixture({ review });
        const result = await reproduce(fixture);
        expect(result.ok).toBe(false);
        expect(result.commands).toEqual([]);
        expect(result.reasons.join("\n")).toContain(reason);
      },
      SLOW,
    );

    it(
      "refuses a generator whose reviewed content differs from the landed commit",
      async () => {
        const fixture = await mechanicalFixture({ reviewedSource: `${GENERATOR}// reviewed variant\n` });
        const result = await reproduce(fixture);
        expect(result.reasons.join("\n")).toContain("differs between the reviewed content and the landed commit");
      },
      SLOW,
    );

    it(
      "refuses a generator modified after it landed",
      async () => {
        const fixture = await mechanicalFixture({
          afterLanding: async () => {
            await writeFile(path.join(tmp, "tools/gen.mjs"), `${GENERATOR}// tampered\n`);
            await sh("add", "-A");
            await sh("commit", "-m", "tamper with the generator");
          },
        });
        const result = await reproduce(fixture);
        expect(result.reasons.join("\n")).toContain("tools/gen.mjs was modified after the landed commit");
      },
      SLOW,
    );

    it(
      "refuses a generator that exists only in the candidate",
      async () => {
        const fixture = await mechanicalFixture({
          inputs: ["tools/gen.mjs", "tools/bootstrap.mjs"],
          editCandidate: async () => writeFile(path.join(tmp, "tools/bootstrap.mjs"), "export {};\n"),
        });
        const result = await reproduce(fixture);
        expect(result.commands).toEqual([]);
        expect(result.reasons.join("\n")).toContain("tools/bootstrap.mjs is not a regular file in the landed commit");
      },
      SLOW,
    );

    it(
      "refuses a landed commit that is not an ancestor of the base",
      async () => {
        const fixture = await mechanicalFixture();
        const sidelined = await sh("commit-tree", "HEAD^{tree}", "-m", "unrelated");
        await fixture.declare({
          generator: {
            command: RUN,
            commit: sidelined,
            review: ".akrctx/local/judge/generator-approved.json",
            inputs: ["tools/gen.mjs"],
            prepare: [],
          },
          paths: ["data/a.txt", "data/b.txt"],
        });
        const snapshot = await captureJudgeSnapshot(tmp, fixture.task.taskId, "HEAD");
        const result = await reproduce({ ...fixture, candidate: snapshot.candidate });
        expect(result.reasons.join("\n")).toContain("is not an ancestor of the mechanical base");
      },
      SLOW,
    );
  });

  describe("approval and scope", () => {
    it(
      "runs nothing when the operator denies the ordered command list",
      async () => {
        const sentinel = path.join(tmp, "..", `akrctx-sentinel-${process.pid}.txt`);
        const fixture = await mechanicalFixture({
          prepare: [`node -e "require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran')"`],
        });
        let shown: string[] = [];

        const result = await reproduce(fixture, async (commands) => {
          shown = commands;
          return false;
        });

        expect(result.ok).toBe(false);
        expect(shown).toHaveLength(2);
        expect(shown[1]).toBe(RUN);
        expect(await pathExists(sentinel)).toBe(false);
        expect(result.reasons.join("\n")).toContain("Operator approval was not given");
      },
      SLOW,
    );

    it(
      "never runs without an approval callback",
      async () => {
        const fixture = await mechanicalFixture();
        const { reproduceMechanicalChange } = await import("../src/mechanical-reproduction.js");
        const result = await reproduceMechanicalChange(tmp, fixture.task.taskId, {
          base: "HEAD",
          candidate: fixture.candidate,
        });
        expect(result.ok).toBe(false);
        expect(result.reproduced).toEqual([]);
      },
      SLOW,
    );

    it(
      "keeps the foreign-capsule rule: capture needs --include-task and the declaration grants nothing",
      async () => {
        const fixture = await mechanicalFixture();
        const foreign = await runTask("A foreign capsule", { cwd: tmp, nonInteractive: true });
        await writeFile(
          path.join(tmp, foreign.taskDir, "acceptance-criteria.md"),
          "# Acceptance Criteria\n\n- AC-1: Changed.\n",
        );
        await sh("add", "-A");
        await sh("commit", "-m", "foreign capsule");
        const foreignSecond = await runTask("Another foreign capsule", { cwd: tmp, nonInteractive: true });
        await sh("add", "-A");
        await sh("commit", "-m", "second foreign capsule");
        await writeFile(
          path.join(tmp, foreign.taskDir, "acceptance-criteria.md"),
          "# Acceptance Criteria\n\n- AC-1: Edited.\n",
        );
        await writeFile(
          path.join(tmp, foreignSecond.taskDir, "acceptance-criteria.md"),
          "# Acceptance Criteria\n\n- AC-1: Edited.\n",
        );

        await expect(captureJudgeSnapshot(tmp, fixture.task.taskId, "HEAD")).rejects.toThrow(/foreign task capsule/);
        const authorized = await captureJudgeSnapshot(tmp, fixture.task.taskId, "HEAD", [
          foreign.taskId,
          foreignSecond.taskId,
        ]);

        const withoutInclude = await reproduce({ ...fixture, candidate: authorized.candidate });
        expect(withoutInclude.ok).toBe(false);
        expect(withoutInclude.reasons.join("\n")).toContain("different --include-task scope");
      },
      SLOW,
    );

    it(
      "rejects a base that is not the snapshot base",
      async () => {
        const fixture = await mechanicalFixture();
        const { reproduceMechanicalChange } = await import("../src/mechanical-reproduction.js");
        const result = await reproduceMechanicalChange(tmp, fixture.task.taskId, {
          base: "HEAD~1",
          candidate: fixture.candidate,
          approve: async () => true,
        });
        expect(result.reasons.join("\n")).toContain("does not resolve to the snapshot base");
      },
      SLOW,
    );

    it(
      "rejects a candidate that is not a snapshot",
      async () => {
        const fixture = await mechanicalFixture();
        const { reproduceMechanicalChange } = await import("../src/mechanical-reproduction.js");
        const result = await reproduceMechanicalChange(tmp, fixture.task.taskId, {
          base: "HEAD",
          candidate: "WORKTREE",
          approve: async () => true,
        });
        expect(result.reasons.join("\n")).toContain("immutable SNAPSHOT candidate");
      },
      SLOW,
    );
  });

  describe("CLI judge reproduce", () => {
    const runCli = async (args: string[]) => {
      const previousCwd = process.cwd();
      const originalLog = console.log;
      const originalExitCode = process.exitCode;
      const writes: string[] = [];
      console.log = (message?: unknown) => {
        writes.push(String(message));
      };
      try {
        process.chdir(tmp);
        await main(["node", "akrctx", ...args]);
      } finally {
        process.chdir(previousCwd);
        console.log = originalLog;
      }
      const exitCode = process.exitCode;
      process.exitCode = originalExitCode;
      return { output: writes.join("\n"), exitCode };
    };

    it(
      "refuses headless without --approve-commands, then reproduces with the exact list",
      async () => {
        const fixture = await mechanicalFixture();
        const base = ["judge", "reproduce", fixture.task.taskId, "--base", "HEAD", "--candidate", fixture.candidate];

        const refused = await runCli(base);
        expect(refused.exitCode).toBe(1);
        expect(refused.output).toContain("NOT REPRODUCED");
        expect(refused.output).toContain("AKRCTX_GENERATOR_ROOT");

        const wrong = await runCli([...base, "--approve-commands", "echo hi"]);
        expect(wrong.exitCode).toBe(1);

        const approved = await runCli([...base, "--approve-commands", RUN]);
        expect(approved.exitCode).toBeUndefined();
        expect(approved.output).toContain("REPRODUCED");
        expect(approved.output).toContain("process isolation, not an OS sandbox");
      },
      SLOW,
    );

    it(
      "keeps JSON parseable on stdout when headless approval is missing",
      async () => {
        const fixture = await mechanicalFixture();
        const { output, exitCode } = await runCli([
          "judge",
          "reproduce",
          fixture.task.taskId,
          "--base",
          "HEAD",
          "--candidate",
          fixture.candidate,
          "--json",
        ]);
        const report = JSON.parse(output);
        expect(exitCode).toBe(1);
        expect(report.ok).toBe(false);
        expect(report.commands).toEqual([RUN]);
        expect(report.generatorRoot).toEqual(expect.stringContaining("akrctx-generator-tool-"));
      },
      SLOW,
    );

    it(
      "emits JSON and writes no result file",
      async () => {
        const fixture = await mechanicalFixture();
        const before = await treeDigest(tmp);
        const { output, exitCode } = await runCli([
          "judge",
          "reproduce",
          fixture.task.taskId,
          "--base",
          "HEAD",
          "--candidate",
          fixture.candidate,
          "--approve-commands",
          RUN,
          "--json",
        ]);
        expect(exitCode).toBeUndefined();
        expect(JSON.parse(output)).toMatchObject({ ok: true, reproduced: ["data/a.txt", "data/b.txt"] });
        expect(await treeDigest(tmp)).toBe(before);
      },
      SLOW,
    );
  });

  describe("shipped contract", () => {
    it("states what reproduction proves and what it does not", async () => {
      await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
      const readme = await readFile(path.join(tmp, ".akrctx/judge/README.md"), "utf8");
      const section = readme.slice(readme.indexOf("## Mechanical change reproduction"));

      expect(section).toContain("akrctx judge reproduce");
      expect(section).toContain("It does not approve the generator");
      expect(section).toContain("process isolation, not an OS sandbox");
      expect(section).toContain("--include-task");
      expect(section).toContain("only idempotency");
    });
  });

  describe("TASK-075 adapted two-step fixture", () => {
    // Adapted reproduction: the criterion migration generator is placed in the base and reviewed
    // first, then the migration is reproduced. It is not the original command in its historical base.
    it(
      "reproduces the criterion migration of several capsules from a previously reviewed generator",
      async () => {
        const { build } = await import("esbuild");
        const repoRoot = path.resolve(import.meta.dirname, "..");
        const bundle = await build({
          stdin: {
            contents: `import { migrateAcceptanceCriteriaIdentifiers } from "./src/task.ts";\nawait migrateAcceptanceCriteriaIdentifiers(process.cwd());\n`,
            resolveDir: repoRoot,
            loader: "ts",
          },
          bundle: true,
          platform: "node",
          format: "esm",
          write: false,
          banner: {
            js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
          },
        });
        const legacy: Array<{ taskId: string; taskDir: string }> = [];
        const fixture = await mechanicalFixture({
          generatorSource: bundle.outputFiles[0].text,
          baseFiles: { "data/a.txt": "a\n" },
          setupBase: async () => {
            for (const name of ["First legacy capsule", "Second legacy capsule", "Third legacy capsule"]) {
              const created = await runTask(name, { cwd: tmp, nonInteractive: true });
              await writeFile(
                path.join(tmp, created.taskDir, "acceptance-criteria.md"),
                "# Acceptance Criteria\n\n- First behavior.\n- Second behavior.\n",
              );
              legacy.push(created);
            }
          },
          paths: () => legacy.map((capsule) => `${capsule.taskDir}/acceptance-criteria.md`),
          generateCandidate: async () => {
            await migrateAcceptanceCriteriaIdentifiers(tmp);
          },
          includeTaskIds: () => legacy.map((capsule) => capsule.taskId),
        });

        await expect(captureJudgeSnapshot(tmp, fixture.task.taskId, "HEAD")).rejects.toThrow(/foreign task capsule/);
        const before = await treeDigest(tmp);
        const result = await reproduce(fixture);

        expect(result.reasons).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.reproduced).toHaveLength(3);
        expect(await treeDigest(tmp)).toBe(before);
      },
      SLOW,
    );
  });
});
