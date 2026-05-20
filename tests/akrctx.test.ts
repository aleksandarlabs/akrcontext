import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { recommendWorkflow, runTask, slugify } from "../src/task.js";
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
    expect(result.suggestions[0]).toContain("akrctx init");
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

// ── remove ────────────────────────────────────────────────────────────────────

describe("remove", () => {
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
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(false);
    // Protected file must survive.
    expect(await pathExists(path.join(tmp, "AGENTS.md"))).toBe(true);
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
