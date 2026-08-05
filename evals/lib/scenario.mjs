import { createHash } from "node:crypto";
import path from "node:path";

const changeTypes = new Set(["fix", "feature", "observability", "refactor", "docs"]);
const outcomeVerdicts = new Set(["improved", "preserved", "worsened", "inconclusive", "not-applicable"]);
const expectedMechanisms = new Set(["pass", "fail"]);
const assertionRequirements = new Map([
  ["exitCode", { number: ["equals"] }],
  ["stdoutContains", { string: ["value"] }],
  ["stdoutExcludes", { string: ["value"] }],
  ["stderrContains", { string: ["value"] }],
  ["stderrExcludes", { string: ["value"] }],
  ["stdoutJsonPathEquals", { string: ["jsonPath"], any: ["equals"] }],
  ["durationUnder", { number: ["milliseconds"] }],
  ["fileExists", { path: ["path"] }],
  ["fileNotExists", { path: ["path"] }],
  ["jsonPathEquals", { path: ["path"], string: ["jsonPath"], any: ["equals"] }],
  ["fileHashEquals", { path: ["path"], string: ["equals"] }],
  ["gitClean", { boolean: ["equals"] }],
]);
const topLevelKeys = new Set([
  "id",
  "title",
  "changeType",
  "hypothesis",
  "fixture",
  "steps",
  "assertions",
  "comparison",
  "outcome",
  "tags",
  "suite",
]);
const processAssertionTypes = new Set([
  "exitCode",
  "stdoutContains",
  "stdoutExcludes",
  "stderrContains",
  "stderrExcludes",
  "stdoutJsonPathEquals",
  "durationUnder",
]);

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
}

function rejectUnknownKeys(value, allowed, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${field} key: ${key}.`);
  }
}

function requireAssertionField(assertion, index, field, kind) {
  const label = `assertions[${index}].${field}`;
  const value = assertion[field];
  if (kind === "any" && value === undefined) throw new Error(`${label} is required.`);
  if (kind === "string") requireString(value, label);
  if (kind === "number" && (typeof value !== "number" || !Number.isFinite(value)))
    throw new Error(`${label} must be a finite number.`);
  if (kind === "boolean" && typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  if (kind === "path" && !isFixtureRelative(value)) throw new Error(`${label} must stay inside the fixture.`);
}

export function isFixtureRelative(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  return normalized !== ".." && !normalized.startsWith("../");
}

export function validateScenario(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Scenario must be a JSON object.");
  for (const key of Object.keys(value)) {
    if (!topLevelKeys.has(key)) throw new Error(`Unknown scenario key: ${key}.`);
  }
  requireString(value.id, "id");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) throw new Error("id must be stable kebab-case.");
  requireString(value.title, "title");
  if (!changeTypes.has(value.changeType)) throw new Error(`changeType must be one of: ${[...changeTypes].join(", ")}.`);
  requireString(value.hypothesis, "hypothesis");
  requireString(value.fixture, "fixture");
  if (!Array.isArray(value.steps) || value.steps.length === 0) throw new Error("steps must be a non-empty array.");
  value.steps.forEach((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) throw new Error(`steps[${index}] must be an object.`);
    rejectUnknownKeys(step, new Set(["command", "cwd", "stdin", "timeoutMs"]), `steps[${index}]`);
    if (
      !Array.isArray(step.command) ||
      step.command.length === 0 ||
      step.command.some((part) => typeof part !== "string")
    ) {
      throw new Error(`steps[${index}].command must be a non-empty string array.`);
    }
    if (step.cwd !== undefined && !isFixtureRelative(step.cwd))
      throw new Error(`steps[${index}].cwd path must stay inside the fixture.`);
    if (step.timeoutMs !== undefined && (!Number.isInteger(step.timeoutMs) || step.timeoutMs <= 0))
      throw new Error(`steps[${index}].timeoutMs must be a positive integer.`);
  });
  if (!Array.isArray(value.assertions) || value.assertions.length === 0)
    throw new Error("assertions must be a non-empty array.");
  value.assertions.forEach((assertion, index) => {
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion))
      throw new Error(`assertions[${index}] must be an object.`);
    requireString(assertion.type, `assertions[${index}].type`);
    const requirements = assertionRequirements.get(assertion.type);
    if (!requirements) throw new Error(`Unknown assertion type: ${assertion.type}.`);
    const allowedAssertionKeys = new Set(["type", ...Object.values(requirements).flat()]);
    if (processAssertionTypes.has(assertion.type)) allowedAssertionKeys.add("step");
    rejectUnknownKeys(assertion, allowedAssertionKeys, `assertions[${index}]`);
    for (const [kind, fields] of Object.entries(requirements)) {
      for (const field of fields) requireAssertionField(assertion, index, field, kind);
    }
    if (
      assertion.step !== undefined &&
      (!Number.isInteger(assertion.step) || assertion.step < 0 || assertion.step >= value.steps.length)
    ) {
      throw new Error(`assertions[${index}].step must reference an existing step.`);
    }
  });
  if (!value.comparison || typeof value.comparison !== "object" || Array.isArray(value.comparison))
    throw new Error("comparison is required.");
  rejectUnknownKeys(value.comparison, new Set(["baseExpected", "candidateExpected"]), "comparison");
  for (const key of ["baseExpected", "candidateExpected"]) {
    if (!expectedMechanisms.has(value.comparison[key])) throw new Error(`comparison.${key} must be pass or fail.`);
  }
  if (!value.outcome || typeof value.outcome !== "object" || Array.isArray(value.outcome))
    throw new Error("outcome is required.");
  rejectUnknownKeys(value.outcome, new Set(["metric", "direction", "verdict", "threshold"]), "outcome");
  requireString(value.outcome.metric, "outcome.metric");
  if (!new Set(["increase", "decrease", "preserve"]).has(value.outcome.direction))
    throw new Error("outcome.direction must be increase, decrease, or preserve.");
  if (value.outcome.verdict !== undefined && !outcomeVerdicts.has(value.outcome.verdict))
    throw new Error("outcome.verdict is invalid.");
  if (value.changeType === "docs" && value.outcome.verdict !== "not-applicable") {
    throw new Error("Documentation outcomes must use the not-applicable verdict.");
  }
  if (
    value.changeType === "feature" &&
    value.outcome.verdict === "improved" &&
    typeof value.outcome.threshold !== "number"
  ) {
    throw new Error("An improved feature outcome requires a numeric threshold.");
  }
  if (new Set(["feature", "observability", "refactor"]).has(value.changeType) && value.outcome.verdict === "improved") {
    throw new Error(
      `${value.changeType} improvement requires an independent outcome grader, which is not available in the deterministic MVP.`,
    );
  }
  return value;
}

export async function loadScenarioFiles(root, filters = {}) {
  const { readFile, readdir } = await import("node:fs/promises");
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(absolute);
    }
  }
  await walk(root);
  const scenarios = [];
  for (const file of files.sort()) {
    const scenario = validateScenario(JSON.parse(await readFile(file, "utf8")));
    if (filters.suite && scenario.suite !== filters.suite) continue;
    if (filters.scenario && scenario.id !== filters.scenario) continue;
    scenarios.push(scenario);
  }
  return scenarios;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function scenarioDigest(scenarios) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(scenarios)))
    .digest("hex");
}
