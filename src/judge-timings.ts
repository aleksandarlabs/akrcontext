import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

type JudgePhase =
  | "snapshot"
  | "verification"
  | "approval-wait"
  | "workspace-copy"
  | "dependency-preparation"
  | "dependency-copy"
  | "snapshot-build"
  | "validation-command"
  | "cleanup";
interface PhaseTiming {
  phase: JudgePhase;
  elapsedMs: number;
  status: "passed" | "failed";
  commandIndex?: number;
}
const timings = new AsyncLocalStorage<PhaseTiming[]>();

/** Durations are monotonic and inclusive: nested phases must not be summed. */
export async function measureJudgePhase<T>(
  phase: JudgePhase,
  operation: () => Promise<T>,
  commandIndex?: number,
  succeeded: (result: T) => boolean = () => true,
): Promise<T> {
  const phases = timings.getStore();
  if (!phases) return operation();
  const entry: PhaseTiming = { phase, elapsedMs: 0, status: "failed" };
  if (commandIndex !== undefined) entry.commandIndex = commandIndex;
  phases.push(entry);
  const start = performance.now();
  try {
    const result = await operation();
    entry.status = succeeded(result) ? "passed" : "failed";
    return result;
  } finally {
    entry.elapsedMs = Math.max(0, performance.now() - start);
  }
}

/** Emits only fixed labels and numeric durations/indices, including on thrown failures. */
export async function withJudgeTimings<T>(
  enabled: boolean,
  operation: "snapshot" | "verify",
  run: () => Promise<T>,
  emit: (line: string) => void = (line) => console.error(line),
  succeeded: (result: T) => boolean = () => true,
): Promise<T> {
  if (!enabled) return run();
  const phases: PhaseTiming[] = [];
  return timings.run(phases, async () => {
    try {
      return await measureJudgePhase(operation === "verify" ? "verification" : "snapshot", run, undefined, succeeded);
    } finally {
      try {
        emit(JSON.stringify({ type: "judge-timings", operation, inclusive: true, phases }));
      } catch {
        // Optional diagnostics must never change the operation result or mask its error.
      }
    }
  });
}
