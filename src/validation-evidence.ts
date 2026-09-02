const DEFAULT_MAX_OUTPUT = 4096;
const DEFAULT_MAX_COMMAND = 1024;
const SECRET_NAME = String.raw`(?:[A-Za-z0-9]+[_-])*(?:token|password|passwd|secret|api[_-]?key|authorization|private[_-]?key|access[_-]?key|credential)(?:[_-][A-Za-z0-9]+)*`;
const SECRET_VALUE = String.raw`(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+)`;
const SECRET_ASSIGNMENT_RE = new RegExp(String.raw`(\b${SECRET_NAME}\s*[=:]\s*)${SECRET_VALUE}`, "gi");
const SECRET_QUOTED_KEY_RE = new RegExp(String.raw`((["'])${SECRET_NAME}\2\s*:\s*)${SECRET_VALUE}`, "gi");
const SECRET_FLAG_RE = new RegExp(String.raw`(--${SECRET_NAME}\s+)${SECRET_VALUE}`, "gi");

export type ValidationCauseCertainty = "inferred" | "confirmed";

export interface ValidationDiagnosis {
  cause: string;
  certainty: ValidationCauseCertainty;
}

export interface ValidationFailureEvidence {
  command: string;
  status: "failed";
  exitCode: number | null;
  signal: string | null;
  output: string;
  diagnosis?: ValidationDiagnosis;
}

/** Keep command identity stable when it is shown in human and machine reports. */
export function normalizeValidationCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

/** Normalize a command for reporting without retaining inline credentials or unbounded input. */
export function sanitizeValidationCommand(command: string): string {
  return redactValidationOutput(normalizeValidationCommand(command), DEFAULT_MAX_COMMAND);
}

/** Redact common secret-bearing assignments and cap process output before persistence/reporting. */
export function redactValidationOutput(output: string, maxLength = DEFAULT_MAX_OUTPUT): string {
  const redacted = output
    .replace(SECRET_QUOTED_KEY_RE, "$1[REDACTED]")
    .replace(SECRET_ASSIGNMENT_RE, "$1[REDACTED]")
    .replace(SECRET_FLAG_RE, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/[^\s]+/gi, "[URL REDACTED]");
  if (redacted.length <= maxLength) return redacted;
  return `${redacted.slice(0, Math.max(0, maxLength - 12))}\n[truncated]`;
}

/** Capture only the current failed execution; observations are not causal diagnoses. */
export function captureValidationError(
  command: string,
  error: unknown,
  maxOutput = DEFAULT_MAX_OUTPUT,
  diagnosis?: ValidationDiagnosis,
): ValidationFailureEvidence {
  const details = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const exitCode = typeof details.code === "number" ? details.code : null;
  const signal = typeof details.signal === "string" ? details.signal : null;
  const stdout = typeof details.stdout === "string" ? details.stdout : "";
  const stderr = typeof details.stderr === "string" ? details.stderr : "";
  const sections = [stderr && `stderr:\n${stderr}`, stdout && `stdout:\n${stdout}`].filter(Boolean).join("\n");
  return {
    command: sanitizeValidationCommand(command),
    status: "failed",
    exitCode,
    signal,
    output: redactValidationOutput(sections || "[no diagnostic output]", maxOutput),
    ...(diagnosis
      ? { diagnosis: { cause: redactValidationOutput(diagnosis.cause, 512), certainty: diagnosis.certainty } }
      : {}),
  };
}
