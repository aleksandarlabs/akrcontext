import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { matchesBlockedPattern, readBlockedPatterns } from "../judge-enforcement.js";
import { type NormalizedEvent, normalizePayload, parsePayload } from "./payload.js";
import { type Area, type TraceObservation, appendTrace, buildHeader } from "./trace.js";

const execFileAsync = promisify(execFile);

export interface HookResult {
  /**
   * Always undefined in phase 1. The hook observes; it does not decide. Emitting a
   * decision field at all would change host behavior, which phase 1 must not do.
   */
  decision?: undefined;
  /** What to print on stdout. Empty means "no opinion" on every host. */
  body?: Record<string, unknown>;
  recorded: boolean;
  /** Why nothing was recorded, for `trace status` and debugging. Never printed to the host. */
  reason?: string;
}

const noDecision = (recorded: boolean, reason?: string): HookResult => ({
  recorded,
  ...(reason ? { reason } : {}),
});

/** Tool names that write. Bash is excluded on purpose: a shell command cannot be classified. */
const mutatingTool = /write|edit|patch|create|delete|remove|move|rename|mkdir/i;
const shellTool = /bash|shell|terminal|exec|run.?command/i;

/**
 * The single entry point every host calls.
 *
 * This function must never throw and must never be slow. On Copilot a non-zero exit from
 * `preToolUse` denies the tool call, so an exception escaping here would block every tool
 * call in the session; a hang is fail-open there but burns the host's timeout budget.
 * Every failure — unreadable stdin, malformed JSON, missing config, unwritable trace —
 * resolves to the same no-decision result.
 */
export async function runHook(
  argvEvent: string,
  rawStdin: string,
  cwd: string,
  options: { host?: string } = {},
): Promise<HookResult> {
  try {
    const event = normalizePayload(argvEvent, parsePayload(rawStdin));
    if (!(await tracingEnabled(cwd))) return noDecision(false, "tracing is not enabled");
    await record(cwd, event, options.host);
    return noDecision(true);
  } catch (error) {
    // Deliberately swallowed. A trace is diagnostics; the agent's session is the product.
    return noDecision(false, error instanceof Error ? error.message : String(error));
  }
}

async function record(cwd: string, event: NormalizedEvent, host?: string): Promise<void> {
  if (event.event === "session-start") {
    await appendTrace(cwd, event.sessionId, buildHeader(event.sessionId, event.source, await headCommit(cwd), host));
    return;
  }
  await appendTrace(cwd, event.sessionId, await observe(cwd, event));
}

async function observe(cwd: string, event: NormalizedEvent): Promise<TraceObservation> {
  const observation: TraceObservation = {
    kind: "observation",
    at: new Date().toISOString(),
    event: event.event,
    ...(event.toolName ? { tool: event.toolName } : {}),
    ...(event.callId ? { callId: event.callId } : {}),
  };
  // Whether a tool writes is a property of the tool, not of whether this payload happened to
  // carry a path in a shape we recognize. Deciding it inside the path branch meant an
  // `apply_patch`, an MCP tool with its own schema, or a PostToolUse that does not repeat
  // its input fell out of `mutating` *and* out of `uncertain` — it simply vanished.
  const writes = mutatingTool.test(event.toolName ?? "");
  if (writes) {
    observation.mutating = true;
    // Only lifecycle events carry mutation semantics. Treating every event other than
    // PreToolUse as a completed call made an unknown future event look like a successful
    // write merely because its payload happened to name an Edit tool.
    if (event.event === "pre-tool") observation.outcome = "attempted";
    else if (event.event === "post-tool") observation.outcome = outcomeOf(event);
  }
  if (!event.toolInput) return observation;

  const rawPath = firstPath(event.toolInput);
  if (rawPath !== undefined) {
    const relative = toRelative(cwd, rawPath);
    // The blocked flag is computed here but the path itself is never written. The trace
    // must not become a way to learn what the blocked-read rules exist to protect.
    const blocked = await isBlocked(cwd, relative);
    observation.blocked = blocked;
    observation.area = blocked ? "none" : classify(relative);
    const capsuleId = blocked ? undefined : capsuleOf(relative);
    if (capsuleId) observation.capsuleId = capsuleId;
  }

  const command = typeof event.toolInput.command === "string" ? event.toolInput.command : undefined;
  if (command && shellTool.test(event.toolName ?? "")) {
    // Executable name only, never arguments. Keeping the first two tokens leaked whatever
    // followed the program — `echo <secret>` wrote the secret straight into the trace, and
    // `cat .env` wrote the path that the blocked-read rules exist to keep out of it.
    observation.commandHead = safeExecutable(command);
    observation.commandDigest = digestCommand(command);
    // A shell command never reaches firstPath, so blocked paths inside one were invisible
    // to the check above. The whole command line is screened here instead.
    if (await commandTouchesBlocked(cwd, command)) observation.blocked = true;
    // A shell command's effect on the tree is unknowable from the invocation, so it is
    // neither a mutation nor a non-mutation. Its execution outcome is still retained: a
    // validation is only observed after the successful post event for the same call.
    observation.mutating = undefined;
    if (event.event === "pre-tool") observation.outcome = "attempted";
    else if (event.event === "post-tool") observation.outcome = outcomeOf(event);
    observation.shell = true;
  }
  return observation;
}

export function digestCommand(command: string): string {
  return `sha256:${createHash("sha256").update(command.trim()).digest("hex")}`;
}

/**
 * The program being run, with no arguments and no path.
 *
 * Anything that is not a plain executable name collapses to "other": a command can begin
 * with an assignment, a subshell or an absolute path under a home directory, and none of
 * those belong in a diagnostic record. The digest already carries exact identity for
 * matching a declared validation command, so the readable part can afford to be timid.
 */
export function safeExecutable(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? "";
  const base = first.split("/").pop() ?? "";
  return /^[A-Za-z0-9._-]{1,32}$/.test(base) ? base : "other";
}

/** Screen a whole shell command for anything the blocked-read rules withhold. */
async function commandTouchesBlocked(cwd: string, command: string): Promise<boolean> {
  let patterns: string[];
  try {
    patterns = await readBlockedPatterns(cwd);
  } catch {
    return false;
  }
  // Tokens are compared as paths; a token may be quoted, redirected or comma-joined.
  const tokens = command.split(/[\s;|&<>()"'`]+/).filter(Boolean);
  return tokens.some((token) => {
    const relative = token.startsWith("/") ? path.relative(cwd, token).split(path.sep).join("/") : token;
    return patterns.some((pattern) => matchesBlockedPattern(relative, pattern));
  });
}

/**
 * Whether a completed tool call succeeded, from whichever result shape the host sent.
 *
 * Unknown shapes resolve to "succeeded" rather than "failed": a PostToolUse event only
 * fires for a call that ran, so treating an unrecognized result as a failure would silently
 * shrink the denominator.
 */
function outcomeOf(event: NormalizedEvent): "succeeded" | "failed" {
  if (event.failed) return "failed";
  const result = event.toolResult;
  if (!result) return "succeeded";
  const exitCode = result.exit_code ?? result.exitCode;
  if (typeof exitCode === "number" && exitCode !== 0) return "failed";
  if (result.is_error === true || result.isError === true || result.error) return "failed";
  if (typeof result.result_type === "string" && result.result_type !== "success") return "failed";
  if (typeof result.resultType === "string" && result.resultType !== "success") return "failed";
  return "succeeded";
}

/** Repo-relative, POSIX-separated. Paths outside the repository keep their `..` prefix. */
function toRelative(cwd: string, value: string): string {
  const absolute = path.isAbsolute(value) ? value : path.join(cwd, value);
  return path.relative(cwd, absolute).split(path.sep).join("/");
}

export function classify(relative: string): Area {
  if (relative.startsWith("..") || path.posix.isAbsolute(relative)) return "outside";
  if (/^\.akrctx\/tasks\/TASK-\d+/.test(relative)) return "capsule";
  if (relative.startsWith(".akrctx/")) return "akrctx";
  if (isHarnessPath(relative)) return "harness";
  return "project";
}

export function capsuleOf(relative: string): string | undefined {
  return /^\.akrctx\/tasks\/(TASK-\d+)/.exec(relative)?.[1];
}

function isHarnessPath(relative: string): boolean {
  return (
    ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"].includes(relative) ||
    [".claude/", ".codex/", ".agents/", ".pi/", ".github/instructions/", ".github/prompts/", ".github/skills/"].some(
      (prefix) => relative.startsWith(prefix),
    )
  );
}

/** First path-shaped value in a tool input, across the key names the hosts use. */
function firstPath(toolInput: Record<string, unknown>): string | undefined {
  for (const key of ["file_path", "filePath", "path", "notebook_path", "target_file"]) {
    const value = toolInput[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

async function isBlocked(cwd: string, relative: string): Promise<boolean> {
  try {
    return (await readBlockedPatterns(cwd)).some((pattern) => matchesBlockedPattern(relative, pattern));
  } catch {
    // readBlockedPatterns fails closed for the judge, where refusing to compute a boundary
    // is the safe answer. Here the safe answer is different: no path is ever written to the
    // trace, so an unreadable policy costs a flag, not a leak.
    return false;
  }
}

async function tracingEnabled(cwd: string): Promise<boolean> {
  try {
    const config = JSON.parse(await readFile(path.join(cwd, ".akrctx/config.json"), "utf8"));
    return config?.trace?.enabled === true;
  } catch {
    return false;
  }
}

async function headCommit(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", "HEAD"], { cwd, timeout: 2000 });
    return stdout.trim() || undefined;
  } catch {
    // No repository, or no commits yet. Recorded as absent rather than failing the session.
    return undefined;
  }
}
