import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentWarningTexts, resolveAgent, resolveAgents } from "../src/agents.js";
import { main } from "../src/cli.js";
import { runComprehensionEnable } from "../src/comprehension.js";
import { normalizeConfig, readConfig, setConfigValue } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
import { pathExists } from "../src/fs-utils.js";
import { capsuleFiles } from "../src/harness-files.js";
import {
  implLogPath,
  parseLog,
  parseRecordInput,
  runImplEnable,
  runImplLog,
  runImplStart,
  runImplStatus,
} from "../src/impl.js";
import { runInit } from "../src/init.js";
import { createJudgeScope } from "../src/judge-enforcement.js";
import { runJudgeDisable, runJudgeEnable, runJudgeStatus } from "../src/judge.js";
import { runStatus } from "../src/status.js";
import { runTask } from "../src/task.js";
import { targets as targetNames } from "../src/types.js";
import { runUpgrade } from "../src/upgrade.js";

let tmp: string;
const execFileAsync = promisify(execFile);

/** A committed base, so `judge scope` has a boundary to compute against. */
async function commitBase(): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: tmp });
  await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: tmp });
  await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd: tmp });
  await execFileAsync("git", ["add", "."], { cwd: tmp });
  await execFileAsync("git", ["commit", "-m", "base"], { cwd: tmp });
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "akrctx-agents-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const configPath = () => path.join(tmp, ".akrctx/config.json");

async function readRawConfig(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(configPath(), "utf8"));
}

async function writeRawConfig(mutate: (config: Record<string, never>) => void): Promise<void> {
  const config = await readRawConfig();
  mutate(config as never);
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

// ── schema and compatibility ─────────────────────────────────────────────────

describe("agents configuration", () => {
  it("resolves every field of a fully specified agents block", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, {
        agents: {
          judge: { enabled: true, trigger: "post-implementation", targets: ["claude"], model: { claude: "opus" } },
          comprehension: { enabled: true, trigger: "agent-assessed-significance" },
          implementer: { enabled: true, maxAttempts: 5, model: { codex: "gpt-5-codex" } },
        },
      });
    });

    const config = await readConfig(tmp);
    if (!config) throw new Error("config missing");
    const agents = resolveAgents(config);

    expect(agents.judge.enabled).toBe(true);
    expect(agents.judge.targets).toEqual(["claude"]);
    expect(agents.judge.model.claude).toBe("opus");
    expect(agents.comprehension.enabled).toBe(true);
    expect(agents.implementer.maxAttempts).toBe(5);
    expect(agents.implementer.model.codex).toBe("gpt-5-codex");
  });

  it("warns about an agent entry akrctx has no command behind, without failing", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { reviewer: { enabled: true } } });
    });

    const config = await readConfig(tmp);
    const warnings = agentWarningTexts(config as never);
    expect(warnings.some((text) => /agents.reviewer/.test(text))).toBe(true);
    expect(warnings.some((text) => /judge, comprehension, implementer/.test(text))).toBe(true);
    expect(resolveAgents(config as never).judge.enabled).toBe(false);
  });

  it("preserves an unknown agent entry across a read and a write", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, {
        agents: { reviewer: { enabled: true, model: { claude: "opus" }, depth: 3 }, judge: { enabled: true } },
      });
    });

    await setConfigValue(tmp, "agents.judge.trigger", "post-implementation", false);
    const raw = await readRawConfig();
    expect((raw.agents as Record<string, unknown>).reviewer).toEqual({
      enabled: true,
      model: { claude: "opus" },
      depth: 3,
    });
  });

  it("still rejects a malformed agents block and an invalid attempt budget", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { agents: ["judge"] });
    });
    await expect(readConfig(tmp)).rejects.toThrow(/"agents" must be an object/);

    await writeRawConfig((config) => {
      Object.assign(config, { agents: { implementer: { maxAttempts: 0 } } });
    });
    await expect(readConfig(tmp)).rejects.toThrow(/maxAttempts must be a positive integer/);
  });

  it("treats an empty entry as an absent one", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const before = resolveAgents((await readConfig(tmp)) as never);
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { judge: {}, comprehension: {}, implementer: {} } });
    });

    const after = resolveAgents((await readConfig(tmp)) as never);
    expect(after).toEqual(before);
  });

  it("loads a configuration written before the agents block and behaves identically", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, {
        judge: { enabled: true, trigger: "post-implementation" },
        comprehensionGate: {
          enabled: true,
          trigger: "agent-assessed-significance",
          evaluationMode: "prefer-independent",
        },
      });
      // biome-ignore lint/performance/noDelete: the point of the test is an absent key.
      delete (config as Record<string, unknown>).agents;
    });

    const config = await readConfig(tmp);
    if (!config) throw new Error("config missing");
    expect(config.agents).toBeUndefined();
    expect(resolveAgent(config, "judge").enabled).toBe(true);
    expect(resolveAgent(config, "judge").trigger).toBe("post-implementation");
    expect(resolveAgent(config, "comprehension").enabled).toBe(true);
    expect(resolveAgent(config, "implementer").enabled).toBe(false);
  });

  it("maps the legacy impl key onto agents.implementer", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { impl: { enabled: true } });
    });

    expect(resolveAgent((await readConfig(tmp)) as never, "implementer").enabled).toBe(true);
  });

  it("does not rewrite a legacy configuration when a read-only command runs", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const before = await readFile(configPath(), "utf8");

    await runJudgeStatus({ cwd: tmp, nonInteractive: true });
    await runStatus({ cwd: tmp, nonInteractive: true });
    await runImplStatus("TASK-001", { cwd: tmp, nonInteractive: true });

    expect(await readFile(configPath(), "utf8")).toBe(before);
  });

  it("never migrates or deletes legacy keys on upgrade", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runUpgrade({ cwd: tmp, nonInteractive: true });

    const config = await readRawConfig();
    expect(config.judge).toBeDefined();
    expect(config.comprehensionGate).toBeDefined();
  });

  it("resolves a divergence to agents and reports it in doctor", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, {
        judge: { enabled: false, trigger: "post-implementation" },
        agents: { judge: { enabled: true } },
      });
    });

    const config = await readConfig(tmp);
    expect(resolveAgent(config as never, "judge").enabled).toBe(true);

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    const divergence = doctor.suggestions.find((suggestion) => suggestion.text.includes("disagree"));
    expect(divergence?.severity).toBe("warning");
    expect(divergence?.text).toContain("agents.judge.enabled (true)");
    expect(divergence?.text).toContain("judge.enabled (false)");
    expect(divergence?.text).toContain("is in effect (true)");
  });

  it("keeps the canonical block and the legacy key in step when enable writes", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    const config = await readRawConfig();
    expect((config.agents as Record<string, { enabled: boolean }>).judge.enabled).toBe(true);
    // The legacy key is still what an older akrctx reads. Leaving it contradicting the
    // canonical value would put every install that ran enable into permanent divergence.
    expect((config.judge as { enabled: boolean }).enabled).toBe(true);
    expect(agentWarningTexts((await readConfig(tmp)) as never)).toEqual([]);

    await runJudgeDisable({ cwd: tmp, nonInteractive: true });
    const disabled = await readRawConfig();
    expect((disabled.agents as Record<string, { enabled: boolean }>).judge.enabled).toBe(false);
    expect((disabled.judge as { enabled: boolean }).enabled).toBe(false);
  });

  it("accepts the agents keys through config set and still accepts the existing ones", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });

    await setConfigValue(tmp, "agents.judge.enabled", "true");
    await setConfigValue(tmp, "agents.judge.trigger", "post-review");
    await setConfigValue(tmp, "agents.judge.model.claude", "claude-opus-5");
    await setConfigValue(tmp, "agents.comprehension.targets", "claude, codex");
    await setConfigValue(tmp, "agents.implementer.maxAttempts", "5");
    const result = await setConfigValue(tmp, "defaultWorkflow", "TDD");

    expect(result.defaults.workflow).toBe("TDD");
    const config = (await readConfig(tmp)) as never;
    expect(resolveAgent(config, "judge").model.claude).toBe("claude-opus-5");
    expect(resolveAgent(config, "judge").trigger).toBe("post-review");
    expect(resolveAgent(config, "comprehension").targets.sort()).toEqual(["claude", "codex"]);
    expect(resolveAgent(config, "implementer").maxAttempts).toBe(5);
  });
});

// ── models ───────────────────────────────────────────────────────────────────

describe("agent models", () => {
  it("writes the configured model where each host reads it", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.model.claude", "claude-opus-5");
    await setConfigValue(tmp, "agents.judge.model.copilot", "gpt-5");
    await setConfigValue(tmp, "agents.judge.model.codex", "gpt-5-codex");
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    const claude = await readFile(path.join(tmp, ".claude/agents/akrctx-judge.md"), "utf8");
    const copilot = await readFile(path.join(tmp, ".github/agents/akrctx-judge.agent.md"), "utf8");
    const codex = await readFile(path.join(tmp, ".codex/agents/akrctx-judge.toml"), "utf8");

    expect(claude.split("---")[1]).toContain("model: claude-opus-5");
    expect(copilot.split("---")[1]).toContain("model: gpt-5");
    expect(codex).toContain('model = "gpt-5-codex"');
  });

  it("regenerates a configured model on upgrade so it survives", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.model.claude", "claude-opus-5");

    await runUpgrade({ cwd: tmp, nonInteractive: true });

    const claude = await readFile(path.join(tmp, ".claude/agents/akrctx-judge.md"), "utf8");
    expect(claude).toContain("model: claude-opus-5");
  });

  it("omits the model field entirely when none is configured", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    const claude = await readFile(path.join(tmp, ".claude/agents/akrctx-judge.md"), "utf8");
    const codex = await readFile(path.join(tmp, ".codex/agents/akrctx-judge.toml"), "utf8");
    expect(claude.split("---")[1]).not.toContain("model:");
    expect(codex).not.toContain("model = ");
    expect(codex).toContain("model_reasoning_effort");
  });

  it("writes an unfamiliar model literally and warns instead of failing", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.model.claude", "gtp-5-turbo");
    const enable = await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    const claude = await readFile(path.join(tmp, ".claude/agents/akrctx-judge.md"), "utf8");
    expect(claude).toContain("model: gtp-5-turbo");
    expect(enable.warnings.join("\n")).toContain("gtp-5-turbo");
    expect(enable.warnings.join("\n")).toContain("does not look like a claude model identifier");
  });

  it("surfaces the model warning in enable, doctor, and upgrade", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.model.claude", "gtp-5-turbo");

    const enable = await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    expect(enable.warnings.some((text) => text.includes("agents.judge.model.claude"))).toBe(true);

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(
      doctor.suggestions.some(
        (suggestion) => suggestion.severity === "warning" && suggestion.text.includes("agents.judge.model.claude"),
      ),
    ).toBe(true);

    const upgrade = await runUpgrade({ cwd: tmp, nonInteractive: true });
    expect(upgrade.warnings.some((text) => text.includes("agents.judge.model.claude"))).toBe(true);
  });

  it("names the config path in every generated agent file and drops the hand-edit paragraph", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    await runComprehensionEnable({ cwd: tmp, nonInteractive: true });
    await runImplEnable({ cwd: tmp, nonInteractive: true });

    const files: Array<[string, string]> = [
      [".claude/agents/akrctx-judge.md", "agents.judge.model.claude"],
      [".github/agents/akrctx-judge.agent.md", "agents.judge.model.copilot"],
      [".codex/agents/akrctx-judge.toml", "agents.judge.model.codex"],
      [".claude/agents/akrctx-comprehension.md", "agents.comprehension.model.claude"],
      [".codex/agents/akrctx-implementer.toml", "agents.implementer.model.codex"],
    ];
    for (const [relativePath, key] of files) {
      const content = await readFile(path.join(tmp, relativePath), "utf8");
      expect(content).toContain(key);
      expect(content).not.toContain("Setting a specific model");
      expect(content).not.toContain("add it to the frontmatter of this file");
    }
  });

  it("produces no warning for a recognized model", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.model.claude", "claude-opus-5");
    await setConfigValue(tmp, "agents.judge.model.codex", "o3");
    await setConfigValue(tmp, "agents.judge.model.copilot", "claude-sonnet-4.5");

    expect(agentWarningTexts((await readConfig(tmp)) as never)).toEqual([]);
  });
});

// ── triggers ─────────────────────────────────────────────────────────────────

describe("agent triggers", () => {
  it("propagates an unrecognized trigger with a warning", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.trigger", "before-lunch");

    const config = (await readConfig(tmp)) as never;
    expect(resolveAgent(config, "judge").trigger).toBe("before-lunch");
    expect(agentWarningTexts(config).join("\n")).toContain("akrctx does not recognize");

    const status = await runStatus({ cwd: tmp, nonInteractive: true });
    expect(status.agents.find((agent) => agent.name === "judge")?.trigger).toBe("before-lunch");
    expect(status.warnings.join("\n")).toContain("before-lunch");
  });

  it("produces no warning for a recognized trigger", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.trigger", "post-implementation");

    expect(agentWarningTexts((await readConfig(tmp)) as never)).toEqual([]);
  });

  it("never rejects a judge scope because of the configured trigger", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.trigger", "whenever-it-feels-right");
    const task = await runTask("configurable trigger", { cwd: tmp, nonInteractive: true });
    await commitBase();

    const scope = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");
    expect(scope.taskId).toBe(task.taskId);
  });
});

// ── targets ──────────────────────────────────────────────────────────────────

describe("agent targets", () => {
  it("narrows emission to the listed targets", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.targets", "claude");
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".claude/agents/akrctx-judge.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-judge.toml"))).toBe(false);
    expect(await pathExists(path.join(tmp, ".github/agents/akrctx-judge.agent.md"))).toBe(false);
  });

  it("skips an uninstalled target with a warning rather than failing", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { judge: { targets: ["claude", "codex"] } } });
    });

    const result = await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    expect(result.installedTargets).toEqual(["claude"]);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-judge.toml"))).toBe(false);
    expect(result.warnings.join("\n")).toContain("codex, which is not installed");
  });

  it("skips pi with a warning and states the limitation in doctor", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { judge: { enabled: true, targets: ["claude", "pi"] } } });
    });

    const result = await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    expect(result.warnings.join("\n")).toContain("pi, which has no agent format");
    expect(await pathExists(path.join(tmp, ".pi/agents/akrctx-judge.md"))).toBe(false);

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(doctor.suggestions.some((suggestion) => suggestion.text.includes("pi"))).toBe(true);
  });

  it("never widens emission beyond the installed targets", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { comprehension: { enabled: true, targets: ["claude", "copilot"] } } });
    });

    await runUpgrade({ cwd: tmp, nonInteractive: true });
    expect(await pathExists(path.join(tmp, ".github/agents/akrctx-comprehension.agent.md"))).toBe(false);
  });
});

// ── attempt budget ───────────────────────────────────────────────────────────

describe("attempt budget", () => {
  it("defaults to three", () => {
    const config = normalizeConfig({ targets: ["codex"] });
    expect(resolveAgent(config, "implementer").maxAttempts).toBe(3);
  });

  it("rejects a budget that would otherwise resolve to no limit", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    for (const value of ["zero", 0, -1, 2.5]) {
      await writeRawConfig((config) => {
        Object.assign(config, { agents: { implementer: { maxAttempts: value } } });
      });
      await expect(readConfig(tmp)).rejects.toThrow(/maxAttempts must be a positive integer/);
    }
  });
});

// ── doctor ───────────────────────────────────────────────────────────────────

describe("doctor agent gaps", () => {
  it("fires for a legacy-only config with the feature enabled and files missing", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { judge: { enabled: true, trigger: "post-implementation" } });
    });

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(doctor.suggestions.some((suggestion) => suggestion.text.includes("akrctx judge enable"))).toBe(true);
  });

  it("fires for an agents-only config the raw legacy check would have missed", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, {
        judge: { enabled: false, trigger: "post-implementation" },
        agents: { judge: { enabled: true } },
      });
    });

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(doctor.suggestions.some((suggestion) => suggestion.text.includes("akrctx judge enable"))).toBe(true);
  });

  it("names an unknown agent entry once, as a warning", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { reviewr: { enabled: true } } });
    });

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    const named = doctor.suggestions.filter((suggestion) => suggestion.text.includes("agents.reviewr"));
    expect(named).toHaveLength(1);
    expect(named[0].severity).toBe("warning");
    expect(doctor.missing.some((gap) => gap.includes("reviewr"))).toBe(false);
  });

  it("reports the unknown entry through status and upgrade too", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { reviewr: { enabled: true } } });
    });

    expect((await runStatus({ cwd: tmp })).warnings.some((text) => text.includes("agents.reviewr"))).toBe(true);
    const upgrade = await runUpgrade({ cwd: tmp, nonInteractive: true });
    expect(upgrade.warnings.some((text) => text.includes("agents.reviewr"))).toBe(true);
  });

  it("reports no agent gap or warning on a fresh install", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(doctor.suggestions.filter((suggestion) => suggestion.text.includes("agents."))).toEqual([]);
    expect(doctor.suggestions.filter((suggestion) => suggestion.severity === "warning")).toEqual([]);
  });
});

// ── implementer agent and implementation log ─────────────────────────────────

const round = (overrides: Partial<Parameters<typeof runImplLog>[1]> = {}) => ({
  criteria: ["AC-1"],
  files: ["src/a.ts"],
  validation: [{ command: "pnpm test", status: "passed" as const, output: "602 passed" }],
  ...overrides,
});

describe("akrctx impl", () => {
  it("creates the log, reports round 1, and reports round 3 after two rounds", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    const first = await runImplStart("TASK-001", { cwd: tmp, nonInteractive: true });
    expect(first.round).toBe(1);
    expect(await pathExists(path.join(tmp, implLogPath("TASK-001")))).toBe(true);

    await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });

    expect((await runImplStart("TASK-001", { cwd: tmp, nonInteractive: true })).round).toBe(3);
  });

  it("refuses to start a fourth round and reports the task as stopped", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    for (let index = 0; index < 3; index += 1) {
      await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    }

    const start = await runImplStart("TASK-001", { cwd: tmp, nonInteractive: true });
    expect(start.refused).toBe(true);
    expect(start.round).toBeUndefined();
    expect(start.stopped).toBe(true);
    expect(start.reason).toContain("Attempt budget spent");
  });

  it("appends without rewriting earlier records", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runImplLog("TASK-001", round({ blocker: "first blocker" }), { cwd: tmp, nonInteractive: true });
    const afterFirst = await readFile(path.join(tmp, implLogPath("TASK-001")), "utf8");

    await runImplLog("TASK-001", round({ blocker: "second blocker" }), { cwd: tmp, nonInteractive: true });
    const afterSecond = await readFile(path.join(tmp, implLogPath("TASK-001")), "utf8");

    expect(afterSecond.startsWith(afterFirst)).toBe(true);
  });

  it("enforces the budget in log even when start was never called", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    for (let index = 0; index < 3; index += 1) {
      await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    }

    const fourth = await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    expect(fourth.refused).toBe(true);
    expect(fourth.record).toBeUndefined();
    expect(parseLog(await readFile(path.join(tmp, implLogPath("TASK-001")), "utf8"))).toHaveLength(3);
  });

  it("derives the round at append time, so two starts cannot disagree", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const first = await runImplStart("TASK-001", { cwd: tmp, nonInteractive: true });
    const second = await runImplStart("TASK-001", { cwd: tmp, nonInteractive: true });
    expect(first.round).toBe(second.round);

    const logged = await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    expect(logged.record?.round).toBe(first.round);
    expect(parseLog(await readFile(path.join(tmp, implLogPath("TASK-001")), "utf8"))).toHaveLength(1);
  });

  it("round-trips every field of a record", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const input = {
      criteria: ["AC-1", "AC-4"],
      files: ["src/a.ts", "tests/a.test.ts"],
      validation: [
        { command: "pnpm test", status: "failed" as const, output: "1 failed | 601 passed\nexit code 1" },
        { command: "pnpm lint", status: "not-run" as const, output: "skipped: tests failed first" },
      ],
      blocker: "The criterion contradicts the contract in task.md.",
      decisionNeeded: "Which of the two readings applies?",
      timestamp: "2026-08-06T10:00:00.000Z",
    };

    const result = await runImplLog("TASK-001", input, { cwd: tmp, nonInteractive: true });
    const [parsed] = parseLog(await readFile(path.join(tmp, implLogPath("TASK-001")), "utf8"));

    expect(parsed).toEqual({ round: 1, ...input });
    expect(result.record).toEqual(parsed);
  });

  it("derives the attempt count from the records, not from the caller", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });

    // A caller claiming round 1 does not lower the count.
    const claimed = await runImplLog("TASK-001", { ...round(), round: 1 } as never, { cwd: tmp, nonInteractive: true });
    expect(claimed.record?.round).toBe(3);
    expect((await runImplStatus("TASK-001", { cwd: tmp, nonInteractive: true })).attemptsUsed).toBe(3);
  });

  it("exposes attempts, stopped state, and the last blocker in status", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runImplLog("TASK-001", round({ blocker: "waiting on a decision" }), { cwd: tmp, nonInteractive: true });

    const status = await runImplStatus("TASK-001", { cwd: tmp, nonInteractive: true });
    expect(status).toMatchObject({
      attemptsUsed: 1,
      attemptsRemaining: 2,
      maxAttempts: 3,
      stopped: false,
      lastBlocker: "waiting on a decision",
      readable: true,
    });
  });

  it("reports a truncated log as unreadable rather than as zero attempts", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    const logFile = path.join(tmp, implLogPath("TASK-001"));
    await writeFile(logFile, `${(await readFile(logFile, "utf8")).split("```json")[0]}\n`, "utf8");

    const status = await runImplStatus("TASK-001", { cwd: tmp, nonInteractive: true });
    expect(status.readable).toBe(false);
    // Not 0: a consumer reading a count from an untrustworthy log would conclude no attempt
    // was ever made, which is exactly what this case exists to prevent.
    expect(status.attemptsUsed).toBeNull();
    expect(status.attemptsRemaining).toBe(0);
    expect(status.stopped).toBe(true);

    const start = await runImplStart("TASK-001", { cwd: tmp, nonInteractive: true });
    expect(start.refused).toBe(true);
    expect(start.reason).toContain("unreadable");
  });

  it("honours a configured attempt budget", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await setConfigValue(tmp, "agents.implementer.maxAttempts", "1");
    await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });

    const second = await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    expect(second.refused).toBe(true);
  });

  it("keeps the implementation log out of the review boundary and off taskDigest", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const task = await runTask("digest invariance", { cwd: tmp, nonInteractive: true });
    await commitBase();

    const before = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");
    await runImplLog(task.taskId, round(), { cwd: tmp, nonInteractive: true });
    const after = await createJudgeScope(tmp, task.taskId, "HEAD", "WORKTREE");

    expect(after.taskDigest).toBe(before.taskDigest);
    expect(after.changeDigest).toBe(before.changeDigest);
    expect(after.scopeDigest).toBe(before.scopeDigest);
    expect(after.changedFiles).not.toContain(implLogPath(task.taskId));
    expect(capsuleFiles).toHaveLength(5);
  });
});

describe("implementer agent files", () => {
  it("writes the three host formats and records the intent", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await runImplEnable({ cwd: tmp, nonInteractive: true });

    for (const relativePath of [
      ".claude/agents/akrctx-implementer.md",
      ".github/agents/akrctx-implementer.agent.md",
      ".codex/agents/akrctx-implementer.toml",
    ]) {
      expect(await pathExists(path.join(tmp, relativePath))).toBe(true);
    }
    expect(resolveAgent((await readConfig(tmp)) as never, "implementer").enabled).toBe(true);
  });

  it("writes no implementer file on init alone, and treats an absent key as off", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });

    expect(await pathExists(path.join(tmp, ".claude/agents/akrctx-implementer.md"))).toBe(false);
    const config = await readRawConfig();
    expect(config.impl).toBeUndefined();
    expect(resolveAgent((await readConfig(tmp)) as never, "implementer").enabled).toBe(false);
  });

  it("regenerates on upgrade only when enabled", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await runUpgrade({ cwd: tmp, nonInteractive: true });
    expect(await pathExists(path.join(tmp, ".claude/agents/akrctx-implementer.md"))).toBe(false);

    await runImplEnable({ cwd: tmp, nonInteractive: true });
    await rm(path.join(tmp, ".claude/agents/akrctx-implementer.md"));
    await runUpgrade({ cwd: tmp, nonInteractive: true });
    expect(await pathExists(path.join(tmp, ".claude/agents/akrctx-implementer.md"))).toBe(true);
  });

  it("carries identical substance across the three host formats", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await runImplEnable({ cwd: tmp, nonInteractive: true });

    const claims = [
      "acceptance-criteria.md",
      "akrctx impl start",
      "akrctx impl log",
      "Never write any of the five capsule files",
      "protected instruction files",
      "cannot enforce",
      "declared workflow",
    ];
    for (const relativePath of [
      ".claude/agents/akrctx-implementer.md",
      ".github/agents/akrctx-implementer.agent.md",
      ".codex/agents/akrctx-implementer.toml",
    ]) {
      const content = await readFile(path.join(tmp, relativePath), "utf8");
      for (const claim of claims) expect(content).toContain(claim);
    }
  });

  it("reports a doctor gap when enabled with the agent files missing", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await runImplEnable({ cwd: tmp, nonInteractive: true });
    await rm(path.join(tmp, ".claude/agents/akrctx-implementer.md"));

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    expect(doctor.suggestions.some((suggestion) => suggestion.text.includes("akrctx impl enable"))).toBe(true);
    expect(doctor.missing).not.toContain(".claude/agents/akrctx-implementer.md");
  });
});

// ── implementation log privacy ───────────────────────────────────────────────

describe("implementation log privacy", () => {
  const localIgnore = () => path.join(tmp, ".akrctx/local/.gitignore");

  it("is satisfied by a fresh install with no extra step", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await expect(runImplEnable({ cwd: tmp, nonInteractive: true })).resolves.toBeTruthy();
    expect((await runImplStart("TASK-001", { cwd: tmp, nonInteractive: true })).refused).toBe(false);
  });

  it("refuses to enable the implementer when the local ignore is missing", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(localIgnore());

    await expect(runImplEnable({ cwd: tmp, nonInteractive: true })).rejects.toThrow(/akrctx doctor --fix/);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-implementer.toml"))).toBe(false);
    expect(resolveAgent((await readConfig(tmp)) as never, "implementer").enabled).toBe(false);
  });

  it("refuses to enable the implementer when the local ignore no longer excludes the log", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeFile(localIgnore(), "comprehension/\n", "utf8");

    await expect(runImplEnable({ cwd: tmp, nonInteractive: true })).rejects.toThrow(/akrctx doctor --fix/);
  });

  it("refuses to open a log the review boundary would pick up", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await rm(localIgnore());

    const started = await runImplStart("TASK-001", { cwd: tmp, nonInteractive: true });
    expect(started.refused).toBe(true);
    expect(started.reason).toMatch(/no longer ignores/);
    expect(await pathExists(path.join(tmp, implLogPath("TASK-001")))).toBe(false);
  });

  it("refuses to append to a log the review boundary would pick up", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    await rm(localIgnore());

    const logged = await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    expect(logged.refused).toBe(true);
    expect(logged.record).toBeUndefined();
    expect(parseLog(await readFile(path.join(tmp, implLogPath("TASK-001")), "utf8"))).toHaveLength(1);
  });

  it("does not present the task as open while the log is exposed", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runImplLog("TASK-001", round(), { cwd: tmp, nonInteractive: true });
    await rm(localIgnore());

    const status = await runImplStatus("TASK-001", { cwd: tmp, nonInteractive: true });
    expect(status.stopped).toBe(true);
    expect(status.attemptsRemaining).toBe(0);
    expect(status.error).toMatch(/no longer ignores/);
  });
});

// ── record validation ────────────────────────────────────────────────────────

describe("impl log record validation", () => {
  const valid = {
    criteria: ["AC-1"],
    files: ["src/a.ts"],
    validation: [{ command: "pnpm test", status: "passed", output: "648 passed" }],
  };

  it("accepts a well-formed record", () => {
    expect(parseRecordInput(valid)).toMatchObject(valid);
  });

  it("names the offending field instead of accepting it", () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ ...valid, criteria: "AC-1" }, /criteria/],
      [{ ...valid, files: [1, 2] }, /files/],
      [{ ...valid, validation: "pnpm test" }, /validation/],
      [{ ...valid, validation: [{ status: "passed", output: "" }] }, /command/],
      [{ ...valid, validation: [{ command: "pnpm test", status: "green", output: "" }] }, /status/],
      [{ ...valid, validation: [{ command: "pnpm test", status: "passed", output: 12 }] }, /output/],
      [{ ...valid, blocker: 7 }, /blocker/],
      [{ ...valid, timestamp: "yesterday" }, /timestamp/],
      [{ ...valid, critera: ["AC-1"] }, /critera/],
      ["not a record", /object/],
    ];
    for (const [record, expected] of cases) {
      expect(() => parseRecordInput(record), JSON.stringify(record)).toThrow(expected);
    }
  });

  it("accepts an ISO timestamp and drops a supplied round", () => {
    const parsed = parseRecordInput({ ...valid, timestamp: "2026-08-07T09:00:00.000Z", round: 9 });
    expect(parsed.timestamp).toBe("2026-08-07T09:00:00.000Z");
    expect(parsed).not.toHaveProperty("round");
  });

  it("reaches the store through the CLI, so a bad record is never appended", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const file = path.join(tmp, "record.json");
    await writeFile(file, JSON.stringify({ ...valid, criteria: "AC-1" }), "utf8");

    const previousCwd = process.cwd();
    try {
      process.chdir(tmp);
      await expect(main(["node", "akrctx", "impl", "log", "TASK-001", "--record", file])).rejects.toThrow(/criteria/);
    } finally {
      process.chdir(previousCwd);
    }
    expect(await pathExists(path.join(tmp, implLogPath("TASK-001")))).toBe(false);
  });
});

// ── enable guards ────────────────────────────────────────────────────────────

describe("enable guards", () => {
  it("refuses to enable the judge when no installed target has a judge format", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { judge: { targets: ["pi"] } } });
    });

    await expect(runJudgeEnable({ cwd: tmp, nonInteractive: true })).rejects.toThrow(/judge/i);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-judge.toml"))).toBe(false);
    expect(resolveAgent((await readConfig(tmp)) as never, "judge").enabled).toBe(false);
  });

  it("still enables the judge for a resolvable target", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    const result = await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    expect(result.installedTargets).toEqual(["codex"]);
    expect(await pathExists(path.join(tmp, ".codex/agents/akrctx-judge.toml"))).toBe(true);
  });
});

// ── regeneration and write reporting ─────────────────────────────────────────

describe("agent file regeneration", () => {
  /** The sequence from manual QA: enable, notice the model is missing, set it, enable again. */
  it("applies a model set after the agent file already exists", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    const file = path.join(tmp, ".github/agents/akrctx-implementer.agent.md");

    await runImplEnable({ cwd: tmp, nonInteractive: true });
    expect(await readFile(file, "utf8")).not.toContain("model:");

    await setConfigValue(tmp, "agents.implementer.model.copilot", "Claude Opus 4.5", false);
    const again = await runImplEnable({ cwd: tmp, nonInteractive: true });

    const content = await readFile(file, "utf8");
    expect(content).toContain('model: "Claude Opus 4.5"');
    expect(again.writes.find((write) => write.path.endsWith("akrctx-implementer.agent.md"))?.kind).toBe("update");
  });

  it("applies a model set after the fact for the judge and the comprehension agent", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });

    await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    await setConfigValue(tmp, "agents.judge.model.copilot", "GPT-5.2", false);
    await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    expect(await readFile(path.join(tmp, ".github/agents/akrctx-judge.agent.md"), "utf8")).toContain("model: GPT-5.2");

    await runComprehensionEnable({ cwd: tmp, nonInteractive: true });
    await setConfigValue(tmp, "agents.comprehension.model.copilot", "GPT-5.2", false);
    await runComprehensionEnable({ cwd: tmp, nonInteractive: true });
    expect(await readFile(path.join(tmp, ".github/agents/akrctx-comprehension.agent.md"), "utf8")).toContain(
      "model: GPT-5.2",
    );
  });

  it("reports an unchanged re-enable as preserved and rewrites nothing", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    const file = path.join(tmp, ".github/agents/akrctx-implementer.agent.md");

    await runImplEnable({ cwd: tmp, nonInteractive: true });
    const before = await readFile(file, "utf8");

    const again = await runImplEnable({ cwd: tmp, nonInteractive: true });
    expect(again.writes.find((write) => write.path.endsWith("akrctx-implementer.agent.md"))?.kind).toBe("preserve");
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("writes nothing on a dry run even though it regenerates", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await runImplEnable({ cwd: tmp, nonInteractive: true });
    await setConfigValue(tmp, "agents.implementer.model.copilot", "GPT-5.2", false);

    await runImplEnable({ cwd: tmp, nonInteractive: true, dryRun: true });
    expect(await readFile(path.join(tmp, ".github/agents/akrctx-implementer.agent.md"), "utf8")).not.toContain(
      "model:",
    );
  });

  it("still protects a protected instruction file", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    const instructions = path.join(tmp, ".github/copilot-instructions.md");
    await writeFile(instructions, "# Mine\n", "utf8");

    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true, force: true });
    expect(await readFile(instructions, "utf8")).toBe("# Mine\n");
  });
});

describe("write reporting", () => {
  async function capture(run: () => Promise<unknown>): Promise<string> {
    const lines: string[] = [];
    const original = console.log;
    console.log = (message?: unknown) => {
      lines.push(String(message));
    };
    try {
      await run();
    } finally {
      console.log = original;
    }
    return lines.join("\n");
  }

  it("does not render a preserved file with the creation marker", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    const previousCwd = process.cwd();

    const output = await capture(async () => {
      try {
        process.chdir(tmp);
        await main(["node", "akrctx", "impl", "enable"]);
        await main(["node", "akrctx", "impl", "enable"]);
      } finally {
        process.chdir(previousCwd);
      }
    });

    const preserved = output
      .split("\n")
      .filter((line) => line.includes("akrctx-implementer.agent.md"))
      .at(-1);
    expect(preserved).toBeDefined();
    expect(preserved).not.toContain("+");
    expect(preserved).toContain("=");
  });
});

// ── repeat init ──────────────────────────────────────────────────────────────

describe("init target accumulation", () => {
  it("adds a second target instead of ignoring it", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const config = await readConfig(tmp);
    expect(config?.targets).toEqual(["copilot", "claude"]);

    const enable = await runJudgeEnable({ cwd: tmp, nonInteractive: true });
    expect(enable.installedTargets).toEqual(["copilot", "claude"]);
    expect(await pathExists(path.join(tmp, ".claude/agents/akrctx-judge.md"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".github/agents/akrctx-judge.agent.md"))).toBe(true);
    expect(enable.warnings.join("\n")).not.toContain("not installed");
  });

  it("does not duplicate a target already listed", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });

    expect((await readConfig(tmp))?.targets).toEqual(["copilot"]);
  });

  it("never shortens the target list", async () => {
    await runInit({ cwd: tmp, target: "all", nonInteractive: true });
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });

    expect((await readConfig(tmp))?.targets).toEqual([...targetNames]);
  });

  it("keeps the first install's default target and the user's own settings", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await setConfigValue(tmp, "defaults.workflow", "TDD", false);
    await writeRawConfig((config) => {
      Object.assign(config, { agents: { reviewr: { enabled: true, depth: 3 } } });
    });

    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const config = await readConfig(tmp);
    expect(config?.defaults.target).toBe("copilot");
    expect(config?.defaults.workflow).toBe("TDD");
    expect(config?.profile).toBe("default");
    expect((await readRawConfig()).agents).toMatchObject({ reviewr: { enabled: true, depth: 3 } });
  });

  it("leaves doctor and the resolved config agreeing", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const doctor = await runDoctor({ cwd: tmp, nonInteractive: true });
    const config = await readConfig(tmp);
    expect([...doctor.installedTargets].sort()).toEqual([...(config?.targets ?? [])].sort());
    expect(agentWarningTexts(config as never).join("\n")).not.toContain("not installed");
  });

  it("writes nothing on a dry run", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true, dryRun: true });

    expect((await readConfig(tmp))?.targets).toEqual(["copilot"]);
  });

  it("survives doctor --fix, which re-runs init per detected target", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    await runDoctor({ cwd: tmp, nonInteractive: true, fix: true });
    expect([...((await readConfig(tmp))?.targets ?? [])].sort()).toEqual(["claude", "copilot"]);
  });
});
