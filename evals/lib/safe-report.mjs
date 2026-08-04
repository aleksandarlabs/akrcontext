import { createHash } from "node:crypto";
import path from "node:path";

function textDigest(text) {
  return {
    bytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}

export function reportValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return { type: typeof value === "string" ? "string" : "json", ...textDigest(text) };
}

export function summarizeStepResult(step) {
  return {
    executable: path.basename(step.command[0]),
    argumentCount: step.command.length - 1,
    exitCode: step.exitCode,
    ...(step.signal ? { signal: step.signal } : {}),
    timedOut: step.timedOut,
    outputLimitExceeded: step.outputLimitExceeded,
    durationMs: step.durationMs,
    stdout: textDigest(step.stdout),
    stderr: textDigest(step.stderr),
  };
}
