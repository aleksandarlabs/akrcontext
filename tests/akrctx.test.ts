import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { runCompile } from "../src/compile.js";
import {
  isLocalIgnoreContentSafe,
  runComprehensionDisable,
  runComprehensionEnable,
  runComprehensionStatus,
} from "../src/comprehension.js";
import { normalizeWorkflow, readConfig, setConfigValue } from "../src/config.js";
import { detectTargets } from "../src/detect.js";
import { runDoctor } from "../src/doctor.js";
import { pathExists } from "../src/fs-utils.js";
import { capsuleFiles, upgradesIgnorePath } from "../src/harness-files.js";
import { runInit } from "../src/init.js";
import {
  JUDGE_SCHEMA_VERSION,
  createJudgeScope,
  readClarificationState,
  verifyJudgeRecord,
} from "../src/judge-enforcement.js";
import {
  captureJudgeCatchUpSnapshot,
  captureJudgeSnapshot,
  checkJudgeReviewCurrentState,
  checkJudgeSnapshotCurrentState,
  loadJudgeSnapshot,
  pruneJudgeSnapshots,
} from "../src/judge-snapshot.js";
import { runJudgeDisable, runJudgeEnable, runJudgeStatus } from "../src/judge.js";
import { runRemove } from "../src/remove.js";
import { runStatus } from "../src/status.js";
import { listTasks, recommendWorkflow, removeTask, runTask, showTask, slugify, taskNumber } from "../src/task.js";
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

  it("redacts credentials embedded in a reported validation command", () => {
    const command = sanitizeValidationCommand(
      '  NPM_TOKEN="npm secret"   pnpm test --api-key cli-secret https://private.example/run  ',
    );
    expect(command).toBe("NPM_TOKEN=[REDACTED] pnpm test --api-key [REDACTED] [URL REDACTED]");
    expect(captureValidationError('AWS_SECRET_ACCESS_KEY="aws secret" pnpm test', { code: 1 }).command).toBe(
      "AWS_SECRET_ACCESS_KEY=[REDACTED] pnpm test",
    );
  });

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
      issues: [],
      reviewedAt: new Date().toISOString(),
    };
    const recordPath = path.join(tmp, ".akrctx/local/judge/review.json");
    await mkdir(path.dirname(recordPath), { recursive: true });
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return { task, scope, recordPath };
  }

  it("cryptographically binds an approved review to its task and working-tree boundary", async () => {
    const { scope, recordPath } = await createReviewFixture();

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result).toMatchObject({
      valid: true,
      approved: true,
      verdict: "APPROVED",
      scopeDigest: scope.scopeDigest,
      reasons: [],
      notices: [],
      declaredCommands: ["pnpm test"],
      reexecuted: [],
    });
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
    expect(result.reasons).toContain("Judge record contains failed validation.");
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
      "APPROVED requires a passing run of a command the task capsule declares: pnpm test, pnpm lint.",
    );
  });

  it("accepts APPROVED backed by a command the task capsule declares", async () => {
    const { recordPath } = await createReviewFixture({
      declares: ["pnpm test", "pnpm lint"],
      claims: ["pnpm lint", "echo extra-context"],
    });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.reasons).toEqual([]);
    expect(result.approved).toBe(true);
  });

  it("leaves the declared-command rule dormant for a capsule predating the Validation section", async () => {
    const { recordPath } = await createReviewFixture({ legacyCapsule: true, claims: ["cargo test"] });

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.declaredCommands).toEqual([]);
    expect(result.approved).toBe(true);
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
          issues: [],
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
          issues: [],
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
          issues: [],
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

  it("rejects APPROVED when the record still lists issues", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.issues = ["acceptance criterion 3 is not covered by any test"];
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const result = await verifyJudgeRecord(tmp, recordPath);

    expect(result.approved).toBe(false);
    expect(result.reasons).toContain("APPROVED records must not list unresolved issues.");
  });

  it("applies the approval rules only to APPROVED verdicts", async () => {
    const { recordPath } = await createReviewFixture();
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    record.verdict = "NEEDS_CHANGES";
    record.tests = [];
    record.issues = ["missing edge-case handling in parseRef"];
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
      expect(output).toContain("APPROVED and current");
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
      expect(output).not.toContain("APPROVED and current");
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
      expect(output).not.toContain("APPROVED and current");
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
          issues: [],
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
          issues: [],
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
          issues: [],
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
          issues: [],
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
          issues: [],
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
        issues: [],
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
          issues: [],
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
          issues: [],
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
          issues: [],
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
          issues: ["not approved"],
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
          issues: [],
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

    expect(catchUp.scope.base).toBe(parent.candidate);
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
          issues: [],
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
    expect(catchUp.scope.base).toBe(parent.candidate);
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
          issues: [],
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
          issues: [],
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
      issues: ["still needs work"],
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
          issues: [],
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
    expect(human).not.toContain("scopeDigest");
    expect(json.candidate).toMatch(/^SNAPSHOT:[0-9a-f]{20}$/);
    expect(json.scope.scopeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
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
          issues: [],
          reviewedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    expect(await capture(["judge", "current", recordPath])).toContain("CURRENT");
    await writeFile(path.join(tmp, "app.ts"), "export const value = 3;\n", "utf8");
    const currentJson = JSON.parse(await capture(["judge", "current", recordPath, "--json"]));
    expect(currentJson.status).toBe("NEWER_CHANGES");
    expect(currentJson.changedFiles).toContain("app.ts");

    await capture(["judge", "snapshot", task.taskId]);
    const prunePreview = JSON.parse(await capture(["judge", "prune", "--keep", "1", "--json"]));
    expect(prunePreview.dryRun).toBe(true);
    expect(prunePreview.removed).toHaveLength(1);
    const pruneApplied = JSON.parse(await capture(["judge", "prune", "--keep", "1", "--force", "--json"]));
    expect(pruneApplied.dryRun).toBe(false);
    expect(pruneApplied.removed).toHaveLength(1);
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
