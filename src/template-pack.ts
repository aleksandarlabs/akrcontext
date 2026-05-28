import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectory, pathExists } from "./fs-utils.js";
import type { Target } from "./types.js";

export interface TemplatePack {
  name: string;
  version: string;
  config?: unknown;
  policy?: unknown;
  wikiFiles: Record<string, string>;
  rootInstructions?: string;
  targetFiles: Record<string, string>;
}

export interface TemplatePackSummary {
  name: string;
  version: string;
}

interface PackManifest {
  name?: unknown;
  version?: unknown;
  akrctxPackVersion?: unknown;
}

export async function loadTemplatePack(cwd: string, templatePackPath: string, target: Target): Promise<TemplatePack> {
  const packRoot = path.resolve(cwd, templatePackPath);
  return loadTemplatePackRoot(packRoot, templatePackPath, target);
}

export async function loadBundledTemplatePack(templateName: string, target: Target): Promise<TemplatePack> {
  if (!/^[a-zA-Z0-9._-]+$/.test(templateName)) {
    throw new Error(`Invalid template name: ${templateName}`);
  }

  const packRoot = path.join(bundledTemplatesRoot(), templateName);
  return loadTemplatePackRoot(packRoot, templateName, target);
}

export async function listBundledTemplatePacks(): Promise<TemplatePackSummary[]> {
  const templatesRoot = bundledTemplatesRoot();
  if (!(await isDirectory(templatesRoot))) return [];

  const entries = await readdir(templatesRoot, { withFileTypes: true });
  const summaries: TemplatePackSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      summaries.push(await readManifest(path.join(templatesRoot, entry.name)));
    } catch {
      // Ignore directories that are not valid template packs.
    }
  }

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadTemplatePackRoot(packRoot: string, label: string, target: Target): Promise<TemplatePack> {
  if (!(await isDirectory(packRoot))) {
    throw new Error(`Template pack not found or not a directory: ${label}`);
  }

  const manifest = await readManifest(packRoot);
  await assertNoUnsupportedRootDirs(packRoot);

  return {
    name: manifest.name,
    version: manifest.version,
    config: await readJsonIfExists(path.join(packRoot, "config.json"), "config.json"),
    policy: await readJsonIfExists(path.join(packRoot, "policy.json"), "policy.json"),
    wikiFiles: await readMarkdownFiles(path.join(packRoot, "wiki")),
    ...(await readRootInstructions(packRoot)),
    targetFiles: await readTargetFiles(path.join(packRoot, "target"), target),
  };
}

function bundledTemplatesRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");
}

export function mergeTemplateJson<T>(base: T, override: unknown): T {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  return deepMerge(base, override) as T;
}

async function readManifest(packRoot: string): Promise<{ name: string; version: string }> {
  const manifestPath = path.join(packRoot, "akrctx-pack.json");
  if (!(await pathExists(manifestPath))) {
    throw new Error("Invalid template pack: missing akrctx-pack.json.");
  }

  const manifest = (await readJsonIfExists(manifestPath, "akrctx-pack.json")) as PackManifest | undefined;
  if (!manifest || manifest.akrctxPackVersion !== 1) {
    throw new Error("Invalid template pack: akrctx-pack.json must set akrctxPackVersion to 1.");
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    throw new Error("Invalid template pack: akrctx-pack.json must include a non-empty name.");
  }
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error("Invalid template pack: akrctx-pack.json must include a non-empty version.");
  }

  return { name: manifest.name.trim(), version: manifest.version.trim() };
}

async function readJsonIfExists(filePath: string, label: string): Promise<unknown | undefined> {
  if (!(await pathExists(filePath))) return undefined;
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    throw new Error(`Invalid template pack: ${label} is not valid JSON.`);
  }
}

async function assertNoUnsupportedRootDirs(packRoot: string): Promise<void> {
  for (const dirname of ["skills", "prompts", "instructions", "targets"]) {
    if (await pathExists(path.join(packRoot, dirname))) {
      throw new Error(
        `Invalid template pack: root-level ${dirname}/ is not supported. Move target files under target/.`,
      );
    }
  }
}

async function readMarkdownFiles(directoryPath: string): Promise<Record<string, string>> {
  if (!(await isDirectory(directoryPath))) return {};
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    files[entry.name] = await readFile(path.join(directoryPath, entry.name), "utf8");
  }

  return files;
}

async function readRootInstructions(packRoot: string): Promise<Pick<TemplatePack, "rootInstructions">> {
  const rootInstructionsPath = path.join(packRoot, "target", "root-instructions.md");
  if (!(await pathExists(rootInstructionsPath))) return {};
  return { rootInstructions: await readFile(rootInstructionsPath, "utf8") };
}

async function readTargetFiles(targetRoot: string, target: Target): Promise<Record<string, string>> {
  if (!(await isDirectory(targetRoot))) return {};

  const files: Record<string, string> = {};
  Object.assign(files, await readSkillFiles(path.join(targetRoot, "skills"), skillDestinationRoot(target)));
  Object.assign(files, await readPromptFiles(path.join(targetRoot, "prompts"), promptDestinationRoot(target)));
  Object.assign(
    files,
    await readInstructionFiles(path.join(targetRoot, "instructions"), instructionDestinationRoot(target)),
  );

  return files;
}

async function readSkillFiles(sourceRoot: string, destinationRoot: string): Promise<Record<string, string>> {
  if (!(await isDirectory(sourceRoot))) return {};
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const files: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(sourceRoot, entry.name, "SKILL.md");
    if (!(await pathExists(skillPath))) {
      throw new Error(`Invalid template pack: target/skills/${entry.name}/SKILL.md is required.`);
    }
    files[path.posix.join(destinationRoot, entry.name, "SKILL.md")] = await readFile(skillPath, "utf8");
  }

  return files;
}

async function readPromptFiles(
  sourceRoot: string,
  destinationRoot: string | undefined,
): Promise<Record<string, string>> {
  if (!(await isDirectory(sourceRoot))) return {};
  if (!destinationRoot) {
    throw new Error("Invalid template pack: target/prompts/ is not supported for this target.");
  }

  return readMarkdownFilesInto(sourceRoot, destinationRoot);
}

async function readInstructionFiles(
  sourceRoot: string,
  destinationRoot: string | undefined,
): Promise<Record<string, string>> {
  if (!(await isDirectory(sourceRoot))) return {};
  if (!destinationRoot) {
    throw new Error("Invalid template pack: target/instructions/ is not supported for this target.");
  }

  return readMarkdownFilesInto(sourceRoot, destinationRoot);
}

async function readMarkdownFilesInto(sourceRoot: string, destinationRoot: string): Promise<Record<string, string>> {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const files: Record<string, string> = {};

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    files[path.posix.join(destinationRoot, entry.name)] = await readFile(path.join(sourceRoot, entry.name), "utf8");
  }

  return files;
}

function skillDestinationRoot(target: Target): string {
  const roots: Record<Target, string> = {
    codex: ".agents/skills",
    claude: ".claude/skills",
    copilot: ".github/skills",
    pi: ".pi/skills",
  };
  return roots[target];
}

function promptDestinationRoot(target: Target): string | undefined {
  const roots: Partial<Record<Target, string>> = {
    claude: ".claude/commands",
    copilot: ".github/prompts",
    pi: ".pi/prompts",
  };
  return roots[target];
}

function instructionDestinationRoot(target: Target): string | undefined {
  const roots: Partial<Record<Target, string>> = {
    copilot: ".github/instructions",
  };
  return roots[target];
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(override)) {
    if (base.every((item) => typeof item === "string") && override.every((item) => typeof item === "string")) {
      return Array.from(new Set([...base, ...override]));
    }
    return override;
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      merged[key] = key in merged ? deepMerge(merged[key], value) : value;
    }
    return merged;
  }

  return override;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
