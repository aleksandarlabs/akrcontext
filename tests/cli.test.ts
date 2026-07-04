import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

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
      // Uses the backwards-compatible positional form (`akrctx task <description>`)
      // since the `task create` subcommand shares option instances with the
      // parent command's fallback action (see D4 dedup note).
      await main(["node", "akrctx", "task", "Fix auth bug", "--json"]);
    } finally {
      restore();
    }
    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.taskId).toBe("TASK-001");
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
});
