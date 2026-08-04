import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { resolveInsideFixture } from "./path.mjs";
import { reportValue } from "./safe-report.mjs";

const execFileAsync = promisify(execFile);

function stepAt(assertion, context) {
  const result = context.stepResults[assertion.step ?? 0];
  if (!result) throw new Error(`Assertion references missing step ${assertion.step ?? 0}.`);
  return result;
}

function result(assertion, passed, expected, actual) {
  return { type: assertion.type, passed, expected: reportValue(expected), actual: reportValue(actual) };
}

function getDotPath(value, dotPath) {
  return dotPath.split(".").reduce((current, key) => current?.[key], value);
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export async function evaluateAssertions(assertions, context) {
  const output = [];
  for (const assertion of assertions) {
    if (assertion.type === "exitCode") {
      const actual = stepAt(assertion, context).exitCode;
      output.push(result(assertion, actual === assertion.equals, assertion.equals, actual));
    } else if (
      assertion.type === "stdoutContains" ||
      assertion.type === "stdoutExcludes" ||
      assertion.type === "stderrContains" ||
      assertion.type === "stderrExcludes"
    ) {
      const step = stepAt(assertion, context);
      const stream = assertion.type.startsWith("stdout") ? step.stdout : step.stderr;
      const contains = stream.includes(assertion.value);
      const expected = assertion.type.endsWith("Contains");
      output.push(result(assertion, contains === expected, expected, contains));
    } else if (assertion.type === "stdoutJsonPathEquals") {
      const value = JSON.parse(stepAt(assertion, context).stdout);
      const actual = getDotPath(value, assertion.jsonPath);
      output.push(result(assertion, Object.is(actual, assertion.equals), assertion.equals, actual));
    } else if (assertion.type === "durationUnder") {
      const actual = stepAt(assertion, context).durationMs;
      output.push(result(assertion, actual < assertion.milliseconds, `< ${assertion.milliseconds}ms`, `${actual}ms`));
    } else if (assertion.type === "fileExists" || assertion.type === "fileNotExists") {
      const actual = await exists(await resolveInsideFixture(context.fixtureRoot, assertion.path));
      const expected = assertion.type === "fileExists";
      output.push(result(assertion, actual === expected, expected, actual));
    } else if (assertion.type === "jsonPathEquals") {
      const value = JSON.parse(await readFile(await resolveInsideFixture(context.fixtureRoot, assertion.path), "utf8"));
      const actual = getDotPath(value, assertion.jsonPath);
      output.push(result(assertion, Object.is(actual, assertion.equals), assertion.equals, actual));
    } else if (assertion.type === "fileHashEquals") {
      const data = await readFile(await resolveInsideFixture(context.fixtureRoot, assertion.path));
      const actual = createHash("sha256").update(data).digest("hex");
      output.push(result(assertion, actual === assertion.equals, assertion.equals, actual));
    } else if (assertion.type === "gitClean") {
      let actual = false;
      try {
        const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: context.fixtureRoot });
        actual = stdout.length === 0;
      } catch {
        actual = false;
      }
      output.push(result(assertion, actual === assertion.equals, assertion.equals, actual));
    } else {
      output.push(result(assertion, false, "known assertion type", assertion.type));
    }
  }
  return output;
}
