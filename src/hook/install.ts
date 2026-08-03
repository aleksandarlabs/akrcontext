import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, writeConfig } from "../config.js";
import { pathExists, writePlannedFile } from "../fs-utils.js";
import type { CommandOptions, Target } from "../types.js";

/**
 * Events phase 1 listens to.
 *
 * PostToolUse fires for every tool rather than only shells. It used to be scoped to Bash to
 * halve the hot path, but that made a write's *outcome* invisible, so a rejected or failed
 * edit counted as a change to the working tree.
 */
const tracedEvents = ["SessionStart", "PreToolUse", "PostToolUse", "Stop", "SessionEnd"] as const;

/**
 * Copilot routes a failed tool call to `postToolUseFailure` and never to `postToolUse`, so
 * without this event every failed write there would stay an unfinished attempt and drag the
 * session into `uncertain` — even though the host reported a conclusive result.
 */
const copilotEvents = [...tracedEvents, "PostToolUseFailure"] as const;

/**
 * The absolute entry point of the build doing the wiring.
 *
 * A bare `akrctx hook <event>` resolves against the agent's PATH, which may be an older
 * build with no `hook` subcommand. Commander exits 1 for an unknown subcommand, and on
 * Copilot a non-zero exit from `preToolUse` denies the tool call — so a stale PATH entry
 * would block every tool call in the session. That is the precise failure the whole
 * failure contract exists to prevent, and it cannot be fixed inside `runHook`, because
 * `runHook` never gets to run. Pinning the interpreter and the entry point means the build
 * that wired the hook is the build that answers it.
 */
export function resolveCliEntry(): string {
  return fileURLToPath(import.meta.url);
}

/**
 * Ownership marker written into every command akrctx wires.
 *
 * Recognition cannot key on the path — the pinned command embeds an absolute path, and a
 * checkout directory need not contain "akrctx"; this repository lives in `akrcontext`,
 * which does not. Nor can it key on the shape of the invocation: passing the event name as
 * an argument is the convention akrctx itself chose, so it is the convention a peer tool is
 * most likely to choose, and claiming that shape means deleting other people's hooks.
 *
 * An explicit marker is unmistakable, survives the repository being moved, and cannot
 * collide with a tool that has no reason to emit this exact flag. It is declared as a real
 * option on the `hook` command so the CLI never rejects it — an unknown option would make
 * commander exit non-zero, which is the failure this whole surface exists to avoid.
 */
export const TRACE_MARKER = "--akrctx-trace";

/** Legacy unpinned form written by earlier builds; still adopted so enable stays idempotent. */
const legacyCommand = /(?:^|[\s"/\\])akrctx hook (?:SessionStart|PreToolUse|PostToolUse|Stop|SessionEnd)$/;

/** Pi delivers a tool's outcome on `tool_result`, with the same `toolCallId` as `tool_call`. */
const piToolEvents = { call: "tool_call", result: "tool_result" } as const;

export function hookCommand(event: string, host: Target, entry = resolveCliEntry()): string {
  // The host is passed by the installer because the payload does not carry it, and without
  // it conformance data cannot be attributed to a particular agent.
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(entry)} hook ${event} ${TRACE_MARKER} --akrctx-host ${host}`;
}

export function isakrctxCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  return command.includes(TRACE_MARKER) || legacyCommand.test(command.trim());
}
/** Well under Copilot's <5s recommendation and Claude's 1.5s shared SessionEnd budget. */
const timeoutSeconds = 5;

export interface TraceInstallResult {
  dryRun: boolean;
  enabled: boolean;
  writes: string[];
  wiredTargets: Target[];
  skippedTargets: Target[];
}

export interface TraceStatusResult {
  enabled: boolean;
  wiredTargets: Target[];
  unwiredTargets: Target[];
  /** Hosts wired but never exercised by a conformance run. Deliberately not a support table. */
  unverified: Target[];
  traceCount: number;
}

const hostConfigPath: Record<Target, string> = {
  claude: ".claude/settings.json",
  codex: ".codex/hooks.json",
  copilot: ".github/hooks/akrctx-trace.json",
  pi: ".pi/extensions/akrctx-trace.ts",
};

export async function runTraceEnable(options: CommandOptions): Promise<TraceInstallResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");

  const writes: string[] = [];
  for (const target of config.targets) {
    const written = await wireTarget(cwd, target, options);
    if (written) writes.push(written);
  }
  if (!options.dryRun) {
    await writeConfig(cwd, { ...config, trace: { enabled: true } });
  }
  return {
    dryRun: Boolean(options.dryRun),
    enabled: true,
    writes,
    wiredTargets: [...config.targets],
    skippedTargets: [],
  };
}

export async function runTraceDisable(options: CommandOptions): Promise<TraceInstallResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");

  const writes: string[] = [];
  for (const target of config.targets) {
    const removed = await unwireTarget(cwd, target, options);
    if (removed) writes.push(removed);
  }
  if (!options.dryRun) {
    await writeConfig(cwd, { ...config, trace: { enabled: false } });
  }
  return {
    dryRun: Boolean(options.dryRun),
    enabled: false,
    writes,
    wiredTargets: [],
    skippedTargets: [...config.targets],
  };
}

export async function runTraceStatus(options: CommandOptions): Promise<TraceStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  const { listTraceSessions } = await import("./trace.js");

  const wiredTargets: Target[] = [];
  const unwiredTargets: Target[] = [];
  for (const target of config.targets) {
    ((await isWired(cwd, target)) ? wiredTargets : unwiredTargets).push(target);
  }
  return {
    enabled: config.trace?.enabled === true,
    wiredTargets,
    unwiredTargets,
    // Every host except the one this repository runs on is wired from published
    // documentation, not from an observed run. Saying so here is the honest alternative to
    // a hand-written support table, which would be the prose problem again.
    unverified: wiredTargets.filter((target) => target !== "claude"),
    traceCount: (await listTraceSessions(cwd)).length,
  };
}

async function wireTarget(cwd: string, target: Target, options: CommandOptions): Promise<string | undefined> {
  const relative = hostConfigPath[target];
  if (target === "pi") {
    await writePlannedFile(cwd, relative, piExtension(), {
      dryRun: options.dryRun,
      force: true,
      reason: "akrctx session trace extension.",
    });
    return relative;
  }
  const existing = await readJson(cwd, relative);
  const next = target === "copilot" ? mergeCopilot(existing, target) : mergeHookTable(existing, target);
  if (!options.dryRun) {
    await writePlannedFile(cwd, relative, `${JSON.stringify(next, null, 2)}\n`, {
      force: true,
      reason: "akrctx session trace hooks.",
    });
  }
  return relative;
}

async function unwireTarget(cwd: string, target: Target, options: CommandOptions): Promise<string | undefined> {
  const relative = hostConfigPath[target];
  if (!(await pathExists(path.join(cwd, relative)))) return undefined;
  if (target === "pi") {
    // The extension is a file akrctx wrote and owns outright, so disabling deletes it.
    // Reporting it as removed while leaving it on disk would leave the trace running.
    if (!options.dryRun) await rm(path.join(cwd, relative), { force: true });
    return relative;
  }
  const existing = await readJson(cwd, relative);
  const hooks = existing.hooks;
  if (!hooks || typeof hooks !== "object") return undefined;
  // Remove only akrctx entries, then drop events left empty. Everything else is the
  // user's and survives untouched.
  const cleaned: Record<string, unknown> = {};
  for (const [event, entries] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(entries)) {
      cleaned[event] = entries;
      continue;
    }
    const kept = entries.filter((entry) => !isakrctxEntry(entry));
    if (kept.length > 0) cleaned[event] = kept;
  }
  // Drop the hooks key entirely when nothing of the user's remains, rather than leaving an
  // empty object behind in a settings file akrctx does not own.
  const { hooks: _removed, ...rest } = existing;
  const next = Object.keys(cleaned).length === 0 ? rest : { ...existing, hooks: cleaned };
  if (!options.dryRun) {
    await writePlannedFile(cwd, relative, `${JSON.stringify(next, null, 2)}\n`, {
      force: true,
      reason: "Removed akrctx session trace hooks.",
    });
  }
  return relative;
}

async function isWired(cwd: string, target: Target): Promise<boolean> {
  const relative = hostConfigPath[target];
  if (target === "pi") {
    return (await readFile(path.join(cwd, relative), "utf8").catch(() => "")).includes("akrctx");
  }
  return isakrctxEntry((await readJson(cwd, relative)).hooks);
}

/**
 * Claude Code and Codex share this shape:
 * `hooks: { Event: [ { matcher?, hooks: [ { type, command, timeout } ] } ] }`.
 * Merge into whatever is already there — a settings file is the user's, not ours.
 */
function mergeHookTable(existing: Record<string, unknown>, host: Target): Record<string, unknown> {
  const hooks = { ...((existing.hooks as Record<string, unknown>) ?? {}) };
  for (const event of tracedEvents) {
    const current = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    const foreign = current.filter((entry) => !isakrctxEntry(entry));
    hooks[event] = [
      ...foreign,
      {
        hooks: [{ type: "command", command: hookCommand(event, host), timeout: timeoutSeconds }],
      },
    ];
  }
  return { ...existing, hooks };
}

/**
 * Copilot's own schema: `{ version, hooks: { Event: [ { type, command, timeoutSec } ] } }`.
 * Registered under the VS Code-compatible PascalCase names, because Copilot then emits the
 * same snake_case payload as the other two. That is taken from its published reference and
 * not yet from an observed run — the normalizer accepts both dialects either way.
 */
function mergeCopilot(existing: Record<string, unknown>, host: Target): Record<string, unknown> {
  const hooks = { ...((existing.hooks as Record<string, unknown>) ?? {}) };
  for (const event of copilotEvents) {
    const current = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    hooks[event] = [
      ...current.filter((entry) => !isakrctxEntry(entry)),
      {
        type: "command",
        command: hookCommand(event, host),
        timeoutSec: timeoutSeconds,
      },
    ];
  }
  return { version: 1, ...existing, hooks };
}

/** True when any `command` anywhere inside the entry is one of ours. */
function isakrctxEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  if (Array.isArray(entry)) return entry.some(isakrctxEntry);
  return Object.entries(entry as Record<string, unknown>).some(([key, value]) =>
    key === "command" ? isakrctxCommand(value) : isakrctxEntry(value),
  );
}

/**
 * Read a host settings file, distinguishing "absent" from "present but unmergeable".
 *
 * Collapsing both to `{}` was destructive: the merged result is written back with
 * `force: true`, so a settings file that failed to parse — corrupt, or simply newer than
 * this CLI understands — was replaced wholesale by akrctx's own hooks, and everything the
 * user had in it was gone. Refusing to write is the only safe answer for a file akrctx
 * does not own.
 */
async function readJson(cwd: string, relative: string): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readFile(path.join(cwd, relative), "utf8");
  } catch (error) {
    // Only a genuinely missing file counts as absent. A permission error or an unreadable
    // device would otherwise be treated as "nothing there" and then overwritten with force.
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw new Error(`${relative} exists but could not be read, so akrctx will not touch it. Nothing was written.`);
  }
  if (!raw.trim()) {
    throw new Error(`${relative} exists but is empty, so akrctx will not merge into it. Remove it, then rerun.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      `${relative} is not valid JSON, so akrctx will not merge into it — fix or move it, then rerun. Nothing was written.`,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `${relative} does not contain a JSON object, so akrctx will not merge into it. Nothing was written.`,
    );
  }
  return value as Record<string, unknown>;
}

/**
 * Pi has no hooks. An extension runs inside the agent runtime and shells out to the same
 * entry point, so the decision logic stays in one place.
 */
function piExtension(): string {
  // The interpreter and entry point are pinned here for the same reason they are pinned in
  // the hook commands: a bare `akrctx` resolves against whatever is on the agent's PATH.
  // Pi ignores the child's exit code, so a stale binary cannot deny a tool call — but it
  // would silently record nothing while `trace status` kept reporting Pi as wired, which is
  // a worse failure for a measurement feature than a loud one.
  const node = JSON.stringify(process.execPath);
  const entry = JSON.stringify(resolveCliEntry());
  return `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// akrctx session trace. Observes only — it never blocks a tool call.
// The decision logic lives in the akrctx CLI so every host shares one implementation.

async function emit(event: string, payload: unknown): Promise<void> {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve) => {
    try {
      const child = spawn(${node}, [${entry}, "hook", event, "${TRACE_MARKER}", "--akrctx-host", "pi"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
      // Never let a trace failure surface in the agent's session.
      child.on("error", () => resolve());
      child.on("close", () => resolve());
      child.stdin.end(JSON.stringify(payload));
    } catch {
      resolve();
    }
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    await emit("SessionStart", { session_id: ctx.sessionId, cwd: ctx.cwd, source: event.reason });
  });

  pi.on("${piToolEvents.call}", async (event, ctx) => {
    await emit("PreToolUse", {
      session_id: ctx.sessionId,
      cwd: ctx.cwd,
      tool_name: event.toolName,
      tool_use_id: event.toolCallId,
      tool_input: event.input,
    });
    // No return value: phase 1 observes and never blocks.
  });

  // Without this, every Pi write stayed an unresolved attempt and the session could never
  // reach the mutation denominator. Pi carries the same toolCallId on both events, so the
  // attempt and its outcome correlate exactly.
  pi.on("${piToolEvents.result}", async (event, ctx) => {
    await emit("PostToolUse", {
      session_id: ctx.sessionId,
      cwd: ctx.cwd,
      tool_name: event.toolName,
      tool_use_id: event.toolCallId,
      tool_input: event.input,
      tool_result: { isError: event.isError === true },
    });
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await emit("SessionEnd", { session_id: ctx.sessionId, cwd: ctx.cwd });
  });
}
`;
}
