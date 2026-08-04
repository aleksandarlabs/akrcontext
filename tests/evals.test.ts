import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { evaluateAssertions } from "../evals/lib/assertions.mjs";
import {
  acquireBuildLock,
  buildCacheKey,
  claimStaleOwnerlessBuildLock,
  classifyComparison,
  isBuildCacheValid,
  releaseBuildLock,
  resolveRef,
} from "../evals/lib/compare.mjs";
import { materializeFixture } from "../evals/lib/fixture.mjs";
import { isWorktreeDirty } from "../evals/lib/git.mjs";
import { executeStep } from "../evals/lib/process.mjs";
import { overallOutcome, summarizeResults, writeReport } from "../evals/lib/report.mjs";
import { runScenario } from "../evals/lib/run.mjs";
import { loadScenarioFiles, scenarioDigest, validateScenario } from "../evals/lib/scenario.mjs";

const validScenario = () => ({
  id: "invalid-config-fails-loudly",
  title: "Corrupt config fails loudly",
  changeType: "fix",
  hypothesis: "A corrupt config cannot relax the project contract.",
  fixture: "initialized-claude",
  steps: [{ command: ["$AKRCTX", "config", "show"] }],
  assertions: [{ type: "exitCode", step: 0, equals: 1 }],
  comparison: { baseExpected: "fail", candidateExpected: "pass" },
  outcome: { metric: "silent-contract-degradation", direction: "decrease", verdict: "improved", threshold: 0 },
});

describe("evaluation scenario validation", () => {
  it("accepts a complete scenario", () => {
    expect(validateScenario(validScenario())).toEqual(validScenario());
  });

  it("rejects a missing hypothesis", () => {
    const scenario = validScenario();
    Reflect.deleteProperty(scenario, "hypothesis");
    expect(() => validateScenario(scenario)).toThrow(/hypothesis/i);
  });

  it("rejects an unknown change type", () => {
    expect(() => validateScenario({ ...validScenario(), changeType: "experiment" })).toThrow(/changeType/i);
  });

  it("rejects unknown top-level keys", () => {
    expect(() => validateScenario({ ...validScenario(), hypotesis: "misspelled" })).toThrow(/unknown.*hypotesis/i);
  });

  it("rejects shell command strings", () => {
    expect(() => validateScenario({ ...validScenario(), steps: [{ command: "akrctx status" }] })).toThrow(
      /command.*array/i,
    );
  });

  it("rejects paths that escape the fixture", () => {
    const assertions = [{ type: "fileExists", path: "../../outside" }];
    expect(() => validateScenario({ ...validScenario(), assertions })).toThrow(/path.*fixture/i);
  });

  it("rejects an improved feature outcome without a threshold", () => {
    const outcome = { metric: "task-success", direction: "increase", verdict: "improved" };
    expect(() => validateScenario({ ...validScenario(), changeType: "feature", outcome })).toThrow(/threshold/i);
  });
});

describe("evaluation fixtures", () => {
  it("materializes files in an isolated directory and cleans them up", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "akrctx-eval-test-"));
    const fixture = await materializeFixture(
      { files: { "package.json": '{"name":"fixture"}\n', "src/index.ts": "export {};\n" }, git: false },
      { tempRoot },
    );
    expect(await readFile(path.join(fixture.root, "src/index.ts"), "utf8")).toBe("export {};\n");
    await fixture.cleanup();
    await expect(stat(fixture.root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a fixture path that escapes its root", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "akrctx-eval-test-"));
    await expect(materializeFixture({ files: { "../../outside": "no" } }, { tempRoot })).rejects.toThrow(
      /fixture root/i,
    );
  });

  it("can retain a workdir for debugging", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "akrctx-eval-test-"));
    const fixture = await materializeFixture({ files: { "README.md": "kept\n" } }, { tempRoot, keepWorkdir: true });
    await fixture.cleanup();
    expect(await readFile(path.join(fixture.root, "README.md"), "utf8")).toBe("kept\n");
  });
});

describe("evaluation process execution", () => {
  it("executes without a shell and captures a failed result", async () => {
    const result = await executeStep(
      { command: [process.execPath, "-e", "console.log('seen'); console.error('bad'); process.exit(3)"] },
      { fixtureRoot: process.cwd() },
    );
    expect(result).toMatchObject({ exitCode: 3, stdout: "seen\n", stderr: "bad\n" });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("expands the akrctx placeholder to node plus the built CLI", async () => {
    const result = await executeStep(
      { command: ["$AKRCTX", "--version"] },
      { fixtureRoot: process.cwd(), cliEntry: path.join(process.cwd(), "dist/index.js") },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/0\.4\.0/);
  });

  it("handles repeated early exits while writing large stdin", async () => {
    const stdin = "x".repeat(4 * 1024 * 1024);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        executeStep({ command: [process.execPath, "-e", "process.exit(0)"], stdin }, { fixtureRoot: process.cwd() }),
      ),
    );
    expect(results.every((result) => result.exitCode === 0)).toBe(true);
  });

  it("stops a step at an explicit short timeout", async () => {
    const result = await executeStep(
      { command: [process.execPath, "-e", "setInterval(() => {}, 1_000)"], timeoutMs: 20 },
      { fixtureRoot: process.cwd() },
    );
    expect(result).toMatchObject({ exitCode: 124, timedOut: true });
  });

  it("kills descendants that inherit stdio when a step times out", async () => {
    const descendant = "setTimeout(() => {}, 2_000)";
    const parent = [
      "const { spawn } = require('node:child_process')",
      `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'inherit' })`,
      "setInterval(() => {}, 1_000)",
    ].join(";");

    const result = await executeStep(
      { command: [process.execPath, "-e", parent], timeoutMs: 50 },
      { fixtureRoot: process.cwd() },
    );

    expect(result).toMatchObject({ exitCode: 124, timedOut: true });
    expect(result.durationMs).toBeLessThan(1_000);
  });

  it("applies a 30 second timeout when called directly without one", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    try {
      const result = await executeStep(
        { command: [process.execPath, "-e", "process.exit(0)"] },
        { fixtureRoot: process.cwd() },
      );
      expect(result.exitCode).toBe(0);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});

describe("evaluation assertions", () => {
  it("checks process output and exit code", async () => {
    const results = [
      { exitCode: 0, stdout: "ready\n", stderr: "", durationMs: 4 },
      { exitCode: 0, stdout: '{"totals":{"sessions":2}}\n', stderr: "", durationMs: 4 },
    ];
    const assertions = [
      { type: "exitCode", step: 0, equals: 0 },
      { type: "stdoutContains", step: 0, value: "ready" },
      { type: "stderrExcludes", step: 0, value: "secret" },
      { type: "durationUnder", step: 0, milliseconds: 10 },
      { type: "stdoutJsonPathEquals", step: 1, jsonPath: "totals.sessions", equals: 2 },
    ];
    expect(
      (await evaluateAssertions(assertions, { stepResults: results, fixtureRoot: process.cwd() })).every(
        (x) => x.passed,
      ),
    ).toBe(true);
  });

  it("checks files and JSON dot paths", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "akrctx-assert-test-"));
    await materializeFixture(
      { files: { "result.json": '{"totals":{"sessions":2}}\n' } },
      { tempRoot, keepWorkdir: true },
    );
    const [fixtureDir] = await (await import("node:fs/promises")).readdir(tempRoot);
    const assertions = [
      { type: "fileExists", path: "result.json" },
      { type: "jsonPathEquals", path: "result.json", jsonPath: "totals.sessions", equals: 2 },
    ];
    expect(
      (await evaluateAssertions(assertions, { stepResults: [], fixtureRoot: path.join(tempRoot, fixtureDir) })).every(
        (x) => x.passed,
      ),
    ).toBe(true);
  });

  it("returns a failed result instead of throwing on a mismatch", async () => {
    const [result] = await evaluateAssertions([{ type: "exitCode", step: 0, equals: 0 }], {
      stepResults: [{ exitCode: 1, stdout: "", stderr: "", durationMs: 1 }],
      fixtureRoot: process.cwd(),
    });
    expect(result).toMatchObject({ passed: false, expected: 0, actual: 1 });
  });
});

describe("candidate evaluation runner", () => {
  it("runs all steps and returns mechanism and outcome verdicts", async () => {
    const scenario = {
      ...validScenario(),
      fixture: "inline",
      steps: [{ command: [process.execPath, "-e", "require('fs').writeFileSync('value.json', '{\"ok\":true}')"] }],
      assertions: [
        { type: "exitCode", step: 0, equals: 0 },
        { type: "jsonPathEquals", path: "value.json", jsonPath: "ok", equals: true },
      ],
      outcome: { metric: "fixture-result", direction: "increase", verdict: "improved", threshold: 1 },
    };
    const result = await runScenario(scenario, {
      repoRoot: process.cwd(),
      cliEntry: path.join(process.cwd(), "dist/index.js"),
      fixtureRecipe: { files: {}, git: false },
    });
    expect(result.mechanism).toBe("pass");
    expect(result.outcome).toBe("inconclusive");
    expect(result.assertions).toHaveLength(2);
    expect(result.workdir).toBeUndefined();
  });
});

describe("evaluation reports", () => {
  it("writes JSON and Markdown with separate mechanism and outcome summaries", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "akrctx-report-test-"));
    const report = await writeReport(
      {
        mode: "run",
        repository: { candidate: "abc123", dirty: false },
        results: [
          {
            id: "one",
            title: "One",
            hypothesis: "It works",
            mechanism: "pass",
            outcome: "inconclusive",
            assertions: [],
            steps: [],
          },
        ],
      },
      { outputRoot, runId: "test-run", repoRoot: "/Users/alex/akrcontext" },
    );
    const markdown = await readFile(report.markdownPath, "utf8");
    const json = JSON.parse(await readFile(report.jsonPath, "utf8"));
    expect(markdown).toContain("Mechanism: PASS");
    expect(markdown).toContain("Outcome: INCONCLUSIVE");
    expect(markdown).not.toContain("/Users/alex");
    expect(json.schemaVersion).toBe(1);
    expect(json.summary).toMatchObject({ passed: 1, failed: 0, inconclusive: 1 });
  });

  it("renders a not-applicable-only aggregate and count", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "akrctx-report-test-"));
    const report = await writeReport(
      {
        mode: "compare",
        results: [
          {
            id: "docs-only",
            title: "Documentation check",
            hypothesis: "The docs are checked",
            mechanism: "pass",
            outcome: "not-applicable",
          },
        ],
      },
      { outputRoot, runId: "not-applicable", repoRoot: process.cwd() },
    );
    const markdown = await readFile(report.markdownPath, "utf8");
    expect(markdown).toContain("Outcome: NOT_APPLICABLE");
    expect(markdown).toContain("0 inconclusive, 1 not applicable");
    expect(report.report.summary.notApplicable).toBe(1);
  });
});

describe("scenario discovery", () => {
  it("loads and filters validated JSON scenarios", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-scenarios-test-"));
    const fs = await import("node:fs/promises");
    await fs.writeFile(path.join(root, "one.json"), JSON.stringify({ ...validScenario(), suite: "smoke" }));
    await fs.writeFile(
      path.join(root, "two.json"),
      JSON.stringify({ ...validScenario(), id: "other-scenario", suite: "extended" }),
    );
    const scenarios = await loadScenarioFiles(root, { suite: "smoke" });
    expect(scenarios.map((item) => item.id)).toEqual(["invalid-config-fails-loudly"]);
  });
});

describe("base and candidate comparison", () => {
  it("validates a fix only when base fails and candidate passes", () => {
    expect(classifyComparison({ changeType: "fix", outcome: { verdict: "improved" } }, "fail", "pass")).toEqual({
      verdict: "validated",
      mechanism: "pass",
      outcome: "improved",
    });
    expect(classifyComparison({ changeType: "fix", outcome: {} }, "pass", "pass").verdict).toBe("inconclusive");
    expect(classifyComparison({ changeType: "fix", outcome: {} }, "pass", "fail").verdict).toBe("regression");
  });

  it("keeps a new observability mechanism outcome inconclusive", () => {
    expect(
      classifyComparison({ changeType: "observability", outcome: { verdict: "inconclusive" } }, "fail", "pass"),
    ).toEqual({
      verdict: "mechanism-added",
      mechanism: "pass",
      outcome: "inconclusive",
    });
  });

  it("resolves immutable Git SHAs", async () => {
    expect(await resolveRef(process.cwd(), "HEAD")).toMatch(/^[0-9a-f]{40}$/);
  });

  it("reclaims a stale lock owned by a dead process", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-lock-test-"));
    const lockDirectory = path.join(root, "build.lock");
    await mkdir(lockDirectory);
    await writeFile(
      path.join(lockDirectory, "owner.json"),
      JSON.stringify({ pid: 2_147_483_647, token: "dead-owner", startedAt: "2000-01-01T00:00:00.000Z" }),
    );

    const token = await acquireBuildLock(lockDirectory, path.join(root, "cache"), "sha");

    expect(token).toEqual(expect.any(String));
    expect(token).not.toBe("dead-owner");
    await releaseBuildLock(lockDirectory, token);
    await expect(stat(lockDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reclaims a stale ownerless lock directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-lock-test-"));
    const lockDirectory = path.join(root, "build.lock");
    await mkdir(lockDirectory);
    const staleTime = new Date(Date.now() - 11 * 60_000);
    await utimes(lockDirectory, staleTime, staleTime);

    const token = await acquireBuildLock(lockDirectory, path.join(root, "cache"), "sha");

    expect(token).toEqual(expect.any(String));
    await releaseBuildLock(lockDirectory, token);
    await expect(stat(lockDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  }, 1_000);

  it("atomically gives one concurrent reclaimer ownership without replacing the lock directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-lock-test-"));
    const lockDirectory = path.join(root, "build.lock");
    await mkdir(lockDirectory);
    const staleTime = new Date(Date.now() - 11 * 60_000);
    await utimes(lockDirectory, staleTime, staleTime);
    const originalIdentity = (await stat(lockDirectory)).ino;

    const tokens = ["reclaimer-one", "reclaimer-two"];
    const results = await Promise.all(tokens.map((token) => claimStaleOwnerlessBuildLock(lockDirectory, token)));

    expect(results.filter(Boolean)).toHaveLength(1);
    const owner = JSON.parse(await readFile(path.join(lockDirectory, "owner.json"), "utf8"));
    expect(owner.token).toBe(tokens[results.indexOf(true)]);
    expect((await stat(lockDirectory)).ino).toBe(originalIdentity);
    await releaseBuildLock(lockDirectory, owner.token);
  });

  it("does not steal a fresh ownerless lock directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-lock-test-"));
    const lockDirectory = path.join(root, "build.lock");
    await mkdir(lockDirectory);

    const acquisition = acquireBuildLock(lockDirectory, path.join(root, "cache"), "sha");
    await new Promise((resolve) => setTimeout(resolve, 150));

    await expect(stat(lockDirectory)).resolves.toBeDefined();
    await expect(stat(path.join(lockDirectory, "owner.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await rm(lockDirectory, { recursive: true });
    const token = await acquisition;
    await releaseBuildLock(lockDirectory, token);
  });

  it("fails promptly with an actionable error for malformed owner metadata", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-lock-test-"));
    const lockDirectory = path.join(root, "build.lock");
    await mkdir(lockDirectory);
    await writeFile(path.join(lockDirectory, "owner.json"), "{not-json");

    await expect(acquireBuildLock(lockDirectory, path.join(root, "cache"), "sha")).rejects.toThrow(
      /malformed.*owner\.json.*remove.*manually/i,
    );
  }, 500);

  it("does not let an old owner release a replacement lock", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-lock-test-"));
    const lockDirectory = path.join(root, "build.lock");
    await mkdir(lockDirectory);
    await writeFile(
      path.join(lockDirectory, "owner.json"),
      JSON.stringify({ pid: process.pid, token: "replacement-owner", startedAt: new Date().toISOString() }),
    );

    await releaseBuildLock(lockDirectory, "old-owner");

    expect(JSON.parse(await readFile(path.join(lockDirectory, "owner.json"), "utf8"))).toMatchObject({
      token: "replacement-owner",
    });
  });
});

describe("evaluation Git provenance", () => {
  it("treats untracked files as dirty worktree inputs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-git-test-"));
    const runGit = async (...args: string[]) => executeStep({ command: ["git", ...args] }, { fixtureRoot: root });
    expect((await runGit("init")).exitCode).toBe(0);
    expect(await isWorktreeDirty(root)).toBe(false);
    await writeFile(path.join(root, "untracked-evaluator.mjs"), "export {};\n");
    expect(await isWorktreeDirty(root)).toBe(true);
  });
});

describe("evaluation CLI", () => {
  it("lists scenarios without executing them", async () => {
    const result = await executeStep(
      { command: [process.execPath, path.join(process.cwd(), "evals/cli.mjs"), "--list"] },
      { fixtureRoot: process.cwd() },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("trace-observe-only");
    expect(result.stdout).toContain("invalid-config-fails-loudly");
  });
});

describe("scenario assertion contract", () => {
  it("rejects unknown assertion types", () => {
    const scenario = validScenario();
    scenario.assertions = [{ type: "trustTheAgent" }];
    expect(() => validateScenario(scenario)).toThrow(/assertion type/i);
  });

  it("rejects assertion fields required by their type", () => {
    const scenario = validScenario();
    scenario.assertions = [{ type: "fileExists" }];
    expect(() => validateScenario(scenario)).toThrow(/assertions\[0\]\.path/i);
  });
});

describe("comparison expectation contract", () => {
  it("invalidates a comparison whose observed base does not match the scenario", () => {
    const scenario = {
      changeType: "fix",
      comparison: { baseExpected: "fail", candidateExpected: "pass" },
      outcome: { verdict: "improved" },
    };
    expect(classifyComparison(scenario, "pass", "pass")).toEqual({
      verdict: "invalidated",
      mechanism: "fail",
      outcome: "inconclusive",
    });
  });
});

describe("evaluation environment isolation", () => {
  it("does not expose ambient secrets and isolates HOME", async () => {
    process.env.AKRCTX_EVAL_SECRET_TEST = "must-not-leak";
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-env-test-"));
    try {
      const result = await executeStep(
        {
          command: [
            process.execPath,
            "-e",
            "console.log(JSON.stringify({secret:process.env.AKRCTX_EVAL_SECRET_TEST,home:process.env.HOME}))",
          ],
        },
        { fixtureRoot: root },
      );
      expect(JSON.parse(result.stdout)).toEqual({ home: root });
    } finally {
      Reflect.deleteProperty(process.env, "AKRCTX_EVAL_SECRET_TEST");
    }
  });

  it("keys build caches by commit and Node version", () => {
    expect(buildCacheKey("a".repeat(40), "22.1.0")).toBe(`${"a".repeat(40)}-node22.1.0`);
  });
});

describe("outcome evidence boundary", () => {
  it("does not let a feature scenario declare improvement without an outcome grader", () => {
    const scenario = validScenario();
    scenario.changeType = "feature";
    scenario.outcome = { metric: "user-value", direction: "increase", verdict: "improved", threshold: 1 };
    expect(() => validateScenario(scenario)).toThrow(/outcome grader/i);
  });

  it.each(["observability", "refactor"])(
    "does not let a %s scenario declare improvement without an outcome grader",
    (changeType) => {
      const scenario = validScenario();
      scenario.changeType = changeType;
      scenario.outcome = { metric: "user-value", direction: "increase", verdict: "improved", threshold: 1 };
      expect(() => validateScenario(scenario)).toThrow(/outcome grader/i);
    },
  );

  it.each([undefined, "improved", "preserved", "inconclusive", "worsened"])(
    "requires documentation outcome verdicts to be not-applicable instead of %s",
    (verdict) => {
      const scenario = validScenario();
      scenario.changeType = "docs";
      scenario.outcome = { metric: "documentation-check", direction: "preserve" };
      if (verdict !== undefined) scenario.outcome.verdict = verdict;
      expect(() => validateScenario(scenario)).toThrow(/documentation.*not-applicable/i);
    },
  );

  it("accepts a not-applicable documentation outcome", () => {
    const scenario = validScenario();
    scenario.changeType = "docs";
    scenario.outcome = { metric: "documentation-check", direction: "preserve", verdict: "not-applicable" };
    expect(validateScenario(scenario)).toBe(scenario);
  });

  it("keeps the JSON schema aligned with the runtime evidence boundary", async () => {
    const schema = JSON.parse(await readFile(path.join(process.cwd(), "evals/schema/scenario.schema.json"), "utf8"));
    const docsRule = schema.allOf.find((rule) => rule.if?.properties?.changeType?.const === "docs");
    const graderRule = schema.allOf.find(
      (rule) => rule.if?.properties?.outcome?.properties?.verdict?.const === "improved",
    );
    expect(docsRule.then.properties.outcome).toMatchObject({
      required: ["verdict"],
      properties: { verdict: { const: "not-applicable" } },
    });
    expect(graderRule.if.properties.changeType.enum).toEqual(["feature", "observability", "refactor"]);
    expect(graderRule.then).toBe(false);
  });
});

describe("comparison outcome matrix", () => {
  const changeTypes = ["fix", "feature", "observability", "refactor", "docs"];
  const mechanisms = [
    ["pass", "pass"],
    ["pass", "fail"],
    ["fail", "pass"],
    ["fail", "fail"],
  ];
  const declaredVerdicts = [undefined, "improved", "preserved", "inconclusive", "not-applicable", "worsened"];

  it.each(
    changeTypes.flatMap((changeType) =>
      mechanisms.flatMap(([base, candidate]) =>
        declaredVerdicts.map((declared) => ({ changeType, base, candidate, declared })),
      ),
    ),
  )("classifies $changeType $base->$candidate with declared=$declared", ({ changeType, base, candidate, declared }) => {
    const scenario = { changeType, outcome: declared === undefined ? {} : { verdict: declared } };
    const result = classifyComparison(scenario, base, candidate);

    if (base === "pass" && candidate === "fail") {
      expect(result).toEqual({ mechanism: "fail", verdict: "regression", outcome: "worsened" });
    } else if (candidate === "fail") {
      expect(result).toEqual({ mechanism: "fail", verdict: "invalidated", outcome: "inconclusive" });
    } else if (changeType === "fix" && base === "fail") {
      expect(result).toEqual({ mechanism: "pass", verdict: "validated", outcome: "improved" });
    } else if (changeType === "fix") {
      expect(result).toEqual({ mechanism: "pass", verdict: "inconclusive", outcome: "inconclusive" });
    } else if (base === "fail") {
      expect(result).toEqual({ mechanism: "pass", verdict: "mechanism-added", outcome: "inconclusive" });
    } else {
      const outcome = declared === "inconclusive" || declared === "not-applicable" ? declared : "preserved";
      expect(result).toEqual({ mechanism: "pass", verdict: "preserved", outcome });
    }
  });
});

describe("scenario provenance", () => {
  it("produces a stable semantic digest", () => {
    expect(scenarioDigest([{ id: "one", value: { b: 2, a: 1 } }])).toBe(
      scenarioDigest([{ value: { a: 1, b: 2 }, id: "one" }]),
    );
    expect(scenarioDigest([{ id: "two" }])).not.toBe(scenarioDigest([{ id: "one" }]));
  });
});

describe("regression precedence", () => {
  it("classifies base-pass candidate-fail as a regression even when candidate was expected to pass", () => {
    const scenario = {
      changeType: "refactor",
      comparison: { baseExpected: "pass", candidateExpected: "pass" },
      outcome: { verdict: "preserved" },
    };
    expect(classifyComparison(scenario, "pass", "fail")).toEqual({
      verdict: "regression",
      mechanism: "fail",
      outcome: "worsened",
    });
  });
});

describe("nested scenario strictness", () => {
  it.each([
    [
      "step",
      (scenario) => {
        scenario.steps[0].shell = true;
      },
    ],
    [
      "assertion",
      (scenario) => {
        scenario.assertions[0].message = "ignored";
      },
    ],
    [
      "comparison",
      (scenario) => {
        scenario.comparison.note = "ignored";
      },
    ],
    [
      "outcome",
      (scenario) => {
        scenario.outcome.score = 1;
      },
    ],
  ])("rejects unknown %s keys", (_label, mutate) => {
    const scenario = validScenario();
    mutate(scenario);
    expect(() => validateScenario(scenario)).toThrow(/unknown/i);
  });
});

describe("overall outcome honesty", () => {
  it("reports partial evidence when improvements and inconclusive claims coexist", () => {
    expect(overallOutcome({ improved: 2, preserved: 1, worsened: 0, inconclusive: 2 })).toBe("PARTIAL");
  });

  it.each([
    [{ improved: 0, preserved: 0, worsened: 0, inconclusive: 0, notApplicable: 2 }, "NOT_APPLICABLE"],
    [{ improved: 1, preserved: 0, worsened: 0, inconclusive: 0, notApplicable: 2 }, "IMPROVED"],
    [{ improved: 1, preserved: 0, worsened: 0, inconclusive: 1, notApplicable: 2 }, "PARTIAL"],
  ])("aggregates not-applicable outcomes honestly", (summary, expected) => {
    expect(overallOutcome(summary)).toBe(expected);
  });

  it("counts not-applicable outcomes separately", () => {
    expect(
      summarizeResults([
        { mechanism: "pass", outcome: "not-applicable" },
        { mechanism: "pass", outcome: "preserved" },
      ]),
    ).toMatchObject({ scenarios: 2, passed: 2, notApplicable: 1, preserved: 1, inconclusive: 0 });
  });
});

describe("real fixture containment", () => {
  it("rejects an assertion path that escapes through a symlink", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-symlink-root-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "akrctx-symlink-outside-"));
    await writeFile(path.join(outside, "secret.json"), '{"secret":true}\n');
    await symlink(outside, path.join(root, "link"));
    await expect(
      evaluateAssertions([{ type: "jsonPathEquals", path: "link/secret.json", jsonPath: "secret", equals: true }], {
        fixtureRoot: root,
        stepResults: [],
      }),
    ).rejects.toThrow(/outside.*fixture|fixture.*root/i);
  });

  it("rejects a step cwd that escapes through a symlink", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-symlink-root-"));
    const outside = await mkdtemp(path.join(os.tmpdir(), "akrctx-symlink-outside-"));
    await symlink(outside, path.join(root, "link"));
    await expect(
      executeStep({ command: [process.execPath, "-e", "process.exit(0)"], cwd: "link" }, { fixtureRoot: root }),
    ).rejects.toThrow(/outside.*fixture|fixture.*root/i);
  });
});

describe("report payload redaction", () => {
  it("does not retain command arguments or captured stream contents", async () => {
    const secret = "TOP_SECRET_OUTPUT_8b6f";
    const scenario = {
      ...validScenario(),
      fixture: "inline",
      steps: [{ command: [process.execPath, "-e", `console.log("${secret}"); console.error("${secret}")`] }],
      assertions: [{ type: "stdoutContains", step: 0, value: secret }],
      outcome: { metric: "secret-redaction", direction: "preserve", verdict: "inconclusive" },
    };
    const result = await runScenario(scenario, {
      repoRoot: process.cwd(),
      cliEntry: path.join(process.cwd(), "dist/index.js"),
      fixtureRecipe: { files: {}, git: false },
    });
    expect(result.mechanism).toBe("pass");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.steps[0]).toMatchObject({ executable: "node", argumentCount: 2, exitCode: 0 });
    expect(result.steps[0].stdout).toMatchObject({
      bytes: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});

describe("build cache integrity", () => {
  it("invalidates a ready marker when the built CLI changes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "akrctx-cache-integrity-"));
    const cli = path.join(directory, "source", "dist", "index.js");
    await (await import("node:fs/promises")).mkdir(path.dirname(cli), { recursive: true });
    await writeFile(cli, "first\n");
    const sha = "a".repeat(40);
    const distSha256 = createHash("sha256")
      .update("index.js")
      .update("\0")
      .update("first\n")
      .update("\0")
      .digest("hex");
    await writeFile(
      path.join(directory, "ready.json"),
      JSON.stringify({ sha, node: process.versions.node, distSha256 }),
    );
    expect(await isBuildCacheValid(directory, sha)).toBe(true);
    await writeFile(cli, "tampered\n");
    expect(await isBuildCacheValid(directory, sha)).toBe(false);
  });
});

describe("process output budgets", () => {
  it("stops a step that exceeds the capture limit", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akrctx-output-budget-"));
    const result = await executeStep(
      { command: [process.execPath, "-e", 'process.stdout.write("x".repeat(2 * 1024 * 1024))'], timeoutMs: 10_000 },
      { fixtureRoot: root },
    );
    expect(result.outputLimitExceeded).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024 * 1024);
  });
});

describe("evaluation CLI option values", () => {
  it.each(["--suite", "--scenario", "--base", "--candidate"])("rejects a missing value for %s", async (option) => {
    const result = await executeStep(
      { command: [process.execPath, path.join(process.cwd(), "evals/cli.mjs"), "--list", option] },
      { fixtureRoot: process.cwd() },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(`${option} requires a value`);
  });
});
