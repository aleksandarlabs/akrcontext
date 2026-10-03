/** One `proof-command:` or `proof-doc:` line under a criterion. */
export interface ProofDeclaration {
  kind: "command" | "doc";
  /** The value as written, trimmed. A document reference may end in `#Heading`. */
  reference: string;
  /** 1-based line number in acceptance-criteria.md. */
  line: number;
}

export interface AcceptanceCriterion {
  /** The `AC-<n>` identifier, or null for an unnumbered or malformed bullet. */
  id: string | null;
  /** Bullet text with wrapped continuation lines joined. Proof lines are not part of it. */
  text: string;
  /** 1-based line number in acceptance-criteria.md. */
  line: number;
  /** Valid proof declarations in document order, identical kind/reference pairs counted once. */
  proofs: ProofDeclaration[];
}

export interface CriteriaIdentityScan {
  criteria: AcceptanceCriterion[];
  ids: string[];
  retiredIds: string[];
  unnumberedLines: number[];
  problems: Array<{ kind: "unnumbered" | "identity" | "proof"; message: string }>;
}

const ACTIVE_ID = /^(AC-[1-9][0-9]*):\s+\S/;
const RETIRED_ID = /^Retired: (AC-[1-9][0-9]*)$/;
const AC_LIKE = /^AC(?:[-_:\s\d]|$)/i;
const PROOF_LIKE = /^proof(?:-[A-Za-z0-9_-]*)?\s*:/i;
const PROOF_LINE = /^proof-(command|doc):(.*)$/;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

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
  const defect = (line: number, detail: string, kind: "unnumbered" | "identity" | "proof" = "identity") => {
    problems.push({ kind, message: `acceptance-criteria.md line ${line} ${detail}` });
  };

  for (const [index, rawLine] of markdown.split("\n").entries()) {
    const line = rawLine.replace(/\r$/, "");
    const number = index + 1;
    const bullet = /^-[ \t]+(.*)$/.exec(line);
    if (bullet) {
      const text = bullet[1].trim();
      const id = ACTIVE_ID.exec(text)?.[1] ?? null;
      continuation = { id, text, line: number, proofs: [] };
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
    if (PROOF_LIKE.test(line.trimStart())) {
      const owner = /^\s/.test(line) ? continuation : undefined;
      if (!/^\s/.test(line)) continuation = undefined;
      readProof(owner, line.trim(), number, defect);
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

function readProof(
  owner: AcceptanceCriterion | undefined,
  text: string,
  line: number,
  defect: (line: number, detail: string, kind: "proof") => void,
): void {
  if (!owner) {
    defect(line, `has an orphaned proof declaration: ${quote(text)}`, "proof");
    return;
  }
  const match = PROOF_LINE.exec(text);
  if (!match) {
    defect(line, `has an unsupported proof declaration (use proof-command: or proof-doc:): ${quote(text)}`, "proof");
    return;
  }
  const kind = match[1] === "command" ? "command" : "doc";
  const reference = match[2].trim();
  if (!reference) {
    defect(line, `has an empty proof-${match[1]} declaration`, "proof");
    return;
  }
  if (kind === "doc") {
    const invalid = invalidDocReference(reference);
    if (invalid) {
      defect(line, `has an invalid proof-doc reference ${quote(reference)}: ${invalid}`, "proof");
      return;
    }
  }
  if (!owner.proofs.some((proof) => proof.kind === kind && proof.reference === reference)) {
    owner.proofs.push({ kind, reference, line });
  }
}

/** Repository path part of a proof-doc reference, without its optional `#Heading` fragment. */
export function docReferencePath(reference: string): string {
  const hash = reference.indexOf("#");
  return hash === -1 ? reference : reference.slice(0, hash);
}

/** Syntactic checks only. Nothing here touches the filesystem. */
function invalidDocReference(reference: string): string | null {
  const hash = reference.indexOf("#");
  const target = docReferencePath(reference);
  if (!target) return "it has no file path";
  if (hash !== -1 && !reference.slice(hash + 1).trim()) return "its heading fragment is empty";
  if (URL_SCHEME.test(target)) return "it is a URL or drive path, not a repository-relative path";
  if (target.includes("\\")) return "it must use / separators";
  if (target.startsWith("/")) return "it is an absolute path";
  if (target.split("/").includes("..")) return "it traverses outside the repository";
  return null;
}

function quote(text: string): string {
  return `"${text.length > 72 ? `${text.slice(0, 72)}…` : text}"`;
}
