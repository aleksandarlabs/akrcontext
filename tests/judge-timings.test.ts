import { describe, expect, it } from "vitest";
import { measureJudgePhase, withJudgeTimings } from "../src/judge-timings.js";

describe("judge timing diagnostics", () => {
  it("is silent when disabled and preserves results", async () => {
    const output: string[] = [];
    expect(
      await withJudgeTimings(
        false,
        "snapshot",
        async () => 42,
        (line) => output.push(line),
      ),
    ).toBe(42);
    expect(output).toEqual([]);
  });

  it("reports nested inclusive phases and semantic failure without sensitive data", async () => {
    const output: string[] = [];
    await withJudgeTimings(
      true,
      "verify",
      async () => {
        await measureJudgePhase("approval-wait", async () => false, undefined, Boolean);
        await expect(
          measureJudgePhase(
            "validation-command",
            async () => {
              throw new Error("SECRET command /private/path");
            },
            1,
          ),
        ).rejects.toThrow("SECRET");
        return { approved: false };
      },
      (line) => output.push(line),
      (result) => result.approved,
    );
    const diagnostic = JSON.parse(output[0]);
    expect(output).toHaveLength(1);
    expect(diagnostic).toMatchObject({ type: "judge-timings", operation: "verify", inclusive: true });
    expect(diagnostic.phases.map((phase: { phase: string; status: string }) => [phase.phase, phase.status])).toEqual([
      ["verification", "failed"],
      ["approval-wait", "failed"],
      ["validation-command", "failed"],
    ]);
    expect(diagnostic.phases[2].commandIndex).toBe(1);
    expect(diagnostic.phases.every((phase: { elapsedMs: number }) => phase.elapsedMs >= 0)).toBe(true);
    expect(output[0]).not.toMatch(/SECRET|private|command \/|approved/);
  });

  it("emits exactly once when an operation throws and preserves the error", async () => {
    const output: string[] = [];
    const error = new Error("sensitive");
    await expect(
      withJudgeTimings(
        true,
        "snapshot",
        async () => {
          throw error;
        },
        (line) => output.push(line),
      ),
    ).rejects.toBe(error);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]).phases[0].status).toBe("failed");
    expect(output[0]).not.toContain("sensitive");
  });
});

it("does not let diagnostic output failure alter results or mask errors", async () => {
  const emit = () => {
    throw new Error("output closed");
  };
  expect(await withJudgeTimings(true, "snapshot", async () => 42, emit)).toBe(42);
  const error = new Error("original");
  await expect(
    withJudgeTimings(
      true,
      "verify",
      async () => {
        throw error;
      },
      emit,
    ),
  ).rejects.toBe(error);
});
