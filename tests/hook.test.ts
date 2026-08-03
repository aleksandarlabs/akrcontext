import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHook } from "../src/hook/index.js";
import { TRACE_MARKER as traceMarker } from "../src/hook/install.js";
import { normalizePayload } from "../src/hook/payload.js";
import { runTraceReport } from "../src/hook/report.js";
import { readTrace, traceFilePath } from "../src/hook/trace.js";
import { runInit } from "../src/init.js";
import { runTask } from "../src/task.js";

let tmp: string;
const execFileAsync = promisify(execFile);

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "akrctx-hook-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const payload = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ session_id: "s-1", cwd: "/anywhere", ...extra });

// ── failure contract ─────────────────────────────────────────────────────────

describe("hook failure contract", () => {
  // This is the load-bearing block. On Copilot a non-zero exit from preToolUse denies the
  // tool call, so a hook that throws on bad input would block every tool call in the
  // session. There must be no input that produces a non-zero exit or a thrown error.
  const hostileInputs: Array<[string, string]> = [
    ["empty stdin", ""],
    ["whitespace only", "   \n  "],
    ["malformed JSON", "{ not json"],
    ["JSON null", "null"],
    ["JSON array", "[1,2,3]"],
    ["JSON string", '"just a string"'],
    ["JSON number", "42"],
    ["object with no known keys", '{"totally":"unexpected"}'],
    ["session_id of the wrong type", '{"session_id":{"nested":true}}'],
    ["tool_input that is not an object", '{"session_id":"s","tool_name":"Bash","tool_input":7}'],
    ["deeply nested garbage", `{"session_id":"s","tool_input":${JSON.stringify({ a: { b: { c: [1, 2, 3] } } })}}`],
  ];

  it.each(hostileInputs)("survives %s without throwing", async (_label, raw) => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    await expect(runHook("PreToolUse", raw, tmp)).resolves.toBeDefined();
  });

  it.each(hostileInputs)("emits no permission decision for %s", async (_label, raw) => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const result = await runHook("PreToolUse", raw, tmp);

    expect(result.decision).toBeUndefined();
    expect(JSON.stringify(result.body ?? {})).not.toContain("permissionDecision");
  });

  it("survives an unknown event name", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    await expect(runHook("SomeFutureEvent", payload(), tmp)).resolves.toBeDefined();
  });

  it("survives a repository with no akrctx installed", async () => {
    await expect(runHook("SessionStart", payload(), tmp)).resolves.toBeDefined();
  });

  it("survives an unwritable trace directory", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    // A plain file where the traces directory must go: every write will fail.
    await writeFile(path.join(tmp, ".akrctx/local/traces"), "not a directory\n", "utf8");

    await expect(runHook("SessionStart", payload(), tmp)).resolves.toBeDefined();
  });

  it("exits zero from the CLI even on malformed input", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);

    const { stdout } = await runCli(tmp, "{ not json");

    expect(stdout).not.toContain("permissionDecision");
  });

  it("stays well inside the tightest host budget", async () => {
    // Claude Code gives SessionEnd hooks a shared 1.5s budget — the tightest bound any
    // host imposes. Copilot recommends under 5s and fails open at 30s.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    const started = Date.now();
    for (let i = 0; i < 20; i++) {
      await runHook("PreToolUse", payload({ tool_name: "Bash", tool_input: { command: "ls" } }), tmp);
    }
    const perCall = (Date.now() - started) / 20;

    expect(perCall).toBeLessThan(50);
  });
});

// ── normalization ────────────────────────────────────────────────────────────

describe("payload normalization", () => {
  it("normalizes the snake_case dialect", () => {
    const event = normalizePayload("PreToolUse", {
      session_id: "s-1",
      hook_event_name: "PreToolUse",
      cwd: "/repo",
      tool_name: "Edit",
      tool_input: { file_path: "/repo/src/a.ts" },
    });

    expect(event.sessionId).toBe("s-1");
    expect(event.event).toBe("pre-tool");
    expect(event.toolName).toBe("Edit");
    expect(event.toolInput).toEqual({ file_path: "/repo/src/a.ts" });
  });

  it("normalizes the camelCase dialect to the same shape", () => {
    const snake = normalizePayload("PreToolUse", {
      session_id: "s-1",
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/repo/src/a.ts" },
    });
    const camel = normalizePayload("preToolUse", {
      sessionId: "s-1",
      hookEventName: "preToolUse",
      toolName: "Edit",
      toolArgs: { file_path: "/repo/src/a.ts" },
    });

    expect(camel).toEqual(snake);
  });

  it("takes the event from argv when the payload omits it", () => {
    expect(normalizePayload("SessionStart", { session_id: "s" }).event).toBe("session-start");
  });

  it("prefers the payload event name over argv", () => {
    // The host knows better than the wiring: if a config file names the wrong event, the
    // payload is the authority.
    expect(normalizePayload("SessionStart", { hook_event_name: "PostToolUse" }).event).toBe("post-tool");
  });

  it.each([
    ["SessionStart", "session-start"],
    ["sessionStart", "session-start"],
    ["PreToolUse", "pre-tool"],
    ["preToolUse", "pre-tool"],
    ["PostToolUse", "post-tool"],
    ["postToolUse", "post-tool"],
    ["Stop", "stop"],
    ["agentStop", "stop"],
    ["SessionEnd", "session-end"],
    ["sessionEnd", "session-end"],
  ])("maps host event %s to %s", (hostEvent, expected) => {
    expect(normalizePayload(hostEvent, {}).event).toBe(expected);
  });

  it("records an unrecognized event as other rather than dropping it", () => {
    expect(normalizePayload("SomeFutureEvent", { session_id: "s" }).event).toBe("other");
  });

  it("does not invent a successful mutation for an unrecognized event", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    await runHook("SomeFutureEvent", payload({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" } }), tmp);
    await runHook("SessionEnd", payload(), tmp);

    const trace = await readTrace(tmp, "s-1");
    expect(trace.observations[0].event).toBe("other");
    expect(trace.observations[0].outcome).toBeUndefined();
    expect((await runTraceReport({ cwd: tmp, nonInteractive: true })).totals.readOnly).toBe(1);
  });

  it("falls back to a stable synthetic session id", () => {
    const first = normalizePayload("PreToolUse", {});
    const second = normalizePayload("PreToolUse", {});

    expect(first.sessionId).toBe(second.sessionId);
    expect(first.sessionId).toMatch(/^unknown-/);
  });

  it("ignores a session id of the wrong type instead of coercing it", () => {
    expect(normalizePayload("PreToolUse", { session_id: { nested: true } }).sessionId).toMatch(/^unknown-/);
  });
});

// ── trace ────────────────────────────────────────────────────────────────────

describe("session trace", () => {
  it("writes a header line at session start", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);

    await runHook("SessionStart", payload({ source: "startup" }), tmp);

    const trace = await readTrace(tmp, "s-1");
    expect(trace.header?.sessionId).toBe("s-1");
    expect(trace.header?.source).toBe("startup");
    expect(trace.header?.schemaVersion).toBe(1);
    expect(trace.observations).toHaveLength(0);
  });

  it("records no commit rather than failing in a repository with no git history", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);

    await runHook("SessionStart", payload(), tmp);

    const trace = await readTrace(tmp, "s-1");
    expect(trace.header).toBeDefined();
    expect(trace.header?.baseCommit).toBeUndefined();
  });

  it("captures the base commit when the repository has history", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await initGit(tmp);

    await runHook("SessionStart", payload(), tmp);

    expect((await readTrace(tmp, "s-1")).header?.baseCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("appends one independently parseable line per event", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);

    await runHook("SessionStart", payload(), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Read", tool_input: { file_path: "a.ts" } }), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "b.ts" } }), tmp);
    await runHook("Stop", payload(), tmp);

    const lines = (await readFile(traceFilePath(tmp, "s-1"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });

  it("never records raw tool input content", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook(
      "PreToolUse",
      payload({ tool_name: "Write", tool_input: { file_path: "src/a.ts", content: "SUPER_SECRET_LITERAL" } }),
      tmp,
    );

    expect(await readFile(traceFilePath(tmp, "s-1"), "utf8")).not.toContain("SUPER_SECRET_LITERAL");
  });

  it("records a blocked path as withheld, by pattern and never by path content", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook("PreToolUse", payload({ tool_name: "Read", tool_input: { file_path: ".env" } }), tmp);

    const raw = await readFile(traceFilePath(tmp, "s-1"), "utf8");
    const observation = JSON.parse(raw.trim().split("\n")[1]);
    expect(observation.blocked).toBe(true);
    expect(raw).not.toContain(".env");
  });

  it("does not read the tasks directory on the hot path", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    // Removing the tasks tree entirely must not affect a pre-tool observation: if the hot
    // path consulted it, this would change behavior or throw.
    await rm(path.join(tmp, ".akrctx/tasks"), { recursive: true, force: true });

    await expect(
      runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" } }), tmp),
    ).resolves.toBeDefined();
    expect((await readTrace(tmp, "s-1")).observations).toHaveLength(1);
  });

  it("records nothing at all when tracing is not enabled", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    await runHook("SessionStart", payload(), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Read" }), tmp);

    const trace = await readTrace(tmp, "s-1");
    expect(trace.header).toBeUndefined();
    expect(trace.observations).toHaveLength(0);
  });

  it("reports a truncated trace as incomplete rather than throwing", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Read", tool_input: { file_path: "a.ts" } }), tmp);
    const file = traceFilePath(tmp, "s-1");
    await writeFile(file, `${(await readFile(file, "utf8")).slice(0, -12)}\n`, "utf8");

    const trace = await readTrace(tmp, "s-1");

    expect(trace.complete).toBe(false);
    expect(trace.header).toBeDefined();
  });
});

// ── findings from human review ───────────────────────────────────────────────

describe("hook binary lifetime", () => {
  it("exits before the tightest host budget even when stdin is never closed", async () => {
    // Resolving the read promise is not enough: an open pipe keeps the event loop alive, so
    // the process outlived the 2s fallback. Claude Code gives SessionEnd hooks a shared
    // 1.5s budget, so both the cap and the teardown have to sit under it.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);

    const started = Date.now();
    const child = execFile("node", [path.join(process.cwd(), "dist/index.js"), "hook", "PreToolUse"], { cwd: tmp });
    child.stdin?.write('{"session_id":"held-open"}');
    // Deliberately never call end(): this is the host that opens a pipe and forgets it.
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    const elapsed = Date.now() - started;

    expect(code).toBe(0);
    expect(elapsed).toBeLessThan(1500);
  });
});

describe("command recording", () => {
  const shell = (command: string) => payload({ tool_name: "Bash", tool_input: { command } });

  it("records the executable only, never its arguments", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook("PreToolUse", shell("echo SUPER_SECRET_LITERAL"), tmp);

    const raw = await readFile(traceFilePath(tmp, "s-1"), "utf8");
    expect(raw).not.toContain("SUPER_SECRET_LITERAL");
    expect(JSON.parse(raw.trim().split("\n")[1]).commandHead).toBe("echo");
  });

  it("flags a blocked path named inside a shell command", async () => {
    // Shell commands never reach the file-path classifier, so `cat .env` slipped past the
    // blocked-read check entirely and wrote the path into the trace.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook("PreToolUse", shell("cat .env"), tmp);

    const raw = await readFile(traceFilePath(tmp, "s-1"), "utf8");
    expect(JSON.parse(raw.trim().split("\n")[1]).blocked).toBe(true);
    expect(raw).not.toContain(".env");
  });

  it.each([
    ["an absolute path", "/usr/local/bin/mytool --token abc123"],
    ["an env assignment", "TOKEN=abc123 deploy"],
    ["a subshell", "$(curl https://example.com/secret)"],
  ])("collapses %s to a safe label", async (_label, command) => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook("PreToolUse", shell(command), tmp);

    const raw = await readFile(traceFilePath(tmp, "s-1"), "utf8");
    expect(raw).not.toContain("abc123");
    expect(raw).not.toContain("example.com");
  });
});

describe("mutation semantics", () => {
  const write = (file: string) => payload({ tool_name: "Edit", tool_input: { file_path: file } });

  it("does not count an attempt that was observed to fail", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook("PreToolUse", write("src/a.ts"), tmp);
    await runHook(
      "PostToolUse",
      payload({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" }, tool_result: { is_error: true } }),
      tmp,
    );

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });
    expect(report.sessions[0].mutatedProject).toBe(false);
  });

  it("counts an attempt that completed", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook("PreToolUse", write("src/a.ts"), tmp);
    await runHook(
      "PostToolUse",
      payload({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" }, tool_result: { exit_code: 0 } }),
      tmp,
    );

    expect((await runTraceReport({ cwd: tmp, nonInteractive: true })).sessions[0].mutatedProject).toBe(true);
  });

  it("holds a session out of the rates when a shell command could have mutated invisibly", async () => {
    // `sed -i`, `rm`, `git apply` and any script all mutate through a shell, and nothing in
    // the invocation says so. Guessing either way corrupts the number this phase produces.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });
    await runHook("SessionStart", payload(), tmp);

    await runHook("PreToolUse", payload({ tool_name: "Bash", tool_input: { command: "sed -i s/a/b/ src/a.ts" } }), tmp);
    await runHook(
      "PreToolUse",
      payload({ tool_name: "Read", tool_input: { file_path: `${task.taskDir}/task.md` } }),
      tmp,
    );
    await runHook("PreToolUse", write("src/a.ts"), tmp);
    await runHook("SessionEnd", payload(), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.sessions[0].mutationUncertain).toBe(true);
    expect(report.sessions[0].uncertainBeforeBinding).toBe(true);
    expect(report.sessions[0].capsuleBeforeFirstMutation).toBe(false);
    expect(report.totals.uncertain).toBe(1);
    expect(report.totals.mutating).toBe(0);
  });
});

describe("outcome correlation", () => {
  it("does not let an unrelated call settle a pending write", async () => {
    // A global "some outcome arrived" flag made any later PostToolUse resolve an open
    // attempt, so an edit that never finished stopped looking uncertain the moment an
    // unrelated read succeeded.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook(
      "PreToolUse",
      payload({ tool_name: "Edit", tool_use_id: "call-edit", tool_input: { file_path: "src/a.ts" } }),
      tmp,
    );
    await runHook(
      "PostToolUse",
      payload({ tool_name: "Read", tool_use_id: "call-read", tool_input: { file_path: "src/b.ts" } }),
      tmp,
    );

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.sessions[0].mutatedProject).toBe(false);
    expect(report.sessions[0].mutationUncertain).toBe(true);
  });

  it("settles a write when its own call reports an outcome", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    const call = { tool_name: "Edit", tool_use_id: "call-edit", tool_input: { file_path: "src/a.ts" } };
    await runHook("PreToolUse", payload(call), tmp);
    await runHook("PostToolUse", payload({ ...call, tool_result: { exit_code: 0 } }), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.sessions[0].mutatedProject).toBe(true);
    expect(report.sessions[0].mutationUncertain).toBe(false);
  });

  it("does not let one anonymous outcome settle overlapping calls of the same tool", async () => {
    // Copilot's documented payload has no call id. If two Edit calls overlap, choosing
    // which one an outcome belongs to would invent ordering evidence.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });
    await runHook("SessionStart", payload(), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "src/before.ts" } }), tmp);
    await runHook(
      "PreToolUse",
      payload({ tool_name: "Read", tool_input: { file_path: `${task.taskDir}/task.md` } }),
      tmp,
    );
    await runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "src/after.ts" } }), tmp);
    await runHook(
      "PostToolUse",
      payload({
        tool_name: "Edit",
        tool_input: { file_path: "src/after.ts" },
        tool_result: { result_type: "success" },
      }),
      tmp,
    );
    await runHook("SessionEnd", payload(), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });
    expect(report.sessions[0].mutationUncertain).toBe(true);
    expect(report.sessions[0].capsuleBeforeFirstMutation).toBe(false);
    expect(report.totals.uncertain).toBe(1);
  });

  it("resolves overlapping anonymous calls when every outcome is a failure", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" } }), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "src/b.ts" } }), tmp);
    for (const file of ["src/a.ts", "src/b.ts"]) {
      await runHook(
        "PostToolUseFailure",
        payload({ tool_name: "Edit", tool_input: { file_path: file }, error: "failed" }),
        tmp,
      );
    }
    await runHook("SessionEnd", payload(), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });
    expect(report.sessions[0].mutationUncertain).toBe(false);
    expect(report.totals.readOnly).toBe(1);
  });
});

describe("uncertain sessions stay visible", () => {
  it("counts a session whose only possible change was an unobservable shell command", async () => {
    // Held out of the rates, but not dropped: this session used to appear in neither
    // `mutating` nor `uncertain`, so it left the aggregate silently.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });
    await runHook("SessionStart", payload(), tmp);

    await runHook(
      "PreToolUse",
      payload({ tool_name: "Read", tool_input: { file_path: `${task.taskDir}/task.md` } }),
      tmp,
    );
    await runHook("PreToolUse", payload({ tool_name: "Bash", tool_input: { command: "rm -rf build" } }), tmp);
    await runHook("SessionEnd", payload(), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.sessions[0].mutationUncertain).toBe(true);
    expect(report.totals.mutating).toBe(0);
    expect(report.totals.uncertain).toBe(1);
  });

  it("partitions every usable session across exactly three buckets", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", JSON.stringify({ session_id: "quiet" }), tmp);
    await runHook(
      "PreToolUse",
      JSON.stringify({ session_id: "quiet", tool_name: "Read", tool_input: { file_path: "src/a.ts" } }),
      tmp,
    );

    await runHook("SessionEnd", JSON.stringify({ session_id: "quiet" }), tmp);

    const { totals } = await runTraceReport({ cwd: tmp, nonInteractive: true });

    // `<=` proved nothing: it held even if a session fell out of every bucket. The three
    // must account for every usable trace exactly.
    expect(totals.mutating + totals.uncertain + totals.readOnly).toBe(totals.sessions - totals.incomplete);
    expect(totals.readOnly).toBe(1);
  });
});

describe("mutations with no recognized path", () => {
  it.each([
    ["apply_patch with its own schema", { tool_name: "apply_patch", tool_input: { patch: "@@ -1 +1 @@" } }],
    ["an MCP write tool with an unknown shape", { tool_name: "mcp__fs__write_file", tool_input: { target: "a.ts" } }],
    ["a PostToolUse that does not repeat its input", { tool_name: "Edit", tool_result: { exit_code: 0 } }],
  ])("never lets %s disappear from both buckets", async (_label, call) => {
    // `mutating` used to be decided inside the path branch, so a write whose target could
    // not be classified fell out of the rates and out of the caveat at the same time.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    await runHook("PreToolUse", payload(call), tmp);
    await runHook("SessionEnd", payload(), tmp);

    const { totals } = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(totals.mutating + totals.uncertain).toBe(1);
    expect(totals.readOnly).toBe(0);
  });

  it("does not let a post with the same id settle an attempt it never ruled on", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    await runHook(
      "PreToolUse",
      payload({ tool_name: "Edit", tool_use_id: "c1", tool_input: { file_path: "src/a.ts" } }),
      tmp,
    );
    // Same call id, but a read: it carries no verdict on the write.
    await runHook("PostToolUse", payload({ tool_name: "Read", tool_use_id: "c1" }), tmp);
    await runHook("SessionEnd", payload(), tmp);

    expect((await runTraceReport({ cwd: tmp, nonInteractive: true })).sessions[0].mutationUncertain).toBe(true);
  });

  it("lets a failure settle a pathless mutation without leaving doubt behind", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    const call = { tool_name: "apply_patch", tool_use_id: "c1", tool_input: { patch: "@@ -1 +1 @@" } };
    await runHook("PreToolUse", payload(call), tmp);
    await runHook("PostToolUseFailure", payload({ ...call, error: "patch did not apply" }), tmp);
    await runHook("SessionEnd", payload(), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });
    expect(report.sessions[0].mutatedProject).toBe(false);
    expect(report.sessions[0].mutationUncertain).toBe(false);
    expect(report.totals.readOnly).toBe(1);
  });

  it("uses the attempt area when a successful post omits its input", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    await runHook(
      "PreToolUse",
      payload({ tool_name: "Edit", tool_use_id: "c1", tool_input: { file_path: "src/a.ts" } }),
      tmp,
    );
    await runHook(
      "PostToolUse",
      payload({ tool_name: "Edit", tool_use_id: "c1", tool_result: { result_type: "success" } }),
      tmp,
    );
    await runHook("SessionEnd", payload(), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });
    expect(report.sessions[0].mutatedProject).toBe(true);
    expect(report.sessions[0].mutationUncertain).toBe(false);
  });
});

describe("host-specific outcome delivery", () => {
  it("reads a Copilot tool failure as a settled failure, not an open attempt", async () => {
    // Copilot never routes a failed call to postToolUse; it goes to postToolUseFailure with
    // a top-level `error` string and no result object.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);

    const call = { toolName: "Edit", toolUseId: "c1", toolArgs: { file_path: "src/a.ts" } };
    await runHook("preToolUse", JSON.stringify({ session_id: "s-1", ...call }), tmp);
    await runHook(
      "postToolUseFailure",
      JSON.stringify({ session_id: "s-1", ...call, error: "permission denied" }),
      tmp,
    );
    await runHook("SessionEnd", payload(), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });
    expect(report.sessions[0].mutatedProject).toBe(false);
    expect(report.sessions[0].mutationUncertain).toBe(false);
  });

  it("wires Copilot's failure event, which the other hosts do not have", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });

    await enableTrace(tmp);

    const config = JSON.parse(await readFile(path.join(tmp, ".github/hooks/akrctx-trace.json"), "utf8"));
    expect(Object.keys(config.hooks)).toContain("PostToolUseFailure");
  });

  it("makes the Pi extension report call ids and outcomes", async () => {
    // Without tool_result every Pi write stayed an anonymous unresolved attempt, so Pi could
    // never contribute to the mutation denominator at all.
    await runInit({ cwd: tmp, target: "pi", nonInteractive: true });

    await enableTrace(tmp);

    const extension = await readFile(path.join(tmp, ".pi/extensions/akrctx-trace.ts"), "utf8");
    expect(extension).toContain('pi.on("tool_result"');
    expect(extension).toContain("event.toolCallId");
    expect(extension).toContain("event.isError");
  });
});

describe("partial traces", () => {
  it("treats a session that never ended as incomplete", async () => {
    // A live or killed session is missing its later half, so a capsule bound after the last
    // recorded line would read as never bound — a false non-compliance.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" } }), tmp);

    expect((await readTrace(tmp, "s-1")).complete).toBe(false);
    expect((await runTraceReport({ cwd: tmp, nonInteractive: true })).totals.incomplete).toBe(1);
  });

  it("does not reuse an old SessionEnd after the same session is resumed", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload({ source: "startup" }), tmp);
    await runHook("SessionEnd", payload(), tmp);
    await runHook("SessionStart", payload({ source: "resume" }), tmp);
    await runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" } }), tmp);

    const trace = await readTrace(tmp, "s-1");
    expect(trace.header?.source).toBe("resume");
    expect(trace.complete).toBe(false);
    expect((await runTraceReport({ cwd: tmp, nonInteractive: true })).totals.incomplete).toBe(1);
  });

  it("treats a trace with no header as incomplete", async () => {
    // Observations without a header mean recording began mid-session or the first line was
    // lost. Its ordering cannot be trusted, so it must not feed the aggregate.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("PreToolUse", payload({ tool_name: "Edit", tool_input: { file_path: "src/a.ts" } }), tmp);

    const trace = await readTrace(tmp, "s-1");

    expect(trace.observations).toHaveLength(1);
    expect(trace.complete).toBe(false);
    expect((await runTraceReport({ cwd: tmp, nonInteractive: true })).totals.incomplete).toBe(1);
  });

  it("treats a record missing its essential fields as incomplete", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await runHook("SessionStart", payload(), tmp);
    const file = traceFilePath(tmp, "s-1");
    await writeFile(file, `${await readFile(file, "utf8")}${JSON.stringify({ kind: "observation" })}\n`, "utf8");

    expect((await readTrace(tmp, "s-1")).complete).toBe(false);
  });
});

describe("binary report regressions", () => {
  it("preserves outcome, multiplicity, and lifecycle semantics through the real CLI", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const emit = (event: string, body: Record<string, unknown>) => runCli(tmp, JSON.stringify(body), event);

    await emit("SessionStart", { session_id: "failed", source: "startup" });
    const failed = {
      session_id: "failed",
      tool_name: "apply_patch",
      tool_use_id: "c1",
      tool_input: { patch: "opaque" },
    };
    await emit("PreToolUse", failed);
    await emit("PostToolUseFailure", { ...failed, error: "did not apply" });
    await emit("SessionEnd", { session_id: "failed" });

    await emit("SessionStart", { session_id: "resumed", source: "startup" });
    await emit("SessionEnd", { session_id: "resumed" });
    await emit("SessionStart", { session_id: "resumed", source: "resume" });
    await emit("PreToolUse", {
      session_id: "resumed",
      tool_name: "Edit",
      tool_input: { file_path: "src/live.ts" },
    });

    await emit("SessionStart", { session_id: "anonymous", source: "startup" });
    await emit("PreToolUse", {
      session_id: "anonymous",
      tool_name: "Edit",
      tool_input: { file_path: "src/one.ts" },
    });
    await emit("PreToolUse", {
      session_id: "anonymous",
      tool_name: "Edit",
      tool_input: { file_path: "src/two.ts" },
    });
    await emit("PostToolUse", {
      session_id: "anonymous",
      tool_name: "Edit",
      tool_input: { file_path: "src/two.ts" },
      tool_result: { result_type: "success" },
    });
    await emit("SessionEnd", { session_id: "anonymous" });

    const cli = path.join(process.cwd(), "dist/index.js");
    const { stdout } = await execFileAsync("node", [cli, "trace", "report", "--json"], { cwd: tmp });
    const report = JSON.parse(stdout);
    const byId = new Map(
      report.sessions.map((session: { sessionId: string }) => [session.sessionId, session] as const),
    );
    expect(byId.get("failed")).toMatchObject({ complete: true, mutatedProject: false, mutationUncertain: false });
    expect(byId.get("resumed")).toMatchObject({ complete: false });
    expect(byId.get("anonymous")).toMatchObject({ complete: true, mutationUncertain: true });
  });
});

// ── report ───────────────────────────────────────────────────────────────────

describe("trace report", () => {
  const editProject = (file: string) => payload({ tool_name: "Edit", tool_input: { file_path: file } });
  const readCapsule = (taskId: string) =>
    payload({ tool_name: "Read", tool_input: { file_path: `.akrctx/tasks/${taskId}-slug/task.md` } });

  async function session(cwd: string, events: Array<[string, string]>): Promise<void> {
    for (const [event, body] of events) {
      await runHook(event, body, cwd);
      // A write only counts once the host reports it completed, so a realistic fixture has
      // to deliver the PostToolUse that a real host would.
      const parsed = JSON.parse(body);
      if (event === "PreToolUse" && /edit|write/i.test(String(parsed.tool_name ?? ""))) {
        await runHook("PostToolUse", JSON.stringify({ ...parsed, tool_result: { exit_code: 0 } }), cwd);
      }
    }
  }

  it("separates the two candidate definitions of an active capsule", async () => {
    // The distinction phase 3 turns on: both sessions bind a capsule, but only one binds it
    // before touching project code. Blocking on the stricter one would break resumed work.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });
    const id = task.taskId;

    await session(tmp, [
      ["SessionStart", payload()],
      ["PreToolUse", readCapsule(id)],
      ["PreToolUse", editProject("src/a.ts")],
    ]);
    await session(tmp, [
      ["SessionStart", JSON.stringify({ session_id: "s-2" })],
      ["PreToolUse", JSON.stringify({ session_id: "s-2", tool_name: "Edit", tool_input: { file_path: "src/b.ts" } })],
      [
        "PreToolUse",
        JSON.stringify({
          session_id: "s-2",
          tool_name: "Read",
          tool_input: { file_path: `.akrctx/tasks/${id}-slug/task.md` },
        }),
      ],
    ]);

    await runHook("SessionEnd", payload(), tmp);
    await runHook("SessionEnd", JSON.stringify({ session_id: "s-2" }), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.totals.mutating).toBe(2);
    expect(report.totals.capsuleBound).toBe(2);
    expect(report.totals.capsuleBeforeFirstMutation).toBe(1);
  });

  it("does not count a session that never touched project code as a contract failure", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);

    await session(tmp, [
      ["SessionStart", payload()],
      ["PreToolUse", payload({ tool_name: "Read", tool_input: { file_path: "src/a.ts" } })],
    ]);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.totals.sessions).toBe(1);
    expect(report.totals.mutating).toBe(0);
  });

  it("matches an observed validation command against the capsule declaration by digest", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    await writeFile(taskFile, (await readFile(taskFile, "utf8")).replace("```\n```", "```\npnpm test\n```"), "utf8");

    await session(tmp, [
      ["SessionStart", payload()],
      ["PreToolUse", readCapsule(task.taskId)],
      ["PreToolUse", payload({ tool_name: "Bash", tool_input: { command: "pnpm test" } })],
    ]);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.sessions[0].validationDeclared).toBe(true);
    expect(report.sessions[0].validationObserved).toBe(true);
  });

  it("reports a declared command that was never run as not observed", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const task = await runTask("Add invoice API", { cwd: tmp, nonInteractive: true });
    const taskFile = path.join(tmp, task.taskDir, "task.md");
    await writeFile(taskFile, (await readFile(taskFile, "utf8")).replace("```\n```", "```\npnpm test\n```"), "utf8");

    await session(tmp, [
      ["SessionStart", payload()],
      ["PreToolUse", readCapsule(task.taskId)],
      ["PreToolUse", payload({ tool_name: "Bash", tool_input: { command: "echo not-the-declared-command" } })],
    ]);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.sessions[0].validationDeclared).toBe(true);
    expect(report.sessions[0].validationObserved).toBe(false);
  });

  it("excludes a truncated session from the aggregate instead of guessing", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    await session(tmp, [
      ["SessionStart", payload()],
      ["PreToolUse", editProject("src/a.ts")],
    ]);
    const file = traceFilePath(tmp, "s-1");
    await writeFile(file, `${(await readFile(file, "utf8")).slice(0, -10)}\n`, "utf8");

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.totals.sessions).toBe(1);
    expect(report.totals.incomplete).toBe(1);
    expect(report.totals.mutating).toBe(0);
    expect(report.sessions[0].complete).toBe(false);
  });

  it("reports an empty result rather than failing when nothing was recorded", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.totals.sessions).toBe(0);
    expect(report.sessions).toEqual([]);
  });
});

describe("trace report aggregates", () => {
  const edit = (session: string, file: string) =>
    JSON.stringify({ session_id: session, tool_name: "Edit", tool_input: { file_path: file } });
  const read = (session: string, file: string) =>
    JSON.stringify({ session_id: session, tool_name: "Read", tool_input: { file_path: file } });
  /** A write the host confirmed. Only completed calls count as changes. */
  const completedEdit = (session: string, file: string) =>
    JSON.stringify({
      session_id: session,
      tool_name: "Edit",
      tool_input: { file_path: file },
      tool_result: { exit_code: 0 },
    });

  async function capsuleId(cwd: string): Promise<string> {
    return (await runTask("Add invoice API", { cwd, nonInteractive: true })).taskId;
  }

  it("never counts a predicate over more sessions than the denominator", async () => {
    // A session that only read files binds a capsule but changes nothing. Counting it in
    // the numerator while dividing by the mutating sessions produced "150% of mutating".
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const id = await capsuleId(tmp);
    const capsule = `.akrctx/tasks/${id}-slug/task.md`;

    for (const s of ["a", "b", "c"]) await runHook("SessionStart", JSON.stringify({ session_id: s }), tmp);
    await runHook("PreToolUse", read("a", capsule), tmp);
    await runHook("PreToolUse", edit("a", "src/a.ts"), tmp);
    await runHook("PostToolUse", completedEdit("a", "src/a.ts"), tmp);
    await runHook("PreToolUse", edit("b", "src/b.ts"), tmp);
    await runHook("PostToolUse", completedEdit("b", "src/b.ts"), tmp);
    await runHook("PreToolUse", read("c", capsule), tmp);
    for (const s of ["a", "b", "c"]) await runHook("SessionEnd", JSON.stringify({ session_id: s }), tmp);

    const { totals } = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(totals.sessions).toBe(3);
    expect(totals.mutating).toBe(2);
    expect(totals.capsuleBound).toBeLessThanOrEqual(totals.mutating);
    expect(totals.capsuleBound).toBe(1);
  });

  it.each([
    ["a harness file", "CLAUDE.md"],
    ["a file outside the repository", "../outside-repo.txt"],
  ])("counts a mutation to %s as a mutation the capsule should have preceded", async (_label, file) => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const id = await capsuleId(tmp);

    await runHook("SessionStart", JSON.stringify({ session_id: "s" }), tmp);
    await runHook("PreToolUse", edit("s", file), tmp);
    await runHook("PostToolUse", completedEdit("s", file), tmp);
    await runHook("PreToolUse", read("s", `.akrctx/tasks/${id}-slug/task.md`), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.sessions[0].capsuleBound).toBe(true);
    expect(report.sessions[0].capsuleBeforeFirstMutation).toBe(false);
  });

  it("does not treat writing inside .akrctx/ as a mutation the capsule should have preceded", async () => {
    // The criterion is "before the first mutation outside .akrctx/". Writing a wiki page
    // or the capsule itself is harness bookkeeping, not the work the contract governs.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const id = await capsuleId(tmp);

    await runHook("SessionStart", JSON.stringify({ session_id: "s" }), tmp);
    await runHook("PreToolUse", edit("s", ".akrctx/wiki/decisions.md"), tmp);
    await runHook("PostToolUse", completedEdit("s", ".akrctx/wiki/decisions.md"), tmp);
    await runHook("PreToolUse", read("s", `.akrctx/tasks/${id}-slug/task.md`), tmp);
    await runHook("PreToolUse", edit("s", "src/a.ts"), tmp);
    await runHook("PostToolUse", completedEdit("s", "src/a.ts"), tmp);

    const report = await runTraceReport({ cwd: tmp, nonInteractive: true });

    expect(report.sessions[0].capsuleBeforeFirstMutation).toBe(true);
  });
});

// ── installation ─────────────────────────────────────────────────────────────

describe("trace installation", () => {
  it("is off until explicitly enabled", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    const { runTraceStatus } = await import("../src/hook/install.js");
    expect((await runTraceStatus({ cwd: tmp, nonInteractive: true })).enabled).toBe(false);
    expect(await exists(path.join(tmp, ".claude/settings.json"))).toBe(false);
  });

  it("preserves unrelated settings and existing hooks", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const settings = path.join(tmp, ".claude/settings.json");
    await mkdir(path.dirname(settings), { recursive: true });
    await writeFile(
      settings,
      JSON.stringify({
        model: "some-model",
        permissions: { allow: ["Bash(ls:*)"] },
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "my-own-linter" }] }] },
      }),
      "utf8",
    );

    await enableTrace(tmp);

    const next = JSON.parse(await readFile(settings, "utf8"));
    expect(next.model).toBe("some-model");
    expect(next.permissions.allow).toEqual(["Bash(ls:*)"]);
    expect(JSON.stringify(next.hooks.PreToolUse)).toContain("my-own-linter");
    expect(JSON.stringify(next.hooks.PreToolUse)).toContain("hook PreToolUse");
  });

  it("is idempotent", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    await enableTrace(tmp);
    const first = await readFile(path.join(tmp, ".claude/settings.json"), "utf8");
    await enableTrace(tmp);

    expect(await readFile(path.join(tmp, ".claude/settings.json"), "utf8")).toBe(first);
  });

  it("removes only what akrctx added", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const settings = path.join(tmp, ".claude/settings.json");
    await mkdir(path.dirname(settings), { recursive: true });
    await writeFile(
      settings,
      JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "my-own-linter" }] }] } }),
      "utf8",
    );
    await enableTrace(tmp);

    const { runTraceDisable } = await import("../src/hook/install.js");
    await runTraceDisable({ cwd: tmp, nonInteractive: true });

    const raw = await readFile(settings, "utf8");
    expect(raw).toContain("my-own-linter");
    expect(raw).not.toContain("akrctx hook");
  });

  it("stops recording once disabled", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);
    const { runTraceDisable } = await import("../src/hook/install.js");
    await runTraceDisable({ cwd: tmp, nonInteractive: true });

    await runHook("SessionStart", payload({ session_id: "later" }), tmp);

    expect((await readTrace(tmp, "later")).header).toBeUndefined();
  });

  it("reports non-dogfooded hosts as unverified rather than as supported", async () => {
    await runInit({ cwd: tmp, target: "copilot", nonInteractive: true });
    await enableTrace(tmp);

    const { runTraceStatus } = await import("../src/hook/install.js");
    const status = await runTraceStatus({ cwd: tmp, nonInteractive: true });

    expect(status.wiredTargets).toContain("copilot");
    expect(status.unverified).toContain("copilot");
  });

  it("wires an absolute path to this build, never a bare PATH lookup", async () => {
    // A bare `akrctx hook <event>` resolves against the agent's PATH. An older build has
    // no `hook` subcommand, commander exits 1, and on Copilot a non-zero exit from
    // preToolUse denies every tool call — the exact failure the contract exists to prevent.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    await enableTrace(tmp);

    const settings = JSON.parse(await readFile(path.join(tmp, ".claude/settings.json"), "utf8"));
    const command: string = settings.hooks.PreToolUse.at(-1).hooks[0].command;
    expect(command).toContain("hook PreToolUse");
    expect(command.startsWith("akrctx ")).toBe(false);
    // Both the interpreter and the entry point are absolute, so the build that wired the
    // hook is the build that runs it.
    const [interpreter, entry] = [...command.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(path.isAbsolute(interpreter)).toBe(true);
    expect(path.isAbsolute(entry)).toBe(true);
  });

  it("leaves a peer tool's hooks alone even when they use the same invocation shape", async () => {
    // Passing the event name as an argument is the convention akrctx itself picked, so it is
    // the convention a peer tool is most likely to pick too. Recognizing our entries by that
    // shape made `trace enable` delete other people's hooks — silently, and destructively.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const settings = path.join(tmp, ".claude/settings.json");
    await mkdir(path.dirname(settings), { recursive: true });
    await writeFile(
      settings,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { hooks: [{ type: "command", command: "my-own-linter" }] },
            { hooks: [{ type: "command", command: "mytool hook PreToolUse" }] },
          ],
          Stop: [{ hooks: [{ type: "command", command: "/usr/local/bin/teamhooks hook Stop" }] }],
        },
      }),
      "utf8",
    );

    await enableTrace(tmp);
    const { runTraceDisable } = await import("../src/hook/install.js");
    await runTraceDisable({ cwd: tmp, nonInteractive: true });

    const raw = await readFile(settings, "utf8");
    expect(raw).toContain("my-own-linter");
    expect(raw).toContain("mytool hook PreToolUse");
    expect(raw).toContain("/usr/local/bin/teamhooks hook Stop");
    expect(raw).not.toContain(traceMarker);
  });

  it("still recognizes and replaces a legacy bare-PATH entry", async () => {
    // Anything wired by an earlier build carries the unpinned form. It has to be adopted on
    // the next enable, or enabling would stack a second entry beside it.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const settings = path.join(tmp, ".claude/settings.json");
    await mkdir(path.dirname(settings), { recursive: true });
    await writeFile(
      settings,
      JSON.stringify({
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "akrctx hook PreToolUse" }] }] },
      }),
      "utf8",
    );

    await enableTrace(tmp);

    const parsed = JSON.parse(await readFile(settings, "utf8"));
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(JSON.stringify(parsed.hooks.PreToolUse)).toContain(traceMarker);
  });

  it("records which host produced the session", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    await enableTrace(tmp);

    await runHook("SessionStart", payload(), tmp, { host: "claude" });

    expect((await readTrace(tmp, "s-1")).header?.host).toBe("claude");
  });

  it("wires the host into every command so the trace can be attributed", async () => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });

    await enableTrace(tmp);

    const settings = JSON.parse(await readFile(path.join(tmp, ".claude/settings.json"), "utf8"));
    expect(settings.hooks.PreToolUse.at(-1).hooks[0].command).toContain("--akrctx-host claude");
  });

  it.each([
    ["an empty file", ""],
    ["whitespace only", "   \n"],
  ])("refuses to merge into %s rather than overwriting it", async (_label, contents) => {
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const settings = path.join(tmp, ".claude/settings.json");
    await mkdir(path.dirname(settings), { recursive: true });
    await writeFile(settings, contents, "utf8");

    await expect(enableTrace(tmp)).rejects.toThrow(/empty/);
    expect(await readFile(settings, "utf8")).toBe(contents);
  });

  it("refuses to merge into an unparseable settings file rather than replacing it", async () => {
    // The merged result is written back with force, so treating a corrupt file as empty
    // destroyed everything in it.
    await runInit({ cwd: tmp, target: "claude", nonInteractive: true });
    const settings = path.join(tmp, ".claude/settings.json");
    await mkdir(path.dirname(settings), { recursive: true });
    const original = '{ "model": "some-model", oops this is not json';
    await writeFile(settings, original, "utf8");

    await expect(enableTrace(tmp)).rejects.toThrow("not valid JSON");
    expect(await readFile(settings, "utf8")).toBe(original);
  });

  it("pins the interpreter in the Pi extension instead of trusting PATH", async () => {
    await runInit({ cwd: tmp, target: "pi", nonInteractive: true });

    await enableTrace(tmp);

    const extension = await readFile(path.join(tmp, ".pi/extensions/akrctx-trace.ts"), "utf8");
    expect(extension).not.toContain('spawn("akrctx"');
    expect(extension).toContain(process.execPath);
    expect(extension).toContain("--akrctx-host");
  });

  it("removes the Pi extension on disable instead of only claiming to", async () => {
    await runInit({ cwd: tmp, target: "pi", nonInteractive: true });
    await enableTrace(tmp);
    const extension = path.join(tmp, ".pi/extensions/akrctx-trace.ts");
    expect(await exists(extension)).toBe(true);

    const { runTraceDisable, runTraceStatus } = await import("../src/hook/install.js");
    await runTraceDisable({ cwd: tmp, nonInteractive: true });

    expect(await exists(extension)).toBe(false);
    expect((await runTraceStatus({ cwd: tmp, nonInteractive: true })).wiredTargets).not.toContain("pi");
  });

  it("writes a Pi extension rather than a hook config", async () => {
    await runInit({ cwd: tmp, target: "pi", nonInteractive: true });

    await enableTrace(tmp);

    const extension = await readFile(path.join(tmp, ".pi/extensions/akrctx-trace.ts"), "utf8");
    expect(extension).toContain('pi.on("tool_call"');
    // Phase 1 observes only: the extension must never return a blocking result.
    expect(extension).not.toContain("block: true");
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function enableTrace(cwd: string): Promise<void> {
  const { runTraceEnable } = await import("../src/hook/install.js");
  await runTraceEnable({ cwd, nonInteractive: true });
}

async function initGit(cwd: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd });
  await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd });
  await execFileAsync("git", ["config", "user.name", "akrctx tests"], { cwd });
  await execFileAsync("git", ["add", "."], { cwd });
  await execFileAsync("git", ["commit", "-m", "base"], { cwd });
}

async function runCli(cwd: string, stdin: string, event = "PreToolUse"): Promise<{ stdout: string }> {
  const cli = path.join(process.cwd(), "dist/index.js");
  const child = execFile("node", [cli, "hook", event], { cwd });
  child.stdin?.end(stdin);
  return new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", reject);
    // Resolve on close regardless of code; a non-zero code is asserted against separately.
    child.on("close", (code) => (code === 0 ? resolve({ stdout }) : reject(new Error(`exit ${code}`))));
  });
}

async function exists(target: string): Promise<boolean> {
  return readFile(target, "utf8").then(
    () => true,
    () => false,
  );
}
