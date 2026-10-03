import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sectionBody, sectionBullets } from "./judge-enforcement.js";

const execFileAsync = promisify(execFile);

/** Hard cap for one notice, in characters. */
export const CLARIFICATION_NOTICE_LIMIT = 1024;

/**
 * Experimental, non-blocking signal. It compares text across a reviewed boundary and reports an
 * observable documentation gap. It never proves that a human was or was not consulted.
 */
export interface ClarificationSignalInput {
  /** Repository that holds the base commit. */
  cwd: string;
  taskId: string;
  baseCommit: string;
  /** `scope.candidate`: `WORKTREE`, a snapshot ID or the operator's commit ref. */
  candidate: string;
  candidateCommit: string;
  /** Root of the loaded snapshot worktree. Null when the candidate is not a snapshot. */
  snapshotRoot: string | null;
}

interface Source {
  /** Names of the entries under `.akrctx/tasks/`. */
  tasks(): Promise<string[]>;
  read(relative: string): Promise<string>;
}

type Side = { kind: "capsule"; dir: string; source: Source } | { kind: "absent" };

const STRUCTURED_LINE = /^\s*(?:proof-command|proof-doc|Retired):/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}#{1,6}(?:\s|$)/;
const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+/;
const NO_AMBIGUITY = /^no ambiguity:\s*(\S[\s\S]*)?$/i;

export async function clarificationSignalNotices(input: ClarificationSignalInput): Promise<string[]> {
  if (input.candidate.toUpperCase() === "WORKTREE") {
    return [
      unavailable(
        "the candidate is WORKTREE; only a snapshot or commit-ref boundary has reviewed base and candidate content",
      ),
    ];
  }
  const snapshot = input.candidate.startsWith("SNAPSHOT:");
  if (snapshot && input.snapshotRoot === null) return [unavailable(`snapshot ${input.candidate} cannot be loaded`)];

  let base: Side;
  let candidate: Side;
  try {
    base = await locate(gitSource(input.cwd, input.baseCommit), input.taskId);
    candidate = await locate(
      snapshot ? fsSource(input.snapshotRoot as string) : gitSource(input.cwd, input.candidateCommit),
      input.taskId,
    );
  } catch (error) {
    return [unavailable(messageOf(error))];
  }
  // A capsule that is new in this boundary has no earlier text to compare.
  if (base.kind === "absent") return [];
  if (candidate.kind === "absent") return [unavailable("the candidate boundary holds no capsule for the task")];

  const taskPath = `.akrctx/tasks/${candidate.dir}/task.md`;
  const criteriaPath = `.akrctx/tasks/${candidate.dir}/acceptance-criteria.md`;
  const baseTask = await readSide(base, "task.md");
  const candidateTask = await readSide(candidate, "task.md");
  if (typeof baseTask !== "string" || typeof candidateTask !== "string") {
    return [unavailable(`task.md is missing or unreadable (${[baseTask, candidateTask].find(isFailure)?.failure})`)];
  }
  const baseClarifications = sectionBody(lf(baseTask), "Clarifications");
  const candidateClarifications = sectionBody(lf(candidateTask), "Clarifications");
  // Capsules that predate the Clarifications section stay inconclusive.
  if (baseClarifications === undefined || candidateClarifications === undefined) return [];

  const changed: Array<{ name: string; relative: string; before: string[]; after: string[] }> = [];
  const unreadable: string[] = [];
  const baseContract = sectionBody(lf(baseTask), "Contract");
  const candidateContract = sectionBody(lf(candidateTask), "Contract");
  if (!sameBlocks(baseContract ?? "", candidateContract ?? "")) {
    changed.push({
      name: "task.md `## Contract`",
      relative: taskPath,
      before: rawLines(baseContract ?? ""),
      after: rawLines(candidateContract ?? ""),
    });
  }
  const baseCriteria = await readSide(base, "acceptance-criteria.md");
  const candidateCriteria = await readSide(candidate, "acceptance-criteria.md");
  if (typeof baseCriteria !== "string" || typeof candidateCriteria !== "string") {
    unreadable.push(
      unavailable(
        `acceptance-criteria.md is missing or unreadable (${[baseCriteria, candidateCriteria].find(isFailure)?.failure})`,
      ),
    );
  } else if (!sameBlocks(baseCriteria, candidateCriteria)) {
    changed.push({
      name: "acceptance-criteria.md",
      relative: criteriaPath,
      before: rawLines(baseCriteria),
      after: rawLines(candidateCriteria),
    });
  }

  if (changed.length > 0 && !hasNewClarification(baseClarifications, candidateClarifications)) {
    const pointer = `base ${input.baseCommit.slice(0, 12)} to candidate ${
      snapshot ? input.candidate : input.candidateCommit.slice(0, 12)
    }`;
    return [
      ...changed.map((item) => {
        const { added, deleted } = countLineChanges(item.before, item.after);
        return boundedNotice(item.name, added, deleted, pointer, item.relative);
      }),
      ...unreadable,
    ];
  }
  return unreadable;
}

/** One bullet under Clarifications whose normalized body is absent in the base and is not empty content. */
function hasNewClarification(base: string, candidate: string): boolean {
  const known = new Set(sectionBullets(base).map(normalizeBullet));
  return sectionBullets(candidate).some((bullet) => {
    const assertion = NO_AMBIGUITY.exec(bullet);
    if (assertion && !assertion[1]?.trim()) return false;
    return !known.has(normalizeBullet(bullet));
  });
}

function normalizeBullet(bullet: string): string {
  return normalizeBlocks(`- ${bullet}`).join("\n");
}

export function boundedNotice(name: string, added: number, deleted: number, pointer: string, relative: string): string {
  const build = (shown: string) =>
    `Heuristic notice (experimental): ${name} changed (+${added}/-${deleted} raw lines) with no new recorded clarification content and no non-empty \`No ambiguity:\` explanation. Compare ${pointer}; path ${shown}. This compares text only. It does not show that a consultation was skipped.`;
  const full = build(relative);
  if (full.length <= CLARIFICATION_NOTICE_LIMIT) return full;
  const room = CLARIFICATION_NOTICE_LIMIT - build("").length - 1;
  return build(`…${relative.slice(relative.length - Math.max(room, 0))}`).slice(0, CLARIFICATION_NOTICE_LIMIT);
}

function unavailable(reason: string): string {
  const text = `Clarification comparison unavailable: ${reason}. No conclusion about consultation is drawn.`;
  return text.length <= CLARIFICATION_NOTICE_LIMIT ? text : `${text.slice(0, CLARIFICATION_NOTICE_LIMIT - 1)}…`;
}

async function locate(source: Source, taskId: string): Promise<Side> {
  const matches = (await source.tasks()).filter((name) => name === taskId || name.startsWith(`${taskId}-`));
  if (matches.length === 0) return { kind: "absent" };
  if (matches.length > 1) throw new Error(`more than one capsule matches ${taskId}`);
  return { kind: "capsule", dir: matches[0], source };
}

async function readSide(side: Side & { kind: "capsule" }, file: string): Promise<string | { failure: string }> {
  try {
    return await side.source.read(`.akrctx/tasks/${side.dir}/${file}`);
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

function isFailure(value: string | { failure: string }): value is { failure: string } {
  return typeof value !== "string";
}

function gitSource(cwd: string, commit: string): Source {
  const run = async (args: string[]) =>
    (await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })).stdout;
  return {
    tasks: async () =>
      (await run(["ls-tree", "--name-only", commit, ".akrctx/tasks/"]))
        .split("\n")
        .filter(Boolean)
        .map((entry) => path.posix.basename(entry)),
    read: (relative) => run(["show", `${commit}:${relative}`]),
  };
}

function fsSource(root: string): Source {
  return {
    tasks: async () => (await readdir(path.join(root, ".akrctx", "tasks")).catch(() => [])) as string[],
    read: (relative) => readFile(path.join(root, relative), "utf8"),
  };
}

const lf = (text: string) => text.replace(/\r\n?/g, "\n");

function rawLines(text: string): string[] {
  const lines = lf(text).split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function sameBlocks(a: string, b: string): boolean {
  const left = normalizeBlocks(a);
  const right = normalizeBlocks(b);
  return left.length === right.length && left.every((block, index) => block === right[index]);
}

/**
 * Block list that ignores only CRLF/LF, whitespace reflow inside prose and one terminal full stop
 * on a prose block. Fenced code, inline code, headings and structured declaration lines
 * (`proof-command:`, `proof-doc:`, `Retired:`) stay exact. Block order stays significant.
 */
export function normalizeBlocks(markdown: string): string[] {
  const lines = lf(markdown).split("\n");
  const blocks: string[] = [];
  let prose: string[] = [];
  const flush = () => {
    if (prose.length > 0) blocks.push(normalizeProse(prose));
    prose = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const open = FENCE.exec(line);
    if (open) {
      flush();
      const marker = open[1];
      const body = [line];
      for (index++; index < lines.length; index++) {
        body.push(lines[index]);
        const trimmed = lines[index].trim();
        if (trimmed[0] === marker[0] && trimmed.length >= marker.length && /^(`+|~+)$/.test(trimmed)) break;
      }
      blocks.push(body.join("\n"));
    } else if (!line.trim()) {
      flush();
    } else if (STRUCTURED_LINE.test(line) || HEADING.test(line)) {
      flush();
      blocks.push(line.trim());
    } else {
      if (LIST_ITEM.test(line)) flush();
      prose.push(line);
    }
  }
  flush();
  return blocks;
}

function normalizeProse(lines: string[]): string {
  const indent = LIST_ITEM.test(lines[0]) ? (/^\s*/.exec(lines[0]) as RegExpExecArray)[0] : "";
  const text = collapseOutsideCode(lines.map((line) => line.trim()).join(" "));
  // Only a lone full stop is cosmetic. `...`, `?`, `)` and the like can be semantic.
  return indent + (/[^.]\.$/.test(text) ? text.slice(0, -1) : text);
}

function collapseOutsideCode(text: string): string {
  let out = "";
  let last = 0;
  for (const span of text.matchAll(/(`+)[\s\S]*?\1/g)) {
    out += text.slice(last, span.index).replace(/\s+/g, " ") + span[0];
    last = (span.index as number) + span[0].length;
  }
  return out + text.slice(last).replace(/\s+/g, " ");
}

/** Added and deleted line counts of a line diff, from the longest common subsequence. */
export function countLineChanges(before: string[], after: string[]): { added: number; deleted: number } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  if (a.length * b.length > 4_000_000) {
    // Too large for the table. Compare as multisets: a bound, not an exact diff.
    const pool = new Map<string, number>();
    for (const line of a) pool.set(line, (pool.get(line) ?? 0) + 1);
    let common = 0;
    for (const line of b) {
      const left = pool.get(line) ?? 0;
      if (left > 0) {
        pool.set(line, left - 1);
        common++;
      }
    }
    return { added: b.length - common, deleted: a.length - common };
  }
  let previous = new Uint32Array(b.length + 1);
  for (const lineA of a) {
    const current = new Uint32Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) {
      current[j] = lineA === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  const common = previous[b.length];
  return { added: b.length - common, deleted: a.length - common };
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0];
}
