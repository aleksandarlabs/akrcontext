#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { compareScenarios, resolveRef } from "./lib/compare.mjs";
import { isWorktreeDirty } from "./lib/git.mjs";
import { evaluationEnvironment } from "./lib/process.mjs";
import { overallOutcome, writeReport } from "./lib/report.mjs";
import { runScenario } from "./lib/run.mjs";
import { loadScenarioFiles, scenarioDigest } from "./lib/scenario.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenariosRoot = path.join(repoRoot, "evals", "scenarios");

function parseArgs(argv) {
  const options = {
    command: "run",
    suite: "smoke",
    base: "origin/main",
    candidate: "HEAD",
    keepWorkdir: false,
    list: false,
  };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) options.command = args.shift();
  const takeValue = (option) => {
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
    return value;
  };
  while (args.length) {
    const arg = args.shift();
    if (arg === "--") continue;
    if (arg === "--list") options.list = true;
    else if (arg === "--keep-workdir") options.keepWorkdir = true;
    else if (arg === "--suite") options.suite = takeValue(arg);
    else if (arg === "--scenario") options.scenario = takeValue(arg);
    else if (arg === "--base") options.base = takeValue(arg);
    else if (arg === "--candidate") options.candidate = takeValue(arg);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function runId(mode) {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${mode}`;
}

function printSummary(report, reportPath) {
  const mechanism = report.summary.failed === 0 ? "PASS" : "FAIL";
  const outcome = overallOutcome(report.summary);
  console.log(
    `Scenarios: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.inconclusive} inconclusive`,
  );
  console.log(`Mechanism: ${mechanism}`);
  console.log(`Outcome: ${outcome}`);
  console.log(`Report: ${path.relative(repoRoot, reportPath)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenarios = await loadScenarioFiles(scenariosRoot, { suite: options.suite, scenario: options.scenario });
  const scenarioSet = { suite: options.suite, count: scenarios.length, sha256: scenarioDigest(scenarios) };
  if (options.list) {
    for (const scenario of scenarios) console.log(`${scenario.id}\t${scenario.changeType}\t${scenario.hypothesis}`);
    return;
  }
  if (scenarios.length === 0) throw new Error("No evaluation scenarios matched.");
  let input;
  if (options.command === "run") {
    const buildHome = path.join(repoRoot, "evals", ".cache", "current-home");
    await mkdir(buildHome, { recursive: true });
    await execFileAsync("corepack", ["pnpm", "build"], {
      cwd: repoRoot,
      timeout: 180_000,
      env: evaluationEnvironment(buildHome),
    });
    const results = [];
    for (const scenario of scenarios) {
      results.push(
        await runScenario(scenario, {
          repoRoot,
          cliEntry: path.join(repoRoot, "dist", "index.js"),
          keepWorkdir: options.keepWorkdir,
        }),
      );
    }
    input = {
      mode: "run",
      scenarioSet,
      repository: {
        candidate: await resolveRef(repoRoot, "HEAD"),
        dirty: await isWorktreeDirty(repoRoot),
      },
      results,
    };
  } else if (options.command === "compare") {
    const compared = await compareScenarios(scenarios, {
      repoRoot,
      baseRef: options.base,
      candidateRef: options.candidate,
      cacheRoot: path.join(repoRoot, "evals", ".cache", "builds"),
      keepWorkdir: options.keepWorkdir,
    });
    input = {
      mode: "compare",
      scenarioSet,
      repository: {
        baseRef: options.base,
        base: compared.base.sha,
        candidateRef: options.candidate,
        candidate: compared.candidate.sha,
        dirty: await isWorktreeDirty(repoRoot),
        cache: { base: compared.base.cacheHit, candidate: compared.candidate.cacheHit },
      },
      results: compared.results,
    };
  } else {
    throw new Error(`Unknown command: ${options.command}. Use run or compare.`);
  }
  const written = await writeReport(input, {
    outputRoot: path.join(repoRoot, "evals", "results"),
    runId: runId(input.mode),
    repoRoot,
  });
  printSummary(written.report, written.markdownPath);
  if (written.report.summary.failed > 0 || written.report.summary.worsened > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
