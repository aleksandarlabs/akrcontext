import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerJudge } from "../src/cli/judge.js";
import { verifyJudgeRecord } from "../src/judge-enforcement.js";
import { captureJudgeSnapshot } from "../src/judge-snapshot.js";

vi.mock("../src/judge-enforcement.js", () => ({
  JUDGE_SCHEMA_VERSION: 1,
  createJudgeScope: vi.fn(),
  verifyJudgeRecord: vi.fn(),
}));
vi.mock("../src/judge-snapshot.js", () => ({
  captureJudgeSnapshot: vi.fn(),
  captureJudgeCatchUpSnapshot: vi.fn(),
  checkJudgeReviewCurrentState: vi.fn(),
  pruneJudgeSnapshots: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  process.exitCode = 0;
});

async function run(args: string[]) {
  const program = new Command();
  registerJudge(program);
  await program.parseAsync(["node", "akrctx", "judge", ...args]);
}

describe("judge CLI timing boundary", () => {
  it.each([false, true])("preserves snapshot stdout with timings=%s", async (enabled) => {
    const snapshot = { id: "abc", candidate: "SNAPSHOT:abc", emptyBoundaryAuthorized: true };
    vi.mocked(captureJudgeSnapshot).mockResolvedValue(snapshot as Awaited<ReturnType<typeof captureJudgeSnapshot>>);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(["snapshot", "TASK-001", "--json", ...(enabled ? ["--timings"] : [])]);
    expect(stdout).toHaveBeenCalledExactlyOnceWith(JSON.stringify(snapshot, null, 2));
    expect(stderr).toHaveBeenCalledTimes(enabled ? 1 : 0);
    if (enabled) expect(JSON.parse(String(stderr.mock.calls[0][0])).phases[0].status).toBe("passed");
  });

  it("reports invalid verification and preserves failure exit code and stdout", async () => {
    const result = { approved: false, reasons: ["private failure"] };
    vi.mocked(verifyJudgeRecord).mockResolvedValue(result as Awaited<ReturnType<typeof verifyJudgeRecord>>);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(["verify", "secret-review.json", "--json", "--timings"]);
    expect(stdout).toHaveBeenCalledExactlyOnceWith(JSON.stringify(result, null, 2));
    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledTimes(1);
    const line = String(stderr.mock.calls[0][0]);
    expect(JSON.parse(line).phases[0].status).toBe("failed");
    expect(line).not.toMatch(/private|secret/);
  });

  it("emits timing on thrown snapshot failure without swallowing the error", async () => {
    const error = new Error("private path");
    vi.mocked(captureJudgeSnapshot).mockRejectedValue(error);
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(run(["snapshot", "TASK-001", "--timings"])).rejects.toBe(error);
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stderr.mock.calls[0][0])).phases[0].status).toBe("failed");
  });
});
