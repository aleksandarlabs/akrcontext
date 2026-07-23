import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { normalizeWorkflow, readConfig, readConfigStrict, setConfigValue } from "../src/config.js";
import { detectTargets } from "../src/detect.js";
import { runDoctor } from "../src/doctor.js";
import { pathExists } from "../src/fs-utils.js";
import { runInit } from "../src/init.js";
import { createJudgeScope, verifyJudgeRecord } from "../src/judge-enforcement.js";
import { runJudgeDisable, runJudgeEnable, runJudgeStatus } from "../src/judge.js";
import { runRemove } from "../src/remove.js";
import { runStatus } from "../src/status.js";
import { listTasks, recommendWorkflow, removeTask, runTask, showTask, slugify, taskNumber } from "../src/task.js";
import { runTemplateApply, runTemplateStatus } from "../src/template-apply.js";
import { workflows } from "../src/types.js";
import { runUpgrade } from "../src/upgrade.js";
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
      trigger: "agent-assessed-significance",
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
      trigger: "agent-assessed-significance",
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

  it("readConfig returns undefined (not throws) when config.json is corrupted", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/config.json"), "{ broken json", "utf8");

    const config = await readConfig(tmp);
    expect(config).toBeUndefined();
  });

  it("readConfigStrict throws on corrupt JSON instead of returning undefined", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/config.json"), "{ broken json", "utf8");

    await expect(readConfigStrict(tmp)).rejects.toThrow("invalid JSON");
  });

  it("readConfigStrict returns undefined when config.json is simply missing", async () => {
    await expect(readConfigStrict(tmp)).resolves.toBeUndefined();
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

  it("installs comprehension as an independent agent instead of a main-context skill", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runComprehensionEnable({ cwd: tmp, nonInteractive: true });

    const agent = await readFile(path.join(tmp, ".codex/agents/akrctx-comprehension.toml"), "utf8");

    expect(agent).toContain('sandbox_mode = "read-only"');
    expect(agent).toContain('model_reasoning_effort = "high"');
    expect(agent).toContain("Do not inherit the implementing agent's reasoning");
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
  async function createReviewFixture() {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Enforce judge approvals", { cwd: tmp, nonInteractive: true });
    await writeFile(path.join(tmp, "app.ts"), "export const value = 1;\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
    await writeFile(path.join(tmp, "app.ts"), "export const value = 2;\n", "utf8");
    const scope = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");
    const record = {
      schemaVersion: 1,
      taskId: task.taskId,
      scope,
      verdict: "APPROVED",
      tests: [{ command: "pnpm test", status: "passed" }],
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

    expect(result).toEqual({
      valid: true,
      approved: true,
      verdict: "APPROVED",
      scopeDigest: scope.scopeDigest,
      reasons: [],
    });
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

  it("refuses to fingerprint untracked files blocked by policy", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("Protect judge scope", { cwd: tmp, nonInteractive: true });
    await execFileAsync("git", ["init"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
    await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
    await execFileAsync("git", ["add", "."], { cwd: tmp });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
    await writeFile(path.join(tmp, ".env"), "SECRET=not-read\n", "utf8");

    await expect(createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE")).rejects.toThrow("blocked by policy: .env");
  });

  it("invalidates an approved review when the task capsule changes", async () => {
    const { task, recordPath } = await createReviewFixture();
    await writeFile(path.join(tmp, task.taskDir, "task.md"), "# Changed goal\n", "utf8");

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
    expect(diagnosis.missing.some((gap) => gap.includes("comprehensionGate.trigger"))).toBe(true);

    await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });
    const repaired = JSON.parse(await readFile(configPath, "utf8"));
    expect(repaired.comprehensionGate).toEqual({
      enabled: true,
      trigger: "agent-assessed-significance",
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
