import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { runCompile } from "../src/compile.js";
import { normalizeWorkflow, readConfig, setConfigValue } from "../src/config.js";
import { detectTargets } from "../src/detect.js";
import { runDoctor } from "../src/doctor.js";
import { pathExists } from "../src/fs-utils.js";
import { runInit } from "../src/init.js";
import { runJudgeDisable, runJudgeEnable, runJudgeStatus } from "../src/judge.js";
import { runRemove } from "../src/remove.js";
import { runStatus } from "../src/status.js";
import { listTasks, recommendWorkflow, removeTask, runTask, showTask, slugify } from "../src/task.js";
import { workflows } from "../src/types.js";
import { CLI_VERSION } from "../src/version.js";

let tmp: string;

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
    const config = await readConfig(tmp);
    expect(config?.defaults.workflow).toBe("task-fit");
    expect(config?.workflowRules.apiOrContract).toBe("SDD+TDD");
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".akrctx/wiki/write-policy.md"))).toBe(true);
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

    const log = await readFile(path.join(tmp, ".akrctx/wiki/log.md"), "utf8");
    expect(log).toContain("type: akrctx-wiki-log");
    expect(log).toMatch(/^---\n[\s\S]*# Log\n\n## \d{4}-\d{2}-\d{2}\n- akrctx initialized\.\n$/);
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
    expect(policy.enforcement.requireTaskCapsule).toBe(true);
    expect(policy.enforcement.requireWorkflowReason).toBe(true);
    expect(policy.enforcement.requireAcceptanceCriteria).toBe(true);
    expect(policy.enforcement.requireReviewChecklist).toBe(true);
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
      JSON.stringify({ defaults: { workflow: "SDD+TDD", contextBudget: "thorough" } }),
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

  it("defaults to codex in non-interactive mode with no detected target", async () => {
    const result = await runInit({ cwd: tmp, dryRun: true, nonInteractive: true });

    expect(result.target).toBe("codex");
    expect(result.fallbackUsed).toBe(true);
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
    expect(result.suggestions[0]).toContain("akrctx init");
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
    expect(result.suggestions.some((suggestion) => suggestion.includes("file(s) missing"))).toBe(true);
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

  it("shows installed targets and task count after init and task creation", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runTask("Fix auth bug", { cwd: tmp, nonInteractive: true });
    await runTask("Add user schema", { cwd: tmp, nonInteractive: true });

    const result = await runStatus({ cwd: tmp, nonInteractive: true });

    expect(result.installed).toBe(true);
    expect(result.targets).toContain("codex");
    expect(result.taskCount).toBe(2);
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

  it("--all --force removes .akrctx directory", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    await runRemove({ cwd: tmp, force: true, all: true, nonInteractive: true } as Parameters<typeof runRemove>[0]);

    expect(await pathExists(path.join(tmp, ".akrctx"))).toBe(false);
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
  it("rewrites akrctx-owned skill files without touching protected AGENTS.md", async () => {
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

  it("doctor detects version drift and suggests upgrade", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const configPath = path.join(tmp, ".akrctx/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.installedVersion = "0.0.1";
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(result.suggestions.some((s) => s.includes("akrctx upgrade"))).toBe(true);
    expect(result.suggestions.some((s) => s.includes("0.0.1"))).toBe(true);
  });
});

// ── judge ─────────────────────────────────────────────────────────────────────

describe("judge", () => {
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

    expect(result.suggestions.some((s) => s.includes("akrctx judge enable"))).toBe(true);
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
    policy.blockedReadPatterns = [".env"];
    await writeFile(policyPath, JSON.stringify(policy, null, 2), "utf8");

    const result = await runDoctor({ cwd: tmp, fix: true, nonInteractive: true });

    expect(result.fixed).toContain(".akrctx/policy.json");
    const fixed = JSON.parse(await readFile(policyPath, "utf8"));
    expect(fixed.writePolicy).toBeDefined();
    expect(fixed.blockedReadPatterns).toContain(".env");
    expect(fixed.blockedReadPatterns).toContain("*.pem");
  });

  it("dry-run fix does not write files but reports what would be fixed", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"), { force: true });

    const result = await runDoctor({ cwd: tmp, fix: true, dryRun: true, nonInteractive: true });

    expect(result.fixed?.some((f) => f.includes("akrctx-doctor/SKILL.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(false);
  });
});
