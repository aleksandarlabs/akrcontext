import { exec, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  createJudgeScope,
  matchesBlockedPattern,
  readBlockedPatterns,
  verifyJudgeRecord,
} from "./judge-enforcement.js";
import { frozenInstallCommand, isSnapshotCandidate, loadJudgeSnapshot } from "./judge-snapshot.js";
import { captureValidationError, sanitizeValidationCommand } from "./validation-evidence.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const COMMAND_TIMEOUT_MS = 15 * 60_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const GLOB_CHARACTERS = /[*?[\]{}]/;
const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export interface MechanicalGenerator {
  command: string;
  commit: string;
  review: string;
  inputs: string[];
  prepare: string[];
}

export interface MechanicalDeclaration {
  generator: MechanicalGenerator;
  paths: string[];
}

export interface MechanicalDeclarationRead {
  /** Whether task.md has a `## Migration` section at all. */
  sectionPresent: boolean;
  declaration: MechanicalDeclaration | null;
  /** Named reasons the declaration is refused. Empty when `declaration` is set. */
  problems: string[];
}

export interface MechanicalReproductionOptions {
  base: string;
  candidate: string;
  includedTaskIds?: string[];
  /** Operator consent for the complete ordered command list, shown before anything runs. */
  approve?: (commands: string[], context: { generatorRoot: string }) => Promise<boolean>;
}

export interface MechanicalReproductionResult {
  ok: boolean;
  taskId: string;
  candidate: string;
  baseCommit: string | null;
  reasons: string[];
  notices: string[];
  /** The exact ordered list the operator approved. */
  commands: string[];
  /** The external tool workspace bound to AKRCTX_GENERATOR_ROOT; null before it exists. */
  generatorRoot: string | null;
  paths: string[];
  reproduced: string[];
  differing: string[];
  unexpectedWrites: string[];
  /** Candidate changes outside `paths`. They need ordinary review. */
  nonGeneratedChanges: string[];
}

interface PathState {
  kind: "absent" | "file" | "symlink" | "other";
  digest: string;
  executable: boolean;
  target: string;
}

interface Fingerprint {
  content: string;
  ctime: number;
}

const ABSENT: PathState = { kind: "absent", digest: "", executable: false, target: "" };

/** Reads and validates the fenced JSON object under `## Migration`. Never executes anything. */
export async function readMigrationDeclaration(
  taskRoot: string,
  blockedPatterns: string[],
): Promise<MechanicalDeclarationRead> {
  let markdown: string;
  try {
    markdown = await readFile(path.join(taskRoot, "task.md"), "utf8");
  } catch {
    return { sectionPresent: false, declaration: null, problems: ["The task capsule has no readable task.md."] };
  }
  const section = /\n##\s+Migration\s*\n([\s\S]*?)(?=\n##\s|$)/.exec(markdown);
  if (!section) {
    return { sectionPresent: false, declaration: null, problems: ["The task capsule has no `## Migration` section."] };
  }
  const fences = [...section[1].matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  if (fences.length !== 1) {
    return refused(`\`## Migration\` must contain exactly one fenced JSON object; found ${fences.length}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fences[0][1]);
  } catch (error) {
    return refused(`\`## Migration\` is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const problems: string[] = [];
  if (!isRecord(parsed)) return refused("`## Migration` must be a JSON object with generator and paths keys.");
  unknownKeys(parsed, ["generator", "paths"], "migration", problems);
  const generator = parsed.generator;
  let result: MechanicalGenerator | null = null;
  if (!isRecord(generator)) {
    problems.push("migration.generator must be an object.");
  } else {
    unknownKeys(generator, ["command", "commit", "review", "inputs", "prepare"], "generator", problems);
    const command = requiredString(generator.command, "generator.command", problems);
    const commit = requiredString(generator.commit, "generator.commit", problems);
    if (commit && !FULL_SHA.test(commit)) problems.push("generator.commit must be a full Git SHA.");
    const review = requiredString(generator.review, "generator.review", problems);
    const inputs = pathList(generator.inputs, "generator.inputs", blockedPatterns, problems);
    const prepare = prepareList(generator.prepare, problems);
    if (problems.length === 0 && command && commit && review && inputs && prepare) {
      result = { command, commit, review, inputs, prepare };
    }
  }
  const paths = pathList(parsed.paths, "paths", blockedPatterns, problems);
  if (problems.length > 0 || !result || !paths) return { sectionPresent: true, declaration: null, problems };
  return { sectionPresent: true, declaration: { generator: result, paths }, problems: [] };
}

function refused(problem: string): MechanicalDeclarationRead {
  return { sectionPresent: true, declaration: null, problems: [problem] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, known: string[], label: string, problems: string[]): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) problems.push(`Unknown key in ${label}: ${key}.`);
  }
}

function requiredString(value: unknown, label: string, problems: string[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    problems.push(`${label} must be a non-empty string.`);
    return null;
  }
  return value.trim();
}

function prepareList(value: unknown, problems: string[]): string[] | null {
  if (!Array.isArray(value)) {
    problems.push("generator.prepare must be an array of shell commands; use [] when none is needed.");
    return null;
  }
  const commands: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      problems.push(`generator.prepare[${index}] must be a non-empty string.`);
    } else {
      commands.push(entry.trim());
    }
  }
  return commands.length === value.length ? commands : null;
}

function pathList(value: unknown, label: string, blockedPatterns: string[], problems: string[]): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${label} must be a non-empty array of repository-relative paths.`);
    return null;
  }
  const seen = new Set<string>();
  const accepted: string[] = [];
  let valid = true;
  for (const [index, entry] of value.entries()) {
    const reason = unsafePathReason(entry, blockedPatterns);
    if (reason) {
      problems.push(`${label}[${index}] ${reason}`);
      valid = false;
    } else if (seen.has(entry as string)) {
      problems.push(`${label} lists ${entry as string} more than once.`);
      valid = false;
    } else {
      seen.add(entry as string);
      accepted.push(entry as string);
    }
  }
  return valid ? accepted : null;
}

function unsafePathReason(entry: unknown, blockedPatterns: string[]): string | null {
  if (typeof entry !== "string" || entry.length === 0) return "must be a non-empty string.";
  if (entry.includes("\0") || entry.includes("\\")) return `(${entry}) contains a forbidden character.`;
  if (entry.startsWith("/") || /^[A-Za-z]:/.test(entry)) return `(${entry}) must not be absolute.`;
  if (GLOB_CHARACTERS.test(entry)) return `(${entry}) must be an exact path, not a glob.`;
  const segments = entry.split("/");
  if (segments.includes("..")) return `(${entry}) must not traverse upward.`;
  if (path.posix.normalize(entry) !== entry || segments.includes(".") || entry.endsWith("/")) {
    return `(${entry}) must be a normalized file path.`;
  }
  if (segments.includes(".git")) return `(${entry}) must not touch .git.`;
  if (blockedPatterns.some((pattern) => matchesBlockedPattern(entry, pattern))) {
    return `(${entry}) is blocked by blockedReadPatterns.`;
  }
  return null;
}

async function gitBuffer(cwd: string, args: string[]): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "buffer", maxBuffer: MAX_BUFFER });
  return stdout;
}

async function gitText(cwd: string, args: string[]): Promise<string> {
  return (await gitBuffer(cwd, args)).toString("utf8").trim();
}

async function blobAt(
  cwd: string,
  commit: string,
  file: string,
): Promise<{ bytes: Buffer; executable: boolean } | undefined> {
  try {
    const entry = (await gitText(cwd, ["ls-tree", commit, "--", file])).split("\t")[0]?.split(" ");
    if (!entry || entry[1] !== "blob" || (entry[0] !== "100644" && entry[0] !== "100755")) return undefined;
    return { bytes: await gitBuffer(cwd, ["show", `${commit}:${file}`]), executable: entry[0] === "100755" };
  } catch {
    return undefined;
  }
}

/**
 * Checks that the generator was landed and reviewed before this change, and has not moved since.
 *
 * The review record must be a verified APPROVED snapshot record. Every input must match the
 * reviewed content, the landed commit and the mechanical base. Returns named reasons; an empty
 * list means provenance holds. Nothing is executed and nothing is written.
 */
export async function checkGeneratorProvenance(
  cwd: string,
  generator: MechanicalGenerator,
  baseCommit: string,
): Promise<string[]> {
  const reasons: string[] = [];
  const isCommit = await gitText(cwd, ["cat-file", "-t", generator.commit]).catch(() => "");
  if (isCommit !== "commit") return [`generator.commit ${generator.commit} is not a commit in this repository.`];
  const ancestor = await execFileAsync("git", ["merge-base", "--is-ancestor", generator.commit, baseCommit], { cwd })
    .then(() => true)
    .catch(() => false);
  if (!ancestor) reasons.push(`generator.commit ${generator.commit} is not an ancestor of the mechanical base.`);

  const absoluteReview = path.resolve(cwd, generator.review);
  const relativeReview = path.relative(cwd, absoluteReview);
  if (relativeReview.startsWith("..") || path.isAbsolute(relativeReview)) {
    reasons.push("generator.review must be inside the project.");
    return reasons;
  }
  let reviewed: { candidate?: string } | undefined;
  try {
    reviewed = (JSON.parse(await readFile(absoluteReview, "utf8")) as { scope?: { candidate?: string } }).scope;
  } catch {
    reasons.push(`generator.review ${generator.review} is missing or is not valid JSON.`);
    return reasons;
  }
  if (!reviewed?.candidate || !isSnapshotCandidate(reviewed.candidate)) {
    reasons.push("generator.review must be a record for an immutable SNAPSHOT candidate.");
    return reasons;
  }
  const verified = await verifyJudgeRecord(cwd, relativeReview);
  if (!verified.approved) {
    reasons.push(`generator.review is not a verified APPROVED record: ${verified.reasons.join(" ")}`);
    return reasons;
  }
  let reviewedRoot: string;
  try {
    reviewedRoot = (await loadJudgeSnapshot(cwd, reviewed.candidate)).worktreePath;
  } catch (error) {
    reasons.push(`The reviewed generator snapshot cannot be loaded: ${error instanceof Error ? error.message : error}`);
    return reasons;
  }
  for (const input of generator.inputs) {
    const reviewedBytes = await readRegular(path.join(reviewedRoot, input));
    const landed = await blobAt(cwd, generator.commit, input);
    const inBase = await blobAt(cwd, baseCommit, input);
    if (!landed) reasons.push(`Generator input ${input} is not a regular file in the landed commit.`);
    if (!inBase) reasons.push(`Generator input ${input} is not a regular file in the mechanical base.`);
    if (!reviewedBytes) reasons.push(`Generator input ${input} is not in the reviewed content.`);
    if (!landed || !inBase || !reviewedBytes) continue;
    if (!reviewedBytes.equals(landed.bytes)) {
      reasons.push(`Generator input ${input} differs between the reviewed content and the landed commit.`);
    }
    if (!inBase.bytes.equals(landed.bytes) || inBase.executable !== landed.executable) {
      reasons.push(`Generator input ${input} was modified after the landed commit.`);
    }
  }
  return reasons;
}

async function readRegular(file: string): Promise<Buffer | undefined> {
  const info = await lstat(file).catch(() => undefined);
  if (!info || !info.isFile()) return undefined;
  return readFile(file);
}

async function walk(root: string): Promise<Map<string, Fingerprint & { dir: boolean }>> {
  const manifest = new Map<string, Fingerprint & { dir: boolean }>();
  async function visit(relative: string): Promise<void> {
    const absolute = path.join(root, relative);
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const child = path.posix.join(relative.split(path.sep).join("/"), entry.name);
      const full = path.join(root, child);
      const info = await lstat(full);
      if (info.isDirectory()) {
        manifest.set(child, { content: "dir", ctime: info.ctimeMs, dir: true });
        await visit(child);
      } else if (info.isSymbolicLink()) {
        manifest.set(child, {
          content: hash(["symlink\0", await readlink(full)]),
          ctime: info.ctimeMs,
          dir: false,
        });
      } else if (info.isFile()) {
        manifest.set(child, {
          content: hash(["file\0", String(info.mode & 0o111), "\0", await readFile(full)]),
          ctime: info.ctimeMs,
          dir: false,
        });
      } else {
        manifest.set(child, { content: `type:${info.mode}`, ctime: info.ctimeMs, dir: false });
      }
    }
  }
  const rootInfo = await lstat(root);
  manifest.set(".", { content: "dir", ctime: rootInfo.ctimeMs, dir: true });
  await visit("");
  return manifest;
}

function hash(parts: Array<string | Buffer>): string {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part);
  return digest.digest("hex");
}

async function stateOf(root: string, relative: string): Promise<PathState> {
  const full = path.join(root, relative);
  const info = await lstat(full).catch(() => undefined);
  if (!info) return ABSENT;
  if (info.isSymbolicLink()) {
    return { kind: "symlink", digest: "", executable: false, target: await readlink(full) };
  }
  if (info.isFile()) {
    return {
      kind: "file",
      digest: hash([await readFile(full)]),
      executable: (info.mode & 0o100) !== 0,
      target: "",
    };
  }
  return { kind: "other", digest: String(info.mode), executable: false, target: "" };
}

function describeDifference(reproduced: PathState, candidate: PathState): string[] {
  if (reproduced.kind !== candidate.kind) {
    return [reproduced.kind === "absent" || candidate.kind === "absent" ? "existence" : "file type"];
  }
  const differences: string[] = [];
  if (reproduced.digest !== candidate.digest) differences.push("bytes");
  if (reproduced.executable !== candidate.executable) differences.push("executable bit");
  if (reproduced.target !== candidate.target) differences.push("symlink target");
  return differences;
}

function sameState(left: PathState, right: PathState): boolean {
  return describeDifference(left, right).length === 0;
}

async function symlinkAncestor(root: string, relative: string): Promise<string | null> {
  const segments = relative.split("/");
  for (let index = 1; index < segments.length; index += 1) {
    const ancestor = segments.slice(0, index).join("/");
    const info = await lstat(path.join(root, ancestor)).catch(() => undefined);
    if (info?.isSymbolicLink()) return ancestor;
  }
  return null;
}

/** Plans the frozen lockfile install the runner adds before `prepare`. Null when none is needed. */
async function planDependencyInstall(toolRoot: string): Promise<string | null> {
  let packageJson: Record<string, unknown>;
  try {
    packageJson = JSON.parse(await readFile(path.join(toolRoot, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const hasDependencies = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some(
    (field) => isRecord(packageJson[field]) && Object.keys(packageJson[field] as object).length > 0,
  );
  if (!hasDependencies) return null;
  const command = await frozenInstallCommand(toolRoot);
  if (!command) {
    throw new Error(
      "The generator inputs include a package.json that declares dependencies but no lockfile input; add the committed lockfile to generator.inputs.",
    );
  }
  return command.join(" ");
}

/**
 * Reproduces a declared mechanical change from the base and compares it to the snapshot candidate.
 *
 * Process isolation, not an OS sandbox. The generator runs against a disposable copy of the base,
 * with its tool workspace outside the project. The live project and the snapshot are only read.
 * The result is local evidence; it is not a receipt and does not replace review of the generator
 * or of any change outside the declared paths.
 */
export async function reproduceMechanicalChange(
  cwd: string,
  taskId: string,
  options: MechanicalReproductionOptions,
): Promise<MechanicalReproductionResult> {
  const result: MechanicalReproductionResult = {
    ok: false,
    taskId,
    candidate: options.candidate,
    baseCommit: null,
    reasons: [],
    notices: [
      "Reproduction is evidence about the result. The judge still reviews the generator and every non-generated change.",
      "This is process isolation, not an OS sandbox.",
    ],
    commands: [],
    generatorRoot: null,
    paths: [],
    reproduced: [],
    differing: [],
    unexpectedWrites: [],
    nonGeneratedChanges: [],
  };
  const fail = (reason: string): MechanicalReproductionResult => {
    result.reasons.push(reason);
    return result;
  };
  if (!isSnapshotCandidate(options.candidate)) {
    return fail("Reproduction requires an immutable SNAPSHOT candidate; capture one with `akrctx judge snapshot`.");
  }
  const included = [...new Set(options.includedTaskIds ?? [])].sort();
  let snapshot: Awaited<ReturnType<typeof loadJudgeSnapshot>>;
  try {
    // Throws for a different task or a different --include-task scope: the declaration never
    // grants capture scope, so the explicit authorization must still match the snapshot.
    await createJudgeScope(cwd, taskId, options.base, options.candidate, included);
    snapshot = await loadJudgeSnapshot(cwd, options.candidate);
  } catch (error) {
    return fail(`Cannot use the snapshot: ${error instanceof Error ? error.message : String(error)}`);
  }
  const baseCommit = await gitText(cwd, ["rev-parse", "--verify", `${options.base}^{commit}`]).catch(() => "");
  if (!baseCommit || baseCommit !== snapshot.scope.baseCommit) {
    return fail(`--base ${options.base} does not resolve to the snapshot base ${snapshot.scope.baseCommit}.`);
  }
  result.baseCommit = baseCommit;

  const foreign = snapshot.scope.changedFiles.filter((file) => {
    const match = /^\.akrctx\/tasks\/(TASK-[0-9]+)-[^/]+(?:\/|$)/.exec(file);
    return match && match[1] !== taskId && !included.includes(match[1]);
  });
  if (foreign.length > 0) {
    return fail(`The boundary contains foreign task capsule paths without --include-task: ${foreign.join(", ")}.`);
  }

  const read = await readMigrationDeclaration(
    path.join(snapshot.worktreePath, ".akrctx", "tasks", await taskDirectory(snapshot.worktreePath, taskId)),
    await readBlockedPatterns(cwd),
  ).catch((error) => refused(String(error instanceof Error ? error.message : error)));
  if (!read.declaration) {
    result.reasons.push(...read.problems);
    return result;
  }
  const { generator, paths } = read.declaration;
  result.paths = paths;
  for (const declared of paths) {
    const ancestor = await symlinkAncestor(snapshot.worktreePath, declared);
    if (ancestor) result.reasons.push(`paths entry ${declared} has a symlink ancestor: ${ancestor}.`);
  }
  if (result.reasons.length > 0) return result;

  const provenance = await checkGeneratorProvenance(cwd, generator, baseCommit);
  if (provenance.length > 0) {
    result.reasons.push(...provenance.map((reason) => `Generator provenance: ${reason}`));
    return result;
  }
  result.nonGeneratedChanges = snapshot.scope.changedFiles.filter((file) => !paths.includes(file));

  const toolParent = await mkdtemp(path.join(os.tmpdir(), "akrctx-generator-tool-"));
  const reproductionParent = await mkdtemp(path.join(os.tmpdir(), "akrctx-reproduction-"));
  try {
    const toolRoot = path.join(await realpath(toolParent), "tool");
    await mkdir(toolRoot);
    for (const input of generator.inputs) {
      const blob = await blobAt(cwd, baseCommit, input);
      if (!blob) return fail(`Generator input ${input} is not a regular file in the mechanical base.`);
      const target = path.join(toolRoot, input);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, blob.bytes, { mode: blob.executable ? 0o755 : 0o644 });
    }
    const install = await planDependencyInstall(toolRoot);
    const commands = [...(install ? [install] : []), ...generator.prepare, generator.command];
    result.commands = commands;
    result.generatorRoot = toolRoot;
    const approved = await options.approve?.([...commands], { generatorRoot: toolRoot });
    if (!approved) {
      return fail(`Operator approval was not given for the declared commands: ${commands.join(", ")}.`);
    }
    const env = { ...process.env, AKRCTX_GENERATOR_ROOT: toolRoot };
    const run = async (command: string, runCwd: string): Promise<boolean> => {
      try {
        await execAsync(command, { cwd: runCwd, env, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER });
        return true;
      } catch (error) {
        const evidence = captureValidationError(command, error);
        result.reasons.push(
          `\`${sanitizeValidationCommand(command)}\` failed (exit code ${evidence.exitCode ?? "unknown"}): ${evidence.output}`,
        );
        return false;
      }
    };
    for (const command of [...(install ? [install] : []), ...generator.prepare]) {
      if (!(await run(command, toolRoot))) return result;
    }

    const worktree = path.join(await realpath(reproductionParent), "worktree");
    await mkdir(worktree);
    await execFileAsync("sh", ["-c", 'git archive "$1" | tar -x -C "$2"', "sh", baseCommit, worktree], { cwd });
    const missing = await archiveMismatch(cwd, baseCommit, worktree);
    if (missing.length > 0) {
      return fail(`The reproduction worktree differs from the base: ${missing.join(", ")}.`);
    }
    for (const declared of paths) {
      const ancestor = await symlinkAncestor(worktree, declared);
      if (ancestor) return fail(`paths entry ${declared} has a symlink ancestor in the base: ${ancestor}.`);
    }
    const before = await walk(worktree);
    const baseStates = new Map<string, PathState>();
    for (const declared of paths) baseStates.set(declared, await stateOf(worktree, declared));

    if (!(await run(generator.command, worktree))) return result;

    const after = await walk(worktree);
    // The root is exempt only when a declared path sits directly in it, or when a declared
    // path's top-level entry was legitimately created or removed.
    const allowedDirectories = new Set<string>();
    for (const declared of paths) {
      let dir = path.posix.dirname(declared);
      for (; dir !== "."; dir = path.posix.dirname(dir)) allowedDirectories.add(dir);
      const top = declared.split("/")[0];
      if (!declared.includes("/") || before.has(top) !== after.has(top)) allowedDirectories.add(".");
    }
    const touched = new Set<string>();
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const previous = before.get(key);
      const next = after.get(key);
      if (previous && next && previous.content === next.content && previous.ctime === next.ctime) continue;
      touched.add(key);
    }
    result.unexpectedWrites = [...touched].filter((key) => !paths.includes(key) && !allowedDirectories.has(key)).sort();
    for (const declared of paths) {
      const reproduced = await stateOf(worktree, declared);
      const candidate = await stateOf(snapshot.worktreePath, declared);
      const original = baseStates.get(declared) ?? ABSENT;
      const differences = describeDifference(reproduced, candidate);
      if (differences.length > 0) {
        result.differing.push(declared);
        result.reasons.push(`Generated path ${declared} does not match the candidate (${differences.join(", ")}).`);
      } else if (sameState(original, reproduced)) {
        result.differing.push(declared);
        result.reasons.push(
          `Declared path ${declared} has no change: the base, the candidate and the reproduction are identical.`,
        );
      } else {
        result.reproduced.push(declared);
      }
    }
    if (result.unexpectedWrites.length > 0) {
      result.reasons.push(`The generator wrote outside the declared paths: ${result.unexpectedWrites.join(", ")}.`);
    }
    try {
      await loadJudgeSnapshot(cwd, options.candidate);
    } catch (error) {
      result.reasons.push(`The canonical snapshot changed during reproduction: ${error}`);
    }
    result.ok = result.reasons.length === 0;
    return result;
  } catch (error) {
    return fail(`Reproduction could not complete: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await rm(toolParent, { recursive: true, force: true });
    await rm(reproductionParent, { recursive: true, force: true });
  }
}

async function taskDirectory(root: string, taskId: string): Promise<string> {
  const entries = await readdir(path.join(root, ".akrctx", "tasks"), { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isDirectory() && (entry.name === taskId || entry.name.startsWith(`${taskId}-`)))
    .map((entry) => entry.name);
  if (matches.length !== 1)
    throw new Error(`Expected exactly one task capsule for ${taskId}; found ${matches.length}.`);
  return matches[0];
}

/** Names base files that the archive did not produce, such as paths hidden by export-ignore. */
async function archiveMismatch(cwd: string, baseCommit: string, worktree: string): Promise<string[]> {
  const listed = (await gitBuffer(cwd, ["ls-tree", "-r", "-z", "--full-tree", baseCommit]))
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((line) => ({ mode: line.split(" ")[0], file: line.slice(line.indexOf("\t") + 1) }))
    .filter((entry) => entry.mode !== "160000");
  const missing: string[] = [];
  for (const entry of listed) {
    if (!(await lstat(path.join(worktree, entry.file)).catch(() => undefined))) missing.push(entry.file);
  }
  return missing;
}
