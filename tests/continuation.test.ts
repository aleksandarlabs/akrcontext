import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTINUATION_MAX_BYTES,
  CONTINUATION_SCHEMA_VERSION,
  type ContinuationExecution,
  type ContinuationRecord,
  type ExecutionState,
  readTaskContinuation,
  validateContinuation,
} from "../src/continuation.js";

let tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  tempRoots = [];
});

function record(taskId = "TASK-001"): ContinuationRecord {
  return {
    schemaVersion: CONTINUATION_SCHEMA_VERSION,
    task: {
      taskId,
      capsulePath: `.akrctx/tasks/${taskId}-fixture`,
      capsuleDigest: `sha256:${"a".repeat(64)}`,
      capsuleRevision: { gitCommit: null },
    },
    latestExecution: null,
    history: [],
  };
}

function execution(runId = "run_abc", state: ExecutionState = "completed"): ContinuationExecution {
  return {
    runId,
    state,
    workspace: { gitRemote: "unknown", commit: null, content: { kind: "unavailable" } },
    owner: { kind: "manual-session", id: "unknown" },
    model: { requested: "unknown", observed: "unknown" },
    progress: [],
    blockers: [],
    decisionsPending: [],
    attempts: {
      budgetAccountId: "budget_abc",
      consumed: "unknown",
      limit: 3,
      provenance: "unknown",
      localReconciliation: "not-available",
    },
    validationSummary: {
      contractDigest: `sha256:${"b".repeat(64)}`,
      codeReviewContentDigest: null,
      required: [],
      status: "unknown",
    },
    resumption: { requiresReauthorization: true, reason: "portable state carries no grant" },
  };
}

async function fixture(taskId = "TASK-001") {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "akrctx-continuation-test-"));
  tempRoots.push(tmp);
  await mkdir(path.join(tmp, ".akrctx/tasks", `${taskId}-fixture`), { recursive: true });
  await writeFile(
    path.join(tmp, ".akrctx/policy.json"),
    JSON.stringify({
      blockedReadPatterns: [
        ".env",
        ".env.*",
        "*.pem",
        "*.key",
        "*.p12",
        "*.pfx",
        "secrets/",
        "credentials/",
        "private/",
      ],
    }),
  );
  return tmp;
}

describe("portable continuation reader", () => {
  it("accepts the minimal v1 record and reports a missing sidecar as unknown", async () => {
    expect(validateContinuation(record())).toEqual([]);
    const cwd = await fixture();
    await expect(readTaskContinuation(cwd, "TASK-001")).resolves.toMatchObject({
      taskId: "TASK-001",
      path: ".akrctx/tasks/TASK-001-fixture/continuation.json",
      status: "missing",
      executionState: "unknown",
      permission: "not-evaluated",
      verification: "not-evaluated",
      continuationDigest: null,
      record: null,
    });
  });

  it("rejects unknown keys and never accepts an oversized sidecar", async () => {
    expect(validateContinuation({ ...record(), extra: true })).not.toEqual([]);
    const cwd = await fixture();
    await writeFile(
      path.join(cwd, ".akrctx/tasks/TASK-001-fixture/continuation.json"),
      `{${"x".repeat(CONTINUATION_MAX_BYTES)}}`,
    );
    await expect(readTaskContinuation(cwd, "TASK-001")).resolves.toMatchObject({ status: "invalid", record: null });
  });

  it("keeps declared attempts and hashes the original sidecar bytes", async () => {
    const cwd = await fixture();
    const value = record();
    const latest = execution();
    latest.attempts.consumed = 4;
    latest.attempts.provenance = "portable-summary";
    value.latestExecution = latest;
    const bytes = Buffer.from(`${JSON.stringify(value)}\r\n`, "utf8");
    await writeFile(path.join(cwd, ".akrctx/tasks/TASK-001-fixture/continuation.json"), bytes);
    const result = await readTaskContinuation(cwd, "TASK-001");
    expect(result.status).toBe("valid");
    expect(result.executionState).toBe("completed");
    expect(result.record?.latestExecution?.attempts.consumed).toBe(4);
    expect(result.continuationDigest).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  });

  it("rejects a valid record whose identity names another task", async () => {
    const cwd = await fixture();
    await writeFile(
      path.join(cwd, ".akrctx/tasks/TASK-001-fixture/continuation.json"),
      JSON.stringify(record("TASK-002")),
    );
    await expect(readTaskContinuation(cwd, "TASK-001")).resolves.toMatchObject({ status: "invalid", record: null });
  });

  it("rejects a same-ID sidecar that names a different slug", async () => {
    const cwd = await fixture();
    const value = record();
    value.task.capsulePath = ".akrctx/tasks/TASK-001-other";
    await writeFile(path.join(cwd, ".akrctx/tasks/TASK-001-fixture/continuation.json"), JSON.stringify(value));
    await expect(readTaskContinuation(cwd, "TASK-001")).resolves.toMatchObject({ status: "invalid", record: null });
  });

  it("does not treat TASK-0010 as a TASK-001 capsule path", () => {
    const value = record();
    value.task.capsulePath = ".akrctx/tasks/TASK-0010-fixture";
    expect(validateContinuation(value).some((reason) => reason.includes("does not match"))).toBe(true);
  });

  it("requires terminal, unique history entries and preserves unknown consumption", () => {
    const value = record();
    const latest = execution("run_latest", "active");
    const old = execution("run_old");
    const nonterminal = execution("run_nonterminal", "active");
    value.latestExecution = latest;
    value.history = [nonterminal, old, { ...old }, execution("run_latest")];
    const reasons = validateContinuation(value);
    expect(reasons.some((reason) => reason.includes("terminal"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("unique"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("differ"))).toBe(true);
    latest.state = "completed";
    latest.attempts.consumed = "unknown";
    value.history = [];
    expect(validateContinuation(value)).toEqual([]);
  });

  it("enforces limits and rejects type coercion", () => {
    const value = record();
    value.history = Array.from({ length: 21 }, () => execution("run_x"));
    expect(validateContinuation(value).some((reason) => reason.includes("maximum of 20"))).toBe(true);
    value.history = [];
    const latest = execution();
    latest.progress = ["x".repeat(1025)];
    latest.attempts.provenance = ["unknown"] as unknown as ContinuationExecution["attempts"]["provenance"];
    value.latestExecution = latest;
    const reasons = validateContinuation(value);
    expect(reasons.some((reason) => reason.includes("1024"))).toBe(true);
    expect(reasons.some((reason) => reason.includes("provenance"))).toBe(true);
  });

  it("enforces complete and no-runtime validation summary rules", () => {
    const value = record();
    const latest = execution();
    latest.validationSummary = {
      contractDigest: `sha256:${"b".repeat(64)}`,
      codeReviewContentDigest: `sha256:${"c".repeat(64)}`,
      required: [{ command: "pnpm test", status: "passed" }],
      status: "complete",
    };
    value.latestExecution = latest;
    expect(validateContinuation(value)).toEqual([]);
    latest.validationSummary = {
      contractDigest: `sha256:${"b".repeat(64)}`,
      codeReviewContentDigest: null,
      required: [],
      status: "not-applicable-to-runtime",
      reason: "documentation-only task",
    };
    expect(validateContinuation(value)).toEqual([]);
    latest.validationSummary.reason = "unexpected";
    latest.validationSummary.status = "unknown";
    expect(validateContinuation(value).some((reason) => reason.includes("unsupported field"))).toBe(true);
  });

  it("distinguishes unsupported versions from malformed current versions", async () => {
    const cwd = await fixture();
    const sidecar = path.join(cwd, ".akrctx/tasks/TASK-001-fixture/continuation.json");
    await writeFile(sidecar, JSON.stringify({ schemaVersion: 2 }));
    await expect(readTaskContinuation(cwd, "TASK-001")).resolves.toMatchObject({ status: "unsupported", record: null });
    await writeFile(sidecar, JSON.stringify({ schemaVersion: "2" }));
    await expect(readTaskContinuation(cwd, "TASK-001")).resolves.toMatchObject({ status: "invalid", record: null });
  });

  it("fails closed for blocked files, symlinked roots, policy, and sidecars", async () => {
    const cwd = await fixture();
    const sidecar = path.join(cwd, ".akrctx/tasks/TASK-001-fixture/continuation.json");
    await writeFile(sidecar, "secret");
    await symlink("continuation.json", `${sidecar}.link`);
    await rm(sidecar);
    await rename(`${sidecar}.link`, sidecar);
    await expect(readTaskContinuation(cwd, "TASK-001")).rejects.toThrow(/symbolic link/);

    await rm(sidecar);
    await writeFile(
      path.join(cwd, ".akrctx/policy.json"),
      JSON.stringify({ blockedReadPatterns: ["continuation.json"] }),
    );
    await writeFile(sidecar, "secret");
    await expect(readTaskContinuation(cwd, "TASK-001")).rejects.toThrow(/blocked by policy/);

    await rm(path.join(cwd, ".akrctx/policy.json"));
    await writeFile(path.join(cwd, ".akrctx-real-policy.json"), JSON.stringify({ blockedReadPatterns: [] }));
    await symlink(".akrctx-real-policy.json", path.join(cwd, ".akrctx/policy.json"));
    await expect(readTaskContinuation(cwd, "TASK-001")).rejects.toThrow(/symbolic link/);

    const rootCwd = await fixture();
    await rename(path.join(rootCwd, ".akrctx"), path.join(rootCwd, ".akrctx-real"));
    await symlink(".akrctx-real", path.join(rootCwd, ".akrctx"));
    await expect(readTaskContinuation(rootCwd, "TASK-001")).rejects.toThrow(/symbolic link/);

    const tasksCwd = await fixture();
    await rename(path.join(tasksCwd, ".akrctx/tasks"), path.join(tasksCwd, ".akrctx/tasks-real"));
    await symlink("tasks-real", path.join(tasksCwd, ".akrctx/tasks"));
    await expect(readTaskContinuation(tasksCwd, "TASK-001")).rejects.toThrow(/symbolic link/);
  });

  it("rejects duplicate task roots before reading any sidecar", async () => {
    const cwd = await fixture();
    await mkdir(path.join(cwd, ".akrctx/tasks/TASK-001-other"));
    await expect(readTaskContinuation(cwd, "TASK-001")).rejects.toThrow(/Multiple task directories/);
  });
});
