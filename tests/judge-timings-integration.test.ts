import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { runInit } from "../src/init.js";
import { JUDGE_SCHEMA_VERSION, verifyJudgeRecord } from "../src/judge-enforcement.js";
import { captureJudgeSnapshot } from "../src/judge-snapshot.js";
import { withJudgeTimings } from "../src/judge-timings.js";
import { runTask } from "../src/task.js";

it("measures actual isolated verification and preserves command approval", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "akrctx-timing-integration-"));
  const exec = promisify(execFile);
  const command = 'node -e "process.exit(0)"';
  try {
    await runInit({ cwd, target: "codex", nonInteractive: true });
    const task = await runTask("Measure judge timing", { cwd, nonInteractive: true });
    const taskFile = path.join(cwd, task.taskDir, "task.md");
    const original = await readFile(taskFile, "utf8");
    await writeFile(taskFile, original.replace("```\n```", `\`\`\`\n${command}\n\`\`\``));
    await writeFile(path.join(cwd, "app.ts"), "export const value = 1;\n");
    for (const args of [
      ["init"],
      ["config", "user.email", "tests@example.com"],
      ["config", "user.name", "akrctx tests"],
      ["add", "."],
      ["commit", "-m", "base"],
    ]) {
      await exec("git", args, { cwd });
    }
    await writeFile(path.join(cwd, "app.ts"), "export const value = 2;\n");
    const snapshotLines: string[] = [];
    const snapshot = await withJudgeTimings(
      true,
      "snapshot",
      () => captureJudgeSnapshot(cwd, task.taskId, "HEAD"),
      (line) => snapshotLines.push(line),
    );
    expect(snapshotLines).toHaveLength(1);
    const snapshotPhases = (JSON.parse(snapshotLines[0]).phases as Array<{ phase: string }>).map(
      (phase) => phase.phase,
    );
    // Documented contract: dependency copying and the fixed build carry separate labels.
    expect(snapshotPhases).toContain("dependency-copy");
    expect(snapshotPhases).toContain("snapshot-build");
    const recordPath = path.join(cwd, ".akrctx/local/judge/timing-review.json");
    await writeFile(
      recordPath,
      JSON.stringify({
        schemaVersion: JUDGE_SCHEMA_VERSION,
        taskId: task.taskId,
        scope: snapshot.scope,
        verdict: "APPROVED",
        tests: [{ command, status: "passed" }],
        issues: [],
        reviewedAt: new Date().toISOString(),
      }),
    );
    for (const approve of [true, false]) {
      const lines: string[] = [];
      const result = await withJudgeTimings(
        true,
        "verify",
        () =>
          verifyJudgeRecord(cwd, recordPath, {
            runTests: true,
            approve: async (commands) => {
              expect(commands).toEqual([command]);
              return approve;
            },
          }),
        (line) => lines.push(line),
        (value) => value.approved,
      );
      expect(result.approved).toBe(approve);
      expect(result.reexecuted).toEqual(approve ? [{ command, passed: true }] : []);
      expect(lines).toHaveLength(1);
      const phases = JSON.parse(lines[0]).phases as Array<{ phase: string; status: string; commandIndex?: number }>;
      if (approve) {
        expect(phases.map((phase) => phase.phase)).toEqual([
          "verification",
          "approval-wait",
          "workspace-copy",
          "dependency-preparation",
          "validation-command",
          "cleanup",
        ]);
        expect(phases.every((phase) => phase.status === "passed")).toBe(true);
        expect(phases.find((phase) => phase.phase === "validation-command")?.commandIndex).toBe(1);
      } else {
        expect(phases.map((phase) => phase.phase)).toEqual(["verification", "approval-wait"]);
        expect(phases.every((phase) => phase.status === "failed")).toBe(true);
      }
      expect(lines[0]).not.toContain(cwd);
      expect(lines[0]).not.toContain(command);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}, 30_000);
