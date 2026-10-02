export interface AcceptanceCriterion {
  /** The `AC-<n>` identifier, or null for an unnumbered or malformed bullet. */
  id: string | null;
  /** Bullet text with wrapped continuation lines joined. */
  text: string;
  /** 1-based line number in acceptance-criteria.md. */
  line: number;
}

export interface CriteriaIdentityScan {
  criteria: AcceptanceCriterion[];
  ids: string[];
  retiredIds: string[];
  unnumberedLines: number[];
  problems: Array<{ kind: "unnumbered" | "identity"; message: string }>;
}

const ACTIVE_ID = /^(AC-[1-9][0-9]*):\s+\S/;
const RETIRED_ID = /^Retired: (AC-[1-9][0-9]*)$/;
const AC_LIKE = /^AC(?:[-_:\s\d]|$)/i;

/** Shared identity contract for the reader and the add-only migration. */
export function scanCriteriaIdentities(markdown: string): CriteriaIdentityScan {
  const criteria: AcceptanceCriterion[] = [];
  const ids: string[] = [];
  const retiredIds: string[] = [];
  const unnumberedLines: number[] = [];
  const problems: CriteriaIdentityScan["problems"] = [];
  const active = new Set<string>();
  const retired = new Set<string>();
  let footerStarted = false;
  let continuation: AcceptanceCriterion | undefined;
  const defect = (line: number, detail: string, kind: "unnumbered" | "identity" = "identity") => {
    problems.push({ kind, message: `acceptance-criteria.md line ${line} ${detail}` });
  };

  for (const [index, rawLine] of markdown.split("\n").entries()) {
    const line = rawLine.replace(/\r$/, "");
    const number = index + 1;
    const bullet = /^-[ \t]+(.*)$/.exec(line);
    if (bullet) {
      const text = bullet[1].trim();
      const id = ACTIVE_ID.exec(text)?.[1] ?? null;
      continuation = { id, text, line: number };
      criteria.push(continuation);
      if (footerStarted) defect(number, "declares a criterion after the Retired footer");
      if (!id) {
        if (/^Retired\b/i.test(text)) {
          defect(number, `has malformed retirement metadata: ${quote(text)}`);
        } else if (AC_LIKE.test(text)) {
          defect(number, `has a malformed AC-<n> identifier: ${quote(text)}`);
        } else {
          unnumberedLines.push(number);
          defect(number, `has no AC-<n> identifier: ${quote(text)}`, "unnumbered");
        }
      } else if (active.has(id)) {
        defect(number, `repeats ${id}: ${quote(text)}`);
      } else {
        if (retired.has(id)) defect(number, `uses retired identifier ${id}`);
        active.add(id);
        ids.push(id);
      }
      continue;
    }

    if (/^Retired\b/i.test(line.trimStart())) {
      footerStarted = true;
      continuation = undefined;
      const id = RETIRED_ID.exec(line)?.[1];
      if (!id) {
        defect(number, `has malformed retirement metadata: ${quote(line)}`);
      } else {
        if (retired.has(id)) defect(number, `repeats retirement ${id}`);
        if (active.has(id)) defect(number, `retires active identifier ${id}`);
        if (!retired.has(id)) retiredIds.push(id);
        retired.add(id);
      }
      continue;
    }
    if (continuation && /^\s+\S/.test(line)) {
      continuation.text = `${continuation.text} ${line.trim()}`;
    } else if (line.trim()) {
      continuation = undefined;
    }
  }
  return { criteria, ids, retiredIds, unnumberedLines, problems };
}

function quote(text: string): string {
  return `"${text.length > 72 ? `${text.slice(0, 72)}…` : text}"`;
}
