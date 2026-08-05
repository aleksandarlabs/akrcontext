/**
 * Host payload normalization.
 *
 * The three hook hosts send two dialects. Claude Code and Codex send snake_case
 * (`session_id`, `tool_name`, `tool_input`). Copilot sends camelCase (`sessionId`,
 * `toolName`, `toolArgs`) under camelCase event names, and snake_case under its
 * VS Code-compatible PascalCase names. Rather than detect the host and pick, both shapes
 * are accepted unconditionally: it is cheaper, and it removes a whole class of breakage
 * if a vendor changes which dialect it emits.
 *
 * Nothing here throws. A payload this cannot understand still produces a usable event.
 */

export type NormalizedEventName = "session-start" | "pre-tool" | "post-tool" | "stop" | "session-end" | "other";

export interface NormalizedEvent {
  sessionId: string;
  event: NormalizedEventName;
  cwd?: string;
  toolName?: string;
  /** Host-assigned id for one tool call, so an attempt can be paired with its outcome. */
  callId?: string;
  toolInput?: Record<string, unknown>;
  /** PostToolUse result, in whichever shape the host sent. Used only to classify success. */
  toolResult?: Record<string, unknown>;
  /** The host reported this call as failed, by event name or by a top-level error field. */
  failed?: boolean;
  /** SessionStart `source` / SessionEnd `reason`: startup, resume, compact, fork, … */
  source?: string;
}

const eventNames: Record<string, NormalizedEventName> = {
  sessionstart: "session-start",
  pretooluse: "pre-tool",
  posttooluse: "post-tool",
  stop: "stop",
  agentstop: "stop",
  subagentstop: "stop",
  sessionend: "session-end",
  // Copilot routes a failed call here and never to postToolUse, so treating it as a
  // separate kind of event would leave every failure recorded as an unfinished attempt.
  posttoolusefailure: "post-tool",
};

/**
 * Parse stdin without ever throwing. Returns an empty object for anything that is not a
 * JSON object, so a malformed payload degrades to "an event happened, details unknown"
 * rather than to a crash — which on Copilot's preToolUse would deny the tool call.
 */
export function parsePayload(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function normalizePayload(argvEvent: string, payload: Record<string, unknown>): NormalizedEvent {
  // The payload wins over argv: if a config file names the wrong event, the host still
  // reports what actually fired.
  const declared = firstString(payload, ["hook_event_name", "hookEventName", "event", "eventName"]);
  // Copilot's failure event carries a top-level `error` string instead of a result object,
  // so failure is read from the event name and that field rather than from the result shape.
  const failed = /failure/i.test(declared ?? argvEvent) || typeof payload.error === "string";
  return {
    ...(failed ? { failed: true } : {}),
    sessionId: firstString(payload, ["session_id", "sessionId"]) ?? syntheticSessionId(),
    event: normalizeEventName(declared ?? argvEvent),
    cwd: firstString(payload, ["cwd", "workingDirectory"]),
    toolName: firstString(payload, ["tool_name", "toolName"]),
    callId: firstString(payload, ["tool_use_id", "toolUseId", "toolCallId", "tool_call_id"]),
    toolInput: firstObject(payload, ["tool_input", "toolArgs", "toolInput", "input"]),
    toolResult: firstObject(payload, ["tool_result", "toolResult", "tool_response"]),
    source: firstString(payload, ["source", "reason"]),
  };
}

export function normalizeEventName(value: string | undefined): NormalizedEventName {
  if (!value) return "other";
  return eventNames[value.toLowerCase().replace(/[^a-z]/g, "")] ?? "other";
}

/**
 * Stable within one agent process tree, distinct between them.
 *
 * A payload with no session ID would otherwise have to be dropped, losing the very
 * sessions most likely to be interesting. Keying on the parent process keeps such events
 * grouped without inventing an identity that looks like the host's.
 */
function syntheticSessionId(): string {
  return `unknown-${process.ppid}`;
}

function firstString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function firstObject(payload: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return undefined;
}
