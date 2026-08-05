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
  /**
   * Whether the first known mutation outside `.akrctx/` followed capsule binding. `null`
   * means there was no known mutation, or an unclassified shell obscured the ordering.
   */
  capsuleBeforeFirstMutation: boolean | null;
  /**
   * The session mutated something outside `.akrctx/`. Sessions that did not are not
   * contract failures, and are excluded from every rate below.
   */
  mutatedProject: boolean;
  /**
   * A shell command that may mutate ran, so this session may have changed the tree in a way
   * no observation records. Without a known mutation it is `uncertain`; with one it remains
   * mutating while its ordering may be unknown.
   */
  mutationUncertain: boolean;
  /** A possible mutation before binding prevents proving first-mutation ordering. */
  uncertainBeforeBinding: boolean;
  /** Distinct unclassified shell calls observed before capsule binding. */
  unclassifiedShellBeforeBinding: number;
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
    /** No known mutation, but a shell or unresolved write could have changed the tree. */
    uncertain: number;
    /**
     * Observed to change nothing outside `.akrctx/`, with nothing that could have changed
     * something unobserved. Not a contract failure and not a doubt — a read-only session.
     * Reported so the three buckets account for every usable trace.
     */
    readOnly: number;
    /** Sessions with a known mutation outside `.akrctx/`. */
    mutating: number;
    /** Known-mutating sessions whose first-mutation ordering is boolean evidence. */
    orderingKnown: number;
    /** Known-mutating sessions whose first-mutation ordering is `null`. */
    orderingUnknown: number;
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
  // A known mutation keeps a session in the shared denominator even when a shell leaves the
  // first-mutation ordering unknown. The three buckets partition usable traces; ordering is a
  // separate refinement of the known-mutating bucket rather than a reason to drop evidence.
  const mutating = usable.filter((session) => session.mutatedProject);
  const uncertain = usable.filter((session) => !session.mutatedProject && session.mutationUncertain);
  const readOnly = usable.filter((session) => !session.mutatedProject && !session.mutationUncertain);
  const orderingKnown = mutating.filter((session) => session.capsuleBeforeFirstMutation !== null);
  const orderingUnknown = mutating.filter((session) => session.capsuleBeforeFirstMutation === null);
  const countMutating = (predicate: (session: SessionReport) => boolean) => mutating.filter(predicate).length;
  return {
    sessions,
    totals: {
      sessions: sessions.length,
      incomplete: sessions.length - usable.length,
      uncertain: uncertain.length,
      readOnly: readOnly.length,
      mutating: mutating.length,
      orderingKnown: orderingKnown.length,
      orderingUnknown: orderingUnknown.length,
      capsuleBound: countMutating((s) => s.capsuleBound),
      capsuleBeforeFirstMutation: orderingKnown.filter((s) => s.capsuleBeforeFirstMutation === true).length,
      capsuleComplete: countMutating((s) => s.capsuleComplete === true),
      validationDeclared: countMutating((s) => s.validationDeclared === true),
      validationObserved: countMutating((s) => s.validationObserved === true),
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
    capsuleBeforeFirstMutation: null,
    mutatedProject: false,
    mutationUncertain: false,
    uncertainBeforeBinding: false,
    unclassifiedShellBeforeBinding: 0,
    blockedPathTouched: false,
  };

  let boundBeforeMutation: string | undefined;
  let firstMutationSeen = false;
  let firstMutationWasBound = false;
  interface PendingAttempt {
    area?: Area;
    wasBound: boolean;
    /** Whether this call started before the first known project mutation was established. */
    precededFirstKnownMutation: boolean;
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
  const shellCallsBeforeBinding = new Set<string>();
  const couldGovern = (attempt: PendingAttempt) => !attempt.area || governedAreas.includes(attempt.area);
  const markUncertain = (wasBound: boolean, precededFirstKnownMutation: boolean) => {
    report.mutationUncertain = true;
    // Once a known first mutation fixes the order, a later unresolved call cannot erase
    // that evidence. Calls that began before it remain relevant even if they resolve later.
    report.uncertainBeforeBinding ||= precededFirstKnownMutation && !wasBound;
  };
  for (const [observationIndex, observation] of trace.observations.entries()) {
    if (observation.blocked) report.blockedPathTouched = true;
    if (observation.capsuleId) {
      report.capsuleBound = true;
      report.capsuleId ??= observation.capsuleId;
      if (!firstMutationSeen) boundBeforeMutation ??= observation.capsuleId;
    }
    // A shell command can rewrite the tree invisibly — including an apparently read-only
    // executable with redirections, flags, or subcommands. Do not infer safety from its
    // retained executable label. Identified calls are counted once across their lifecycle.
    // For anonymous shells, only pre-tool creates a count: matching a later post by FIFO
    // would invent correlation under concurrency, while a post without a pre is uncertainty
    // evidence but not proof of another observed call.
    if (observation.shell) {
      report.mutationUncertain = true;
      if (!report.capsuleBound) {
        if (observation.callId || observation.event === "pre-tool") {
          const shellCall = observation.callId ? `call:${observation.callId}` : `pre:${observationIndex}`;
          if (!shellCallsBeforeBinding.has(shellCall)) {
            shellCallsBeforeBinding.add(shellCall);
            report.unclassifiedShellBeforeBinding += 1;
          }
        }
        // A shell after the first known mutation cannot change that mutation's ordering.
        if (!firstMutationSeen) report.uncertainBeforeBinding = true;
      }
    }
    if (observation.mutating && observation.outcome === "attempted") {
      const attempt: PendingAttempt = {
        area: observation.area,
        wasBound: Boolean(boundBeforeMutation),
        precededFirstKnownMutation: !firstMutationSeen,
      };
      if (observation.callId) {
        const previous = pendingAttempts.get(observation.callId);
        if (previous && (couldGovern(previous) || couldGovern(attempt))) {
          // Duplicate ids make exact pairing impossible. Keep measuring, but never claim an
          // ordering that depends on choosing which attempt the host meant.
          markUncertain(
            previous.wasBound && attempt.wasBound,
            previous.precededFirstKnownMutation || attempt.precededFirstKnownMutation,
          );
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
              markUncertain(
                candidates.every((candidate) => candidate.wasBound),
                candidates.some((candidate) => candidate.precededFirstKnownMutation),
              );
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
      const precededFirstKnownMutation = attempt?.precededFirstKnownMutation ?? !firstMutationSeen;
      if (!area) {
        markUncertain(wasBound, precededFirstKnownMutation);
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
    if (couldGovern(attempt)) markUncertain(attempt.wasBound, attempt.precededFirstKnownMutation);
  }
  for (const attempts of anonymousAttempts.values()) {
    for (const attempt of attempts) {
      if (couldGovern(attempt)) markUncertain(attempt.wasBound, attempt.precededFirstKnownMutation);
    }
  }
  for (const overlap of anonymousOverlaps.values()) {
    const candidates = overlap.candidates.filter(couldGovern);
    if (candidates.length) {
      markUncertain(
        candidates.every((candidate) => candidate.wasBound),
        candidates.some((candidate) => candidate.precededFirstKnownMutation),
      );
    }
  }
  report.capsuleBeforeFirstMutation =
    !firstMutationSeen || report.uncertainBeforeBinding ? null : firstMutationWasBound;

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
  report.validationObserved = validationWasObserved(trace.observations, declaredDigests);
  return report;
}

/**
 * A PreToolUse digest records intent, not execution. Count a validation only when a later
 * successful post event carries the same host call id and the same command digest. This
 * deliberately rejects missing outcomes, failures, anonymous calls, and successes from a
 * different call — all four used to create false evidence that tests had run.
 */
function validationWasObserved(observations: Trace["observations"], declaredDigests: ReadonlySet<string>): boolean {
  const attempted = new Map<string, Set<string>>();
  for (const observation of observations) {
    if (!observation.callId || !observation.commandDigest || !declaredDigests.has(observation.commandDigest)) {
      continue;
    }
    if (observation.event === "pre-tool") {
      const digests = attempted.get(observation.callId) ?? new Set<string>();
      digests.add(observation.commandDigest);
      attempted.set(observation.callId, digests);
      continue;
    }
    if (
      observation.event === "post-tool" &&
      observation.outcome === "succeeded" &&
      attempted.get(observation.callId)?.has(observation.commandDigest)
    ) {
      return true;
    }
  }
  return false;
}
