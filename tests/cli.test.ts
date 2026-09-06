import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram, main } from "../src/cli.js";
import { runHook } from "../src/hook/index.js";
import { runTraceEnable } from "../src/hook/install.js";
import { runTraceReport } from "../src/hook/report.js";
import { runImplEnable } from "../src/impl.js";
import { runInit } from "../src/init.js";
import { runTask } from "../src/task.js";

let tmp: string;
let previousCwd: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "akrctx-cli-test-"));
  previousCwd = process.cwd();
  process.chdir(tmp);
});

afterEach(async () => {
  process.chdir(previousCwd);
  await rm(tmp, { recursive: true, force: true });
});

function captureLogs(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
    logs.push(String(message));
  });
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  return {
    logs,
    restore: () => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    },
  };
}

function captureHelp(args: string[]): string {
  const program = buildProgram();
  for (const cmd of program.commands) {
    cmd.exitOverride();
    for (const sub of cmd.commands) sub.exitOverride();
  }
  program.exitOverride();
  let out = "";
  program.configureOutput({
    writeOut: (str: string) => {
      out += str;
    },
    writeErr: (str: string) => {
      out += str;
    },
  });
  try {
    program.parse(["node", "akrctx", ...args]);
  } catch (err) {
    // Commander throws its own errors for help/version instead of exiting when
    // exitOverride() is active. Swallow those; rethrow real failures.
    const code = (err as { code?: string }).code;
    if (!code?.startsWith("commander.")) throw err;
  }
  return out;
}

describe("CLI help snapshots", () => {
  it("root --help matches snapshot", () => {
    expect(captureHelp(["--help"])).toMatchSnapshot();
  });

  const subcommands = [
    "init",
    "templates",
    "doctor",
    "status",
    "config",
    "task",
    "compile",
    "comprehension",
    "impl",
    "judge",
    "trace",
    "upgrade",
    "remove",
  ];
  it.each(subcommands)("%s --help matches snapshot", (subcommand) => {
    expect(captureHelp([subcommand, "--help"])).toMatchSnapshot();
  });

  it("judge snapshot help distinguishes the immutable snapshot ID from the review record", () => {
    const help = captureHelp(["judge", "snapshot", "--help"]);
    expect(help).toContain("--allow-empty");
    expect(help).toContain("SNAPSHOT:<id>");
    expect(help).toContain("<review.json>");
  });
});

describe("CLI layer — main(argv)", () => {
  it("init --target codex --json writes a harness and prints JSON", async () => {
    const { logs, restore } = captureLogs();
    try {
      await main(["node", "akrctx", "init", "--target", "codex", "--json"]);
    } finally {
      restore();
    }
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.selectedTargets).toEqual(["codex"]);
  });

  it("doctor --json reports installed state", async () => {
    await main(["node", "akrctx", "init", "--target", "codex", "--json"]);
    const { logs, restore } = captureLogs();
    try {
      await main(["node", "akrctx", "doctor", "--json"]);
    } finally {
      restore();
    }
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.installed).toBe(true);
  });

  it("doctor --fix --json actually repairs a deleted harness file (fails until C1)", async () => {
    await main(["node", "akrctx", "init", "--target", "codex", "--json"]);
    const { rm: rmFile } = await import("node:fs/promises");
    await rmFile(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"), { force: true });

    const { logs, restore } = captureLogs();
    try {
      await main(["node", "akrctx", "doctor", "--fix", "--json"]);
    } finally {
      restore();
    }
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.fixed?.some((f: string) => f.includes("akrctx-doctor/SKILL.md"))).toBe(true);
    const { pathExists } = await import("../src/fs-utils.js");
    expect(await pathExists(path.join(tmp, ".agents/skills/akrctx-doctor/SKILL.md"))).toBe(true);
  });

  it("task create ... --json creates a task capsule", async () => {
    await main(["node", "akrctx", "init", "--target", "codex", "--json"]);
    const { logs, restore } = captureLogs();
    try {
      await main(["node", "akrctx", "task", "create", "Fix auth bug", "--json"]);
    } finally {
      restore();
    }
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.taskId).toBe("TASK-001");
  });

  it("task <description> --json (backwards-compatible positional form) creates a task capsule", async () => {
    await main(["node", "akrctx", "init", "--target", "codex", "--json"]);
    const { logs, restore } = captureLogs();
    try {
      await main(["node", "akrctx", "task", "Fix auth bug", "--json"]);
    } finally {
      restore();
    }
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.taskId).toBe("TASK-001");
  });

  it("task search prints citables matches and an exact JSON array", async () => {
    await main(["node", "akrctx", "init", "--target", "codex", "--json"]);
    await runTask("Search fixture", { cwd: tmp, nonInteractive: true });
    await writeFile(path.join(tmp, ".akrctx/tasks/TASK-001-search-fixture/task.md"), "hallazgo\n", "utf8");

    const human = captureLogs();
    try {
      await main(["node", "akrctx", "task", "search", "hallazgo"]);
    } finally {
      human.restore();
    }
    expect(human.logs.join("\n")).toContain(".akrctx/tasks/TASK-001-search-fixture/task.md:1");
    expect(human.logs.join("\n")).toContain("hallazgo");

    const json = captureLogs();
    try {
      await main(["node", "akrctx", "task", "search", "hallazgo", "--json"]);
    } finally {
      json.restore();
    }
    expect(JSON.parse(json.logs.join("\n"))).toEqual([
      {
        taskId: "TASK-001",
        taskDir: ".akrctx/tasks/TASK-001-search-fixture",
        file: ".akrctx/tasks/TASK-001-search-fixture/task.md",
        line: 1,
        text: "hallazgo",
      },
    ]);

    const empty = captureLogs();
    try {
      await main(["node", "akrctx", "task", "search", "ausente", "--json"]);
    } finally {
      empty.restore();
    }
    expect(JSON.parse(empty.logs.join("\n"))).toEqual([]);
  });

  it("compile ... --json compiles a brief", async () => {
    await main(["node", "akrctx", "init", "--target", "codex", "--json"]);
    await main(["node", "akrctx", "task", "create", "Fix auth bug", "--json"]);
    const { logs, restore } = captureLogs();
    try {
      await main(["node", "akrctx", "compile", "TASK-001", "--target", "codex", "--json"]);
    } finally {
      restore();
    }
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.outputPath).toContain("codex.md");
  });

  it("comprehension enable/status/disable works through the CLI", async () => {
    await main(["node", "akrctx", "init", "--target", "codex", "--json"]);

    for (const [command, expected] of [
      ["enable", true],
      ["status", true],
      ["disable", false],
    ] as const) {
      const { logs, restore } = captureLogs();
      try {
        await main(["node", "akrctx", "comprehension", command, "--json"]);
      } finally {
        restore();
      }
      const parsed = JSON.parse(logs.join("\n"));
      expect(parsed.enabled).toBe(expected);
      expect(parsed.localIgnoreValid).toBe(true);
    }
  });

  it("renders an unknown first-mutation ordering instead of a false zero-percent result", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await runTraceEnable({ cwd: tmp, nonInteractive: true });
    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });
    const emit = (event: string, body: Record<string, unknown>) => runHook(event, JSON.stringify(body), tmp);
    const shell = { tool_name: "Bash", tool_use_id: "shell", tool_input: { command: "ls" } };
    const edit = { tool_name: "Edit", tool_use_id: "edit", tool_input: { file_path: "src/a.ts" } };

    await emit("SessionStart", { session_id: "unknown-order" });
    await emit("PreToolUse", { session_id: "unknown-order", ...shell });
    await emit("PostToolUse", { session_id: "unknown-order", ...shell, tool_result: { exit_code: 0 } });
    await emit("PreToolUse", {
      session_id: "unknown-order",
      tool_name: "Read",
      tool_input: { file_path: `${task.taskDir}/task.md` },
    });
    await emit("PreToolUse", { session_id: "unknown-order", ...edit });
    await emit("PostToolUse", { session_id: "unknown-order", ...edit, tool_result: { exit_code: 0 } });
    await emit("SessionEnd", { session_id: "unknown-order" });

    const { logs, restore } = captureLogs();
    try {
      await main(["node", "akrctx", "trace", "report"]);
    } finally {
      restore();
    }
    const orderingLine = logs.find((line) => line.includes("capsule bound first"));
    expect(orderingLine).toContain("unknown");
    expect(orderingLine).not.toContain("0%");
  });

  it("uses only known first-mutation orderings in the human percentage", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await runTraceEnable({ cwd: tmp, nonInteractive: true });
    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });
    const emit = (event: string, body: Record<string, unknown>) => runHook(event, JSON.stringify(body), tmp);
    const capsule = { tool_name: "Read", tool_input: { file_path: `${task.taskDir}/task.md` } };
    const completedEdit = async (sessionId: string, callId: string) => {
      const edit = {
        session_id: sessionId,
        tool_name: "Edit",
        tool_use_id: callId,
        tool_input: { file_path: "src/a.ts" },
      };
      await emit("PreToolUse", edit);
      await emit("PostToolUse", { ...edit, tool_result: { exit_code: 0 } });
    };

    await emit("SessionStart", { session_id: "ordered-true" });
    await emit("PreToolUse", { session_id: "ordered-true", ...capsule });
    await completedEdit("ordered-true", "true-edit");
    await emit("SessionEnd", { session_id: "ordered-true" });

    await emit("SessionStart", { session_id: "ordered-false" });
    await completedEdit("ordered-false", "false-edit");
    await emit("PreToolUse", { session_id: "ordered-false", ...capsule });
    await emit("SessionEnd", { session_id: "ordered-false" });

    const shell = { tool_name: "Bash", tool_use_id: "unknown-shell", tool_input: { command: "ls" } };
    await emit("SessionStart", { session_id: "ordered-unknown" });
    await emit("PreToolUse", { session_id: "ordered-unknown", ...shell });
    await emit("PostToolUse", { session_id: "ordered-unknown", ...shell, tool_result: { exit_code: 0 } });
    await emit("PreToolUse", { session_id: "ordered-unknown", ...capsule });
    await completedEdit("ordered-unknown", "unknown-edit");
    await emit("SessionEnd", { session_id: "ordered-unknown" });

    expect((await runTraceReport({ cwd: tmp, nonInteractive: true })).totals).toMatchObject({
      orderingKnown: 2,
      orderingUnknown: 1,
      capsuleBeforeFirstMutation: 1,
    });

    const { logs, restore } = captureLogs();
    try {
      await main(["node", "akrctx", "trace", "report"]);
    } finally {
      restore();
    }
    expect(logs.find((line) => line.includes("First-mutation ordering unknown:"))).toContain("1");
    expect(logs.find((line) => line.includes("capsule bound first"))).toContain("1 (50% of 2 known)");
  });

  it("refuses invalid TDD evidence before persistence and reports a non-zero CLI result", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runImplEnable({ cwd: tmp, nonInteractive: true });
    const task = await runTask("TDD evidence refusal", { cwd: tmp, workflow: "TDD", nonInteractive: true });
    await writeFile(
      path.join(tmp, "record.json"),
      JSON.stringify({
        criteria: ["AC-1"],
        files: ["src/a.ts"],
        validation: [{ command: "pnpm test", status: "passed", output: "ok", phase: "green" }],
      }),
      "utf8",
    );

    const { logs, restore } = captureLogs();
    process.exitCode = 0;
    try {
      await main(["node", "akrctx", "impl", "log", task.taskId, "--record", "record.json"]);
    } finally {
      restore();
    }
    expect(process.exitCode).toBe(1);
    expect(logs.join("\n")).toContain("refused");
    expect(logs.join("\n")).not.toContain("round recorded");
    process.exitCode = 0;
  });
});
