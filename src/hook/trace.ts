import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { CLI_VERSION } from "../version.js";
import type { NormalizedEventName } from "./payload.js";

/**
 * Deliberately still 1 after `Area` was widened with a distinct `akrctx` value. The
 * reasoning, and why `cliVersion` cannot disambiguate a pre-widening record, is recorded in
 * `.akrctx/tasks/TASK-005-session-identity-and-trace/context.md`.
 */
export const TRACE_SCHEMA_VERSION = 1;
export const tracesDir = ".akrctx/local/traces";

/**
 * Where a tool acted, classified. Raw paths are deliberately never recorded.
 *
 * `akrctx` and `harness` are separate because the contract is stated in terms of "outside
 * `.akrctx/`". Writing a wiki page is harness bookkeeping; editing CLAUDE.md is not, even
 * though both are harness files in the loose sense.
 */
export type Area = "capsule" | "akrctx" | "harness" | "project" | "outside" | "none";

/** Areas whose mutation is the work the contract governs — everything outside `.akrctx/`. */
export const governedAreas: readonly Area[] = ["harness", "project", "outside"];

export interface TraceHeader {
  kind: "session";
  schemaVersion: typeof TRACE_SCHEMA_VERSION;
  cliVersion: string;
  sessionId: string;
  /**
   * Which agent host produced this session. Supplied by the installer, which knows the
   * target — the payload does not carry it, and without it conformance data cannot be
   * attributed to Claude, Codex, Copilot or Pi.
   */
  host?: string;
  /** How the host said the session began: startup, resume, compact, fork, … */
  source?: string;
  startedAt: string;
  /** HEAD when the session began. Absent in a repository with no commits. */
  baseCommit?: string;
}

export interface TraceObservation {
  kind: "observation";
  at: string;
  event: NormalizedEventName;
  tool?: string;
  /**
   * Host-assigned id for this tool call. An attempt is only settled by the outcome of the
   * *same* call, so without this a later unrelated success would silently resolve it.
   */
  callId?: string;
  area?: Area;
  /** TASK-NNN when the tool acted inside a capsule. */
  capsuleId?: string;
  /**
   * Whether the tool is one that writes. Undefined for a shell command, whose effect
   * cannot be known from the invocation — `sed -i`, `rm` and `git apply` all mutate, and
   * `ls` does not.
   */
  mutating?: boolean;
  /**
   * Whether the call was only requested, or ran and how it ended.
   *
   * A PreToolUse observation is an *attempt*: the user may still reject it, or the tool may
   * fail. Counting attempts as changes made the denominator wrong in both directions, so
   * the outcome is recorded separately and the report only counts calls that were not
   * observed to fail.
   */
  outcome?: "attempted" | "succeeded" | "failed";
  /** A shell command ran. Its effect on the working tree is unknowable from here. */
  shell?: boolean;
  /** The path matched policy.blockedReadPatterns. Recorded as a flag and nothing else. */
  blocked?: boolean;
  /** First two tokens of a shell command — enough to read, not enough to leak. */
  commandHead?: string;
  /** Digest of the whole command, so a declared validation command can be matched exactly. */
  commandDigest?: string;
}

export interface Trace {
  sessionId: string;
  header?: TraceHeader;
  observations: TraceObservation[];
  /**
   * Whether this trace can be aggregated: every line parsed, a header arrived, and the
   * session was seen to end. Anything else is reported as incomplete rather than guessed at.
   */
  complete: boolean;
}

export function traceFilePath(cwd: string, sessionId: string): string {
  return path.join(cwd, tracesDir, `${safeSessionId(sessionId)}.jsonl`);
}

/**
 * Session IDs come from the host and end up in a filename, so they are constrained here
 * rather than trusted. Anything outside the allowed set collapses to a single character,
 * which can merge two hostile IDs but can never escape the traces directory.
 */
export function safeSessionId(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 128);
  return safe.replace(/^[.-]+/, "") || "unknown";
}

/**
 * Append one line. JSONL rather than a rewritten JSON document because this runs on every
 * tool call: reading and rewriting a growing file would make a long session quadratic.
 */
export async function appendTrace(cwd: string, sessionId: string, record: TraceHeader | TraceObservation) {
  const file = traceFilePath(cwd, sessionId);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
}

export function buildHeader(
  sessionId: string,
  source: string | undefined,
  baseCommit?: string,
  host?: string,
): TraceHeader {
  return {
    kind: "session",
    schemaVersion: TRACE_SCHEMA_VERSION,
    cliVersion: CLI_VERSION,
    sessionId,
    ...(host ? { host } : {}),
    ...(source ? { source } : {}),
    startedAt: new Date().toISOString(),
    ...(baseCommit ? { baseCommit } : {}),
  };
}

export async function readTrace(cwd: string, sessionId: string): Promise<Trace> {
  const empty: Trace = { sessionId, observations: [], complete: true };
  let raw: string;
  try {
    raw = await readFile(traceFilePath(cwd, sessionId), "utf8");
  } catch {
    return empty;
  }
  return parseTrace(sessionId, raw);
}

export function parseTrace(sessionId: string, raw: string): Trace {
  const trace: Trace = { sessionId, observations: [], complete: true };
  let lastRecordWasSessionEnd = false;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      // A truncated final line is the normal shape of a session killed mid-write. Report
      // the trace as incomplete instead of dropping it or pretending it is whole.
      trace.complete = false;
      lastRecordWasSessionEnd = false;
      continue;
    }
    const record = value as TraceHeader | TraceObservation;
    if (isHeader(record)) {
      trace.header = record;
      lastRecordWasSessionEnd = false;
    } else if (isObservation(record)) {
      trace.observations.push(record);
      lastRecordWasSessionEnd = record.event === "session-end";
    } else {
      trace.complete = false;
      lastRecordWasSessionEnd = false;
    }
  }
  // A trace whose header never arrived is a trace that started before recording did, or one
  // whose first line was lost. Either way its ordering cannot be trusted, and treating it as
  // whole would quietly feed a partial session into the aggregate.
  if (!trace.header) trace.complete = false;
  // The *current lifecycle* must have ended. Looking for any historical SessionEnd let a
  // resumed session reuse the close from its previous run: header, end, resume header,
  // live observations was incorrectly aggregated as complete.
  if (!lastRecordWasSessionEnd) trace.complete = false;
  return trace;
}

function isHeader(record: unknown): record is TraceHeader {
  const value = record as Partial<TraceHeader> | null;
  return (
    value?.kind === "session" &&
    typeof value.sessionId === "string" &&
    typeof value.startedAt === "string" &&
    value.schemaVersion === TRACE_SCHEMA_VERSION
  );
}

function isObservation(record: unknown): record is TraceObservation {
  const value = record as Partial<TraceObservation> | null;
  return value?.kind === "observation" && typeof value.at === "string" && typeof value.event === "string";
}

export async function listTraceSessions(cwd: string): Promise<string[]> {
  const entries = await readdir(path.join(cwd, tracesDir)).catch(() => [] as string[]);
  return entries.filter((name) => name.endsWith(".jsonl")).map((name) => name.slice(0, -".jsonl".length));
}
