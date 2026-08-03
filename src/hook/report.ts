import { readFile } from "node:fs/promises";
import path from "node:path";
import { capsuleFiles } from "../harness-files.js";
import { readValidationDeclaration } from "../judge-enforcement.js";
import { findTaskDirectory } from "../task.js";
import type { CommandOptions } from "../types.js";
import { digestCommand } from "./index.js";
import { type Area, type Trace, governedAreas, listTraceSessions, readTrace } from "./trace.js";

/**
 * What the contract required, and what actually happened.
 *
 * Predicates are derived here rather than recorded by the hook, so their definitions can
 * change without invalidating traces already on disk. That matters for `capsuleBound` vs
 * `capsuleBeforeFirstMutation`: phase 3 has to pick one, and it should pick on evidence.
 */
export interface SessionReport {
  sessionId: string;
  startedAt?: string;
  source?: string;
  baseCommit?: string;
  /** False when the trace was truncated. Its predicates are reported but not aggregated. */
  complete: boolean;
  observations: number;
  /** A capsule was read or written at some point during the session. */
  capsuleBound: boolean;
  /** A capsule was bound before the first mutating write outside .akrctx/. */
  capsuleBeforeFirstMutation: boolean;
  /**
   * The session mutated something outside `.akrctx/`. Sessions that did not are not
   * contract failures, and are excluded from every rate below.
   */
  mutatedProject: boolean;
  /**
   * A shell command ran, so this session may have changed the tree in a way no observation
   * records. Its rates are reported but excluded from the aggregate.
   */
  mutationUncertain: boolean;
  /** A shell command ran before any capsule was bound, so the ordering cannot be trusted. */
  uncertainBeforeBinding: boolean;
  capsuleId?: string;
  /** The bound capsule has all five files, checked now rather than during the session. */
  capsuleComplete?: boolean;
  /** task.md declares at least one command under `## Validation`. */
  validationDeclared?: boolean;
  /** A declared command was observed running, matched by digest. */
  validationObserved?: boolean;
  /** A path matching policy.blockedReadPatterns was touched. */
  blockedPathTouched: boolean;
}

export interface TraceReport {
  sessions: SessionReport[];
  totals: {
    sessions: number;
    incomplete: number;
    /**
     * Held out of the rates because the classification could not be settled — either the
     * ordering is unknown, or nothing confirmed a change while something unobservable could
     * have made one.
     */
    uncertain: number;
    /**
     * Observed to change nothing outside `.akrctx/`, with nothing that could have changed
     * something unobserved. Not a contract failure and not a doubt — a read-only session.
     * Reported so the three buckets account for every usable trace.
     */
    readOnly: number;
    /** Sessions that changed something outside `.akrctx/` — the denominator every rate uses. */
    mutating: number;
    capsuleBound: number;
    capsuleBeforeFirstMutation: number;
    capsuleComplete: number;
    validationDeclared: number;
    validationObserved: number;
    blockedPathTouched: number;
  };
}

export async function runTraceReport(options: CommandOptions): Promise<TraceReport> {
  const cwd = options.cwd ?? process.cwd();
  const sessions: SessionReport[] = [];
  for (const sessionId of await listTraceSessions(cwd)) {
    sessions.push(await summarize(cwd, await readTrace(cwd, sessionId)));
  }
  sessions.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));

  // Only complete traces are aggregated. A truncated trace cannot distinguish "the agent
  // never bound a capsule" from "the record stops before it did", and counting it either
  // way would quietly bias the very number this phase exists to produce.
  const usable = sessions.filter((session) => session.complete);
  // The contract predicates are counted over the sessions the contract applies to — those
  // that changed something outside `.akrctx/` — because that is the denominator the rate is
  // reported against. Counting them over every session instead produced rates above 100%.
  // Sessions whose ordering a shell command could have changed invisibly are held out of
  // the rates rather than counted as compliant or non-compliant. Reporting a number that
  // cannot be justified is exactly the failure this phase exists to end.
  const governed = usable.filter((session) => session.mutatedProject && !session.uncertainBeforeBinding);
  // Held out, but never dropped. Two distinct doubts land here: the ordering could not be
  // established, or nothing confirmed a change while something unobservable might have made
  // one. Counting only the first let a session with a late shell command vanish from the
  // aggregate entirely — neither in the rates nor in the caveat.
  const uncertain = usable.filter(
    (session) => session.uncertainBeforeBinding || (session.mutationUncertain && !session.mutatedProject),
  );
  const count = (predicate: (session: SessionReport) => boolean) => governed.filter(predicate).length;
  return {
    sessions,
    totals: {
      sessions: sessions.length,
      incomplete: sessions.length - usable.length,
      uncertain: uncertain.length,
      readOnly: usable.length - governed.length - uncertain.length,
      mutating: governed.length,
      capsuleBound: count((s) => s.capsuleBound),
      capsuleBeforeFirstMutation: count((s) => s.capsuleBeforeFirstMutation),
      capsuleComplete: count((s) => s.capsuleComplete === true),
      validationDeclared: count((s) => s.validationDeclared === true),
      validationObserved: count((s) => s.validationObserved === true),
      // Not a contract rate: a blocked read matters in any session, mutating or not, so it
      // is counted over every usable trace and reported as a count rather than a percentage.
      blockedPathTouched: usable.filter((session) => session.blockedPathTouched).length,
    },
  };
}

async function summarize(cwd: string, trace: Trace): Promise<SessionReport> {
  const report: SessionReport = {
    sessionId: trace.sessionId,
    startedAt: trace.header?.startedAt,
    source: trace.header?.source,
    baseCommit: trace.header?.baseCommit,
    complete: trace.complete,
    observations: trace.observations.length,
    capsuleBound: false,
    capsuleBeforeFirstMutation: false,
    mutatedProject: false,
    mutationUncertain: false,
    uncertainBeforeBinding: false,
    blockedPathTouched: false,
  };

  let boundBeforeMutation: string | undefined;
  let firstMutationSeen = false;
  let firstMutationWasBound = false;
  interface PendingAttempt {
    area?: Area;
    wasBound: boolean;
  }
  // Keep the attempt itself until its outcome arrives. A boolean "settled" flag cannot
  // recover the attempt's area when PostToolUse omits its input, and it cannot retract an
  // earlier doubt when the outcome proves the call failed.
  const pendingAttempts = new Map<string, PendingAttempt>();
  // Copilot's documented payload has no call id. Preserve multiplicity per tool: a Map to
  // one boolean let one Edit outcome silently settle every concurrent Edit attempt.
  const anonymousAttempts = new Map<string, PendingAttempt[]>();
  interface AnonymousOverlap {
    candidates: PendingAttempt[];
    outcomesSeen: number;
    sawSuccess: boolean;
  }
  // Once several anonymous calls overlap, FIFO is only bookkeeping — it is not evidence
  // that an outcome belongs to the first call. Retain the whole ambiguous group until all
  // its outcomes arrive, so an all-failure group can resolve cleanly while mixed ordering
  // remains conservative.
  const anonymousOverlaps = new Map<string, AnonymousOverlap>();
  const couldGovern = (attempt: PendingAttempt) => !attempt.area || governedAreas.includes(attempt.area);
  const markUncertain = (wasBound: boolean) => {
    report.mutationUncertain = true;
    report.uncertainBeforeBinding ||= !wasBound;
  };
  for (const observation of trace.observations) {
    if (observation.blocked) report.blockedPathTouched = true;
    if (observation.capsuleId) {
      report.capsuleBound = true;
      report.capsuleId ??= observation.capsuleId;
      if (!firstMutationSeen) boundBeforeMutation ??= observation.capsuleId;
    }
    // A shell command can rewrite the tree invisibly — `sed -i`, `rm`, `git apply`, any
    // script. Nothing in the invocation says whether it did, so rather than guess, the
    // session is marked uncertain and kept out of the rates.
    if (observation.shell) {
      report.mutationUncertain = true;
      if (!firstMutationSeen) report.uncertainBeforeBinding ||= !report.capsuleBound;
    }
    if (observation.mutating && observation.outcome === "attempted") {
      const attempt: PendingAttempt = { area: observation.area, wasBound: Boolean(boundBeforeMutation) };
      if (observation.callId) {
        const previous = pendingAttempts.get(observation.callId);
        if (previous && (couldGovern(previous) || couldGovern(attempt))) {
          // Duplicate ids make exact pairing impossible. Keep measuring, but never claim an
          // ordering that depends on choosing which attempt the host meant.
          markUncertain(previous.wasBound && attempt.wasBound);
        }
        pendingAttempts.set(observation.callId, attempt);
      } else {
        const tool = observation.tool ?? "";
        const queue = anonymousAttempts.get(tool) ?? [];
        queue.push(attempt);
        anonymousAttempts.set(tool, queue);
        anonymousOverlaps.get(tool)?.candidates.push(attempt);
      }
    } else if (observation.mutating && (observation.outcome === "succeeded" || observation.outcome === "failed")) {
      let attempt: PendingAttempt | undefined;
      if (observation.callId) {
        attempt = pendingAttempts.get(observation.callId);
        pendingAttempts.delete(observation.callId);
      } else {
        const tool = observation.tool ?? "";
        const queue = anonymousAttempts.get(tool);
        if (queue?.length) {
          let overlap = anonymousOverlaps.get(tool);
          if (!overlap && queue.length > 1) {
            overlap = { candidates: [...queue], outcomesSeen: 0, sawSuccess: false };
            anonymousOverlaps.set(tool, overlap);
          }
          if (overlap) {
            overlap.outcomesSeen += 1;
            overlap.sawSuccess ||= observation.outcome === "succeeded";
          }
          attempt = queue.shift();
          if (queue.length === 0) anonymousAttempts.delete(tool);
          if (overlap && overlap.outcomesSeen === overlap.candidates.length) {
            const candidates = overlap.candidates.filter(couldGovern);
            const boundStates = new Set(candidates.map((candidate) => candidate.wasBound));
            const areas = new Set(candidates.map((candidate) => candidate.area ?? "unknown"));
            if (overlap.sawSuccess && candidates.length && (boundStates.size > 1 || areas.size > 1)) {
              markUncertain(candidates.every((candidate) => candidate.wasBound));
            }
            anonymousOverlaps.delete(tool);
          }
        }
      }

      // A reported failure changed nothing, wherever it was aimed. Because uncertainty is
      // derived only after correlation, the outcome cleanly settles even a pathless call.
      if (observation.outcome === "failed") continue;

      const area = observation.area ?? attempt?.area;
      const wasBound = attempt?.wasBound ?? Boolean(boundBeforeMutation);
      if (!area) {
        markUncertain(wasBound);
      } else if (governedAreas.includes(area)) {
        report.mutatedProject = true;
        if (!firstMutationSeen) firstMutationWasBound = wasBound;
        firstMutationSeen = true;
      }
    }
  }

  // An attempt nobody ever reported the end of. The session may or may not have changed
  // anything, and saying which would be a guess.
  for (const attempt of pendingAttempts.values()) {
    if (couldGovern(attempt)) markUncertain(attempt.wasBound);
  }
  for (const attempts of anonymousAttempts.values()) {
    for (const attempt of attempts) {
      if (couldGovern(attempt)) markUncertain(attempt.wasBound);
    }
  }
  for (const overlap of anonymousOverlaps.values()) {
    const candidates = overlap.candidates.filter(couldGovern);
    if (candidates.length) markUncertain(candidates.every((candidate) => candidate.wasBound));
  }
  report.capsuleBeforeFirstMutation =
    (firstMutationSeen ? firstMutationWasBound : Boolean(boundBeforeMutation)) && !report.uncertainBeforeBinding;

  if (!report.capsuleId) return report;
  const taskDir = await findTaskDirectory(cwd, report.capsuleId);
  if (!taskDir) {
    // The capsule existed during the session and does not now. That is a real observation,
    // not a gap in the trace.
    report.capsuleComplete = false;
    return report;
  }
  report.capsuleComplete = (
    await Promise.all(
      capsuleFiles.map((file) =>
        readFile(path.join(cwd, taskDir, file), "utf8").then(
          () => true,
          () => false,
        ),
      ),
    )
  ).every(Boolean);

  const declaration = await readValidationDeclaration(cwd, report.capsuleId);
  report.validationDeclared = declaration.commands.length > 0;
  const declaredDigests = new Set(declaration.commands.map(digestCommand));
  report.validationObserved = trace.observations.some(
    (observation) => observation.commandDigest && declaredDigests.has(observation.commandDigest),
  );
  return report;
}
