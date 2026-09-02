import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  agentDiscoveryNotice,
  agentFilePathList,
  agentFiles,
  agentWarnings,
  resolveAgent,
  withAgentSetting,
} from "./agents.js";
import { hasValidLocalIgnore, localIgnorePath } from "./comprehension.js";
import { readConfig, writeConfig } from "./config.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import { createManifestFromWrites } from "./manifest.js";
import { findTaskDirectory } from "./task.js";
import type { CommandOptions, Target, WriteResult } from "./types.js";
import { CLI_VERSION } from "./version.js";

/**
 * The implementation log.
 *
 * It lives under `.akrctx/local/impl/<TASK-ID>/log.md`, which `.akrctx/local/.gitignore`
 * already excludes from Git. That placement is load-bearing rather than incidental: a log
 * inside the capsule would be a tracked file in the review diff, which would make the
 * implementing agent's own account of its work readable by the judge as evidence — the one
 * thing the judge contract forbids. It is also why `capsuleFiles` stays at five entries and
 * `taskDigest` cannot move when a round is recorded.
 *
 * That property depends on a file the store does not own, so every command here checks it
 * rather than assuming it. A log written under a missing or weakened ignore is a tracked
 * file, and the boundary the placement exists to guarantee is gone.
 */

export const EXPOSED_LOG_REASON = `${localIgnorePath} is missing or no longer ignores local akrctx storage, so the implementation log would enter the review diff the judge reads. Run \`akrctx doctor --fix\` first.`;

export interface ValidationRun {
  command: string;
  status: "passed" | "failed" | "not-run";
  /** Verbatim result. A summarized result is not evidence. */
  output: string;
  /** Explicit TDD phase; absent on legacy/non-TDD records. */
  phase?: "red" | "green";
  /** Text that must be present in the red output to identify the expected regression. */
  expectedFailure?: string;
}

export interface RoundRecord {
  round: number;
  timestamp: string;
  criteria: string[];
  files: string[];
  validation: ValidationRun[];
  blocker?: string;
  decisionNeeded?: string;
}

export interface ImplStatusResult {
  taskId: string;
  logPath: string;
  /** Implementer settings resolved through resolveAgent, including legacy fallback. */
  enabled: boolean;
  trigger: string;
  /**
   * Null when the log is unreadable.
   *
   * Not zero: a machine consumer reading `attemptsUsed: 0` from an untrustworthy log would
   * conclude no attempt was ever made, which is the failure the unreadable case exists to
   * prevent. Absence of a count is the honest answer, and `stopped` still holds.
   */
  attemptsUsed: number | null;
  attemptsRemaining: number;
  maxAttempts: number;
  stopped: boolean;
  lastBlocker?: string;
  readable: boolean;
  /** Why the store will not run a round. Absent when it will. */
  blocked?: string;
  error?: string;
  tddEvidence: TddEvidenceResult;
}

export interface TddEvidenceResult {
  required: boolean;
  status: "not-required" | "missing" | "invalid" | "complete";
  reason?: string;
}

export interface ImplStartResult extends ImplStatusResult {
  round?: number;
  refused: boolean;
  reason?: string;
}

export function implLogPath(taskId: string): string {
  return `.akrctx/local/impl/${taskId}/log.md`;
}

const roundHeading = /^## Round (\d+)\b/;

export class UnreadableLogError extends Error {}

/**
 * Parse the persisted rounds.
 *
 * A log that cannot be trusted must not grant a fresh budget, so a heading without a
 * parseable record, or a record that disagrees with its heading, is an error rather than a
 * skipped entry that would silently lower the attempt count.
 */
export function parseLog(content: string): RoundRecord[] {
  const lines = content.split("\n");
  const records: RoundRecord[] = [];
  let headings = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = roundHeading.exec(lines[index]);
    if (!heading) continue;
    headings += 1;
    const start = lines.indexOf("```json", index);
    const end = start === -1 ? -1 : lines.indexOf("```", start + 1);
    if (start === -1 || end === -1) {
      throw new UnreadableLogError(`Round ${heading[1]} has no record block.`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines.slice(start + 1, end).join("\n"));
    } catch {
      throw new UnreadableLogError(`Round ${heading[1]} has an unparseable record block.`);
    }
    const record = parsed as RoundRecord;
    if (!record || typeof record !== "object" || record.round !== Number(heading[1])) {
      throw new UnreadableLogError(`Round ${heading[1]} does not match its record.`);
    }
    records.push(record);
    index = end;
  }

  if (headings !== records.length) throw new UnreadableLogError("Log is truncated.");
  for (let index = 0; index < records.length; index += 1) {
    if (records[index].round !== index + 1) {
      throw new UnreadableLogError(`Rounds are not consecutive at round ${records[index].round}.`);
    }
  }
  return records;
}

export type RoundInput = Omit<RoundRecord, "round" | "timestamp"> & { timestamp?: string };

const validationStatuses = ["passed", "failed", "not-run"] as const;
const recordFields = ["criteria", "files", "validation", "blocker", "decisionNeeded", "timestamp", "round"];

/**
 * Validate a record supplied as JSON.
 *
 * `--record` is the only way into the store that does not go through the typed flags, so
 * without this the log's own guarantees stop holding at the one edge that accepts
 * arbitrary input. `round` is accepted and dropped: it is derived from the persisted log
 * at append time, and rejecting it would fail a caller who echoed back a previous record.
 */
export function parseRecordInput(value: unknown): RoundInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("--record expects a JSON object with a round record.");
  }
  const raw = value as Record<string, unknown>;
  const unknownField = Object.keys(raw).find((key) => !recordFields.includes(key));
  if (unknownField) {
    throw new Error(`--record has an unknown field "${unknownField}". Valid fields: ${recordFields.join(", ")}.`);
  }

  const record: RoundInput = {
    criteria: stringArray(raw.criteria, "criteria"),
    files: stringArray(raw.files, "files"),
    validation: validationArray(raw.validation),
  };
  if (raw.blocker !== undefined) record.blocker = requireString(raw.blocker, "blocker");
  if (raw.decisionNeeded !== undefined) record.decisionNeeded = requireString(raw.decisionNeeded, "decisionNeeded");
  if (raw.timestamp !== undefined) record.timestamp = requireTimestamp(raw.timestamp);
  return record;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`--record field "${field}" must be a string.`);
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`--record field "${field}" must be an array of strings.`);
  }
  return value as string[];
}

function validationArray(value: unknown): ValidationRun[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('--record field "validation" must be an array.');
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`--record field "validation[${index}]" must be an object.`);
    }
    const run = entry as Record<string, unknown>;
    const status = run.status;
    if (!validationStatuses.includes(status as ValidationRun["status"])) {
      throw new Error(`--record field "validation[${index}].status" must be one of: ${validationStatuses.join(", ")}.`);
    }
    return {
      command: requireString(run.command, `validation[${index}].command`),
      status: status as ValidationRun["status"],
      output: requireString(run.output, `validation[${index}].output`),
      ...(run.phase === undefined ? {} : { phase: requirePhase(run.phase, `validation[${index}].phase`) }),
      ...(run.expectedFailure === undefined
        ? {}
        : { expectedFailure: requireString(run.expectedFailure, `validation[${index}].expectedFailure`) }),
    };
  });
}

function requirePhase(value: unknown, field: string): "red" | "green" {
  if (value !== "red" && value !== "green") throw new Error(`--record field "${field}" must be red or green.`);
  return value;
}

function requireTimestamp(value: unknown): string {
  const timestamp = requireString(value, "timestamp");
  if (Number.isNaN(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    throw new Error('--record field "timestamp" must be an ISO-8601 instant, for example 2026-08-07T09:00:00.000Z.');
  }
  return timestamp;
}

export function renderRound(record: RoundRecord): string {
  return `## Round ${record.round} — ${record.timestamp}

\`\`\`json
${JSON.stringify(record, null, 2)}
\`\`\`
`;
}

async function readRecords(cwd: string, taskId: string): Promise<{ records: RoundRecord[]; error?: string }> {
  const absolute = path.join(cwd, implLogPath(taskId));
  if (!(await pathExists(absolute))) return { records: [] };
  const content = await readFile(absolute, "utf8");
  try {
    return { records: parseLog(content) };
  } catch (error) {
    return { records: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function taskRequiresTdd(cwd: string, taskId: string): Promise<boolean> {
  const taskDir = await findTaskDirectory(cwd, taskId);
  if (!taskDir) return false;
  try {
    const plan = await readFile(path.join(cwd, taskDir, "plan.md"), "utf8");
    const workflow = /## Workflow\n\n-?\s*([^\n]+)/.exec(plan)?.[1]?.trim();
    return workflow === "TDD" || workflow === "SDD+TDD" || workflow === "TDD+EDD";
  } catch {
    return false;
  }
}

export function checkTddEvidence(required: boolean, record?: RoundRecord): TddEvidenceResult {
  if (!required) return { required: false, status: "not-required" };
  if (!record) return { required: true, status: "missing", reason: "No implementation round has been recorded yet." };
  const legacy = record.validation.every((run) => run.phase === undefined && run.expectedFailure === undefined);
  if (legacy) {
    return {
      required: true,
      status: "missing",
      reason: "The latest implementation round predates explicit TDD phase evidence.",
    };
  }
  const red = record.validation.filter((run) => run.phase === "red");
  const green = record.validation.filter((run) => run.phase === "green");
  if (red.length !== 1 || green.length !== 1) {
    return {
      required: true,
      status: "invalid",
      reason: "A TDD round must contain exactly one red and one green validation.",
    };
  }
  const redRun = red[0];
  const greenRun = green[0];
  if (record.validation.indexOf(redRun) > record.validation.indexOf(greenRun)) {
    return { required: true, status: "invalid", reason: "TDD evidence must be ordered red→green." };
  }
  if (redRun.status !== "failed" || greenRun.status !== "passed") {
    return { required: true, status: "invalid", reason: "TDD red evidence must fail and green evidence must pass." };
  }
  if (normalizeValidationCommand(redRun.command) !== normalizeValidationCommand(greenRun.command)) {
    return {
      required: true,
      status: "invalid",
      reason: "TDD red and green evidence must use the same normalized command.",
    };
  }
  if (!redRun.expectedFailure || !redRun.output.includes(redRun.expectedFailure)) {
    return { required: true, status: "invalid", reason: "TDD red output must include the declared expectedFailure." };
  }
  if (!greenRun.output)
    return { required: true, status: "invalid", reason: "TDD green evidence must preserve its output." };
  return { required: true, status: "complete" };
}

export function normalizeValidationCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

export async function runImplStatus(taskId: string, options: CommandOptions): Promise<ImplStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  const resolved = resolveAgent(config, "implementer");
  const budget = resolved.maxAttempts;
  const unusable = {
    taskId,
    logPath: implLogPath(taskId),
    enabled: resolved.enabled,
    trigger: resolved.trigger,
    attemptsUsed: null,
    attemptsRemaining: 0,
    maxAttempts: budget,
    stopped: true,
    tddEvidence: { required: false, status: "not-required" } as TddEvidenceResult,
  } satisfies Partial<ImplStatusResult>;

  if (!(await hasValidLocalIgnore(cwd))) {
    return { ...unusable, readable: true, blocked: EXPOSED_LOG_REASON, error: EXPOSED_LOG_REASON };
  }

  const { records, error } = await readRecords(cwd, taskId);
  // An unreadable log is not zero attempts used. Reporting a count would hand a fresh
  // budget to the agent whose log stopped being trustworthy.
  if (error) {
    const blocked = `Implementation log is unreadable: ${error}`;
    return { ...unusable, readable: false, blocked, error };
  }

  const tddEvidence = checkTddEvidence(await taskRequiresTdd(cwd, taskId), records[records.length - 1]);
  // Phase-less persisted records predate this contract. Keep them visible as missing evidence,
  // but allow a new compliant round to advance the append-only log. Records carrying partial
  // phase metadata are current-contract records and remain blocking when invalid.
  const evidenceBlocked = records.length > 0 && tddEvidence.status === "invalid" && tddEvidence.required;
  const stopped = !resolved.enabled || records.length >= budget;
  const budgetBlocked = stopped
    ? `Attempt budget spent: ${records.length} of ${budget} rounds recorded. Hand the task back instead of starting another round.`
    : undefined;
  return {
    taskId,
    logPath: implLogPath(taskId),
    enabled: resolved.enabled,
    trigger: resolved.trigger,
    attemptsUsed: records.length,
    attemptsRemaining: Math.max(0, budget - records.length),
    maxAttempts: budget,
    stopped,
    lastBlocker: records.length ? records[records.length - 1].blocker : undefined,
    readable: true,
    tddEvidence,
    blocked: !resolved.enabled
      ? "Implementer is disabled in the resolved configuration. Ask the user to enable it before delegating."
      : evidenceBlocked
        ? `TDD red→green evidence is incomplete: ${tddEvidence.reason}`
        : budgetBlocked,
  };
}

export async function runImplStart(taskId: string, options: CommandOptions): Promise<ImplStartResult> {
  const cwd = options.cwd ?? process.cwd();
  const status = await runImplStatus(taskId, options);
  if (status.blocked) return { ...status, refused: true, reason: status.blocked };
  const absolute = path.join(cwd, implLogPath(taskId));
  if (!(await pathExists(absolute)) && !options.dryRun) {
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, implLogHeader(taskId), "utf8");
  }
  // The round is reported, never reserved: it is derived from the persisted records at
  // append time, so two `start` calls with no `log` between them cannot disagree.
  // `attemptsUsed` is a number here: the unreadable case returned above.
  return { ...status, round: (status.attemptsUsed ?? 0) + 1, refused: false };
}

function implLogHeader(taskId: string): string {
  return `# Implementation Log — ${taskId}

Append-only. One record per round, written by \`akrctx impl log\`. This file is local and
ignored by Git: it is outside every review boundary by construction.

`;
}

export interface ImplLogResult extends ImplStatusResult {
  record?: RoundRecord;
  refused: boolean;
  reason?: string;
}

export async function runImplLog(
  taskId: string,
  input: Omit<RoundRecord, "round" | "timestamp"> & { timestamp?: string },
  options: CommandOptions,
): Promise<ImplLogResult> {
  const cwd = options.cwd ?? process.cwd();
  const status = await runImplStatus(taskId, options);
  // Every refusal belongs to the store, not to `start`. A caller that skipped the opening
  // command must not thereby escape the checks that command exists to apply.
  if (status.blocked) return { ...status, refused: true, reason: status.blocked };

  const used = (status.attemptsUsed ?? 0) + 1;
  const record: RoundRecord = {
    round: used,
    timestamp: input.timestamp ?? new Date().toISOString(),
    criteria: input.criteria ?? [],
    files: input.files ?? [],
    validation: input.validation ?? [],
    ...(input.blocker ? { blocker: input.blocker } : {}),
    ...(input.decisionNeeded ? { decisionNeeded: input.decisionNeeded } : {}),
  };

  const tddEvidence = checkTddEvidence(await taskRequiresTdd(cwd, taskId), record);
  if (tddEvidence.required && tddEvidence.status !== "complete") {
    const reason = `TDD red→green evidence is incomplete: ${tddEvidence.reason}`;
    return { ...status, tddEvidence, refused: true, reason, blocked: reason };
  }

  const absolute = path.join(cwd, implLogPath(taskId));
  if (!options.dryRun) {
    await mkdir(path.dirname(absolute), { recursive: true });
    const existing = (await pathExists(absolute)) ? "" : implLogHeader(taskId);
    // One record, one atomic append: earlier rounds are never rewritten.
    await writeFile(absolute, `${existing}${renderRound(record)}\n`, { encoding: "utf8", flag: "a" });
  }

  const stopped = used >= status.maxAttempts;
  return {
    ...status,
    record,
    tddEvidence,
    refused: false,
    attemptsUsed: used,
    attemptsRemaining: Math.max(0, status.maxAttempts - used),
    stopped,
    lastBlocker: record.blocker,
    blocked:
      tddEvidence.required && tddEvidence.status !== "complete"
        ? `TDD red→green evidence is incomplete: ${tddEvidence.reason}`
        : stopped
          ? `Attempt budget spent: ${used} of ${status.maxAttempts} rounds recorded. No further rounds can be appended.`
          : undefined,
  };
}

export interface ImplEnableResult {
  dryRun: boolean;
  installedTargets: Target[];
  skippedTargets: Target[];
  writes: WriteResult[];
  maxAttempts: number;
  models: Array<{ target: Target; model?: string; configPath: string }>;
  warnings: string[];
  discoveryNotice?: string;
}

export async function runImplEnable(options: CommandOptions): Promise<ImplEnableResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  if (!(await hasValidLocalIgnore(cwd))) throw new Error(EXPOSED_LOG_REASON);

  const resolved = resolveAgent(config, "implementer");
  const installedTargets = resolved.targets;
  const skippedTargets = config.targets.filter((target) => !(installedTargets as Target[]).includes(target));
  if (installedTargets.length === 0) {
    throw new Error("No installed target has an implementer agent format.");
  }

  // Read before the writes below create the directory.
  const discoveryNotice = await agentDiscoveryNotice(cwd, "implementer", installedTargets, { dryRun: options.dryRun });

  const writes: WriteResult[] = [];
  for (const target of installedTargets) {
    for (const [relativePath, content] of Object.entries(agentFiles("implementer", target, resolved.model[target]))) {
      writes.push(
        await writePlannedFile(cwd, relativePath, content, {
          dryRun: options.dryRun,
          // Regenerated, not preserved: the file is generated from configuration and
          // `akrctx upgrade` already rewrites it. Preserving it here is what made a model
          // set after the first enable never reach the file.
          force: true,
          reason: `akrctx implementer agent file for ${target}.`,
        }),
      );
    }
  }

  const next = withAgentSetting(config, "implementer", { enabled: true, trigger: resolved.trigger });
  if (!options.dryRun) {
    await writeConfig(cwd, next);
    writes.push(await createManifestFromWrites(cwd, writes, CLI_VERSION));
  }

  return {
    dryRun: Boolean(options.dryRun),
    installedTargets,
    skippedTargets,
    writes,
    maxAttempts: resolved.maxAttempts,
    models: installedTargets.map((target) => ({
      target,
      model: resolved.model[target],
      configPath: `agents.implementer.model.${target}`,
    })),
    warnings: agentWarnings(next)
      .filter((warning) => warning.agent === "implementer")
      .map((warning) => warning.text),
    discoveryNotice,
  };
}

export async function runImplDisable(options: CommandOptions): Promise<{ dryRun: boolean }> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  if (!options.dryRun) {
    await writeConfig(cwd, withAgentSetting(config, "implementer", { enabled: false }));
  }
  return { dryRun: Boolean(options.dryRun) };
}

export function implementerAgentFiles(targets: Target[]): string[] {
  return agentFilePathList("implementer", targets);
}
