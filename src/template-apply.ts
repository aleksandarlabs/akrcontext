import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeConfig, readConfigStrict, writeConfig } from "./config.js";
import { ensureTrailingNewline, pathExists, suggestedPathFor, writePlannedFile } from "./fs-utils.js";
import { readManifest, templateHash, writeManifest } from "./manifest.js";
import { type TemplatePack, loadBundledTemplatePack, loadTemplatePack, mergeTemplateJson } from "./template-pack.js";
import { defaultPolicy } from "./templates.js";
import type { AppliedTemplatePack, CommandOptions, Target, WriteResult, akrctxConfig, akrctxPolicy } from "./types.js";
import { CLI_VERSION } from "./version.js";

export interface TemplateApplyOptions extends CommandOptions {
  templateRef: string;
  local?: boolean;
}

export interface TemplateApplyResult {
  name: string;
  version: string;
  source: AppliedTemplatePack["source"];
  target: Target;
  dryRun: boolean;
  completed: boolean;
  writes: WriteResult[];
  conflicts: string[];
  pendingMerges: string[];
  policyWarnings: string[];
}

export interface TemplateStatusResult {
  installed: boolean;
  templates: AppliedTemplatePack[];
}

interface PlannedPackFile {
  path: string;
  content: string;
  kind: "root" | "wiki" | "target";
}

export async function runTemplateApply(options: TemplateApplyOptions): Promise<TemplateApplyResult> {
  const cwd = options.cwd ?? process.cwd();
  if (options.force)
    throw new Error("templates apply does not support --force; resolve generated candidates explicitly.");
  const config = await readConfigStrict(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  const manifest = await readManifest(cwd);
  if (!manifest) throw new Error("A valid .akrctx/manifest.json is required. Run `akrctx upgrade` first.");
  const target = resolveTemplateTarget(config, options.target);
  const source: AppliedTemplatePack["source"] = options.local ? "local" : "bundled";
  const pack = options.local
    ? await loadTemplatePack(cwd, options.templateRef, target)
    : await loadBundledTemplatePack(options.templateRef, target);
  const policy = await readPolicyStrict(cwd);
  const plannedFiles = packFiles(pack, target);
  const preflight = await preflightFiles(cwd, pack, plannedFiles, options);

  if (preflight.conflicts.length > 0) {
    return resultFor(pack, source, target, options, preflight.writes, preflight.conflicts, preflight.pendingMerges, []);
  }

  const writes = [...preflight.writes];
  for (const planned of plannedFiles) {
    if (await pathExists(path.join(cwd, planned.path))) continue;
    writes.push(
      await writePlannedFile(cwd, planned.path, planned.content, {
        dryRun: options.dryRun,
        reason: `${pack.name} template ${planned.kind} file.`,
      }),
    );
  }

  const nextPolicy = mergeTemplateJson(policy, pack.policy);
  const policyWarnings = describePolicyWeakening(defaultPolicy(config.profile ?? "default"), nextPolicy);
  writes.push(
    await writeJsonIfChanged(cwd, ".akrctx/policy.json", nextPolicy, options, `${pack.name} template policy.`),
  );

  const mergedConfig = normalizeConfig(mergeTemplateJson(config, pack.config));
  mergedConfig.targets = config.targets;
  mergedConfig.installedVersion = config.installedVersion;
  mergedConfig.sourceOfTruth = ".akrctx";
  mergedConfig.createdBy = "akrctx";
  mergedConfig.templatePacks = upsertAppliedTemplate(config.templatePacks, {
    name: pack.name,
    version: pack.version,
    source,
    targets: [target],
    fileHashes: Object.fromEntries(
      plannedFiles
        .filter((planned) => planned.kind === "target")
        .map((planned) => [planned.path, templateHash(planned.content)]),
    ),
  });
  writes.push(
    await writeJsonIfChanged(cwd, ".akrctx/config.json", mergedConfig, options, `${pack.name} template config.`),
  );
  const nextManifest = { ...manifest, cliVersion: CLI_VERSION, files: { ...manifest.files } };
  for (const planned of plannedFiles.filter((file) => file.kind === "target")) {
    nextManifest.files[planned.path] = { hash: templateHash(planned.content) };
  }
  writes.push(await writeManifest(cwd, nextManifest, Boolean(options.dryRun)));

  return resultFor(pack, source, target, options, writes, [], preflight.pendingMerges, policyWarnings);
}

export async function runTemplateStatus(options: CommandOptions): Promise<TemplateStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfigStrict(cwd);
  return { installed: Boolean(config), templates: config?.templatePacks ?? [] };
}

function resolveTemplateTarget(config: akrctxConfig, requested: CommandOptions["target"]): Target {
  if (requested === "all") {
    throw new Error("Template packs are target-relative. Apply once per target instead of using --target all.");
  }
  if (requested) {
    if (!config.targets.includes(requested)) {
      throw new Error(`Target ${requested} is not installed. Installed targets: ${config.targets.join(", ")}.`);
    }
    return requested;
  }
  if (config.targets.length === 1) return config.targets[0];
  throw new Error(`Multiple targets are installed (${config.targets.join(", ")}). Pass --target <target>.`);
}

function packFiles(pack: TemplatePack, target: Target): PlannedPackFile[] {
  const files: PlannedPackFile[] = [];
  if (pack.rootInstructions !== undefined) {
    files.push({ path: rootInstructionPath(target), content: pack.rootInstructions, kind: "root" });
  }
  for (const [name, content] of Object.entries(pack.wikiFiles)) {
    files.push({ path: path.posix.join(".akrctx/wiki", name), content, kind: "wiki" });
  }
  for (const [relativePath, content] of Object.entries(pack.targetFiles)) {
    files.push({ path: relativePath, content, kind: "target" });
  }
  return files;
}

async function preflightFiles(
  cwd: string,
  pack: TemplatePack,
  files: PlannedPackFile[],
  options: CommandOptions,
): Promise<{ writes: WriteResult[]; conflicts: string[]; pendingMerges: string[] }> {
  const writes: WriteResult[] = [];
  const conflicts: string[] = [];
  const pendingMerges: string[] = [];
  for (const planned of files) {
    const absolute = path.join(cwd, planned.path);
    if (!(await pathExists(absolute))) continue;
    const current = await readFile(absolute, "utf8");
    if (ensureTrailingNewline(current) === ensureTrailingNewline(planned.content)) {
      writes.push({ kind: "preserve", path: planned.path, reason: `${pack.name} template content is current.` });
      continue;
    }

    writes.push({ kind: "preserve", path: planned.path, reason: "Existing project content preserved." });
    if (planned.kind === "root") {
      const suggestedPath = suggestedPathFor(planned.path);
      const existingSuggestion = await readFile(path.join(cwd, suggestedPath), "utf8").catch(() => undefined);
      if (
        existingSuggestion !== undefined &&
        ensureTrailingNewline(existingSuggestion) !== ensureTrailingNewline(planned.content)
      ) {
        conflicts.push(planned.path);
        const candidatePath = path.posix.join(".akrctx/template-candidates", pack.name, pack.version, planned.path);
        const candidateWrite = await writePlannedFile(cwd, candidatePath, planned.content, {
          dryRun: options.dryRun,
          reason: `Resolve the existing ${suggestedPath}, then rerun to prepare this root merge.`,
        });
        writes.push({
          kind: candidateWrite.kind === "create" ? "suggest" : "preserve",
          path: candidatePath,
          reason: `A different root suggestion already exists at ${suggestedPath}.`,
        });
        continue;
      }
      pendingMerges.push(planned.path);
      writes.push(
        await writePlannedFile(cwd, planned.path, planned.content, {
          dryRun: options.dryRun,
          protected: true,
          reason: `Review and merge the ${pack.name} root instruction candidate.`,
        }),
      );
      continue;
    }

    conflicts.push(planned.path);

    const candidatePath = path.posix.join(".akrctx/template-candidates", pack.name, pack.version, planned.path);
    const candidateWrite = await writePlannedFile(cwd, candidatePath, planned.content, {
      dryRun: options.dryRun,
      reason: `Review and merge into ${planned.path}.`,
    });
    writes.push({
      kind: candidateWrite.kind === "create" ? "suggest" : "preserve",
      path: candidatePath,
      reason:
        candidateWrite.kind === "create"
          ? `Review and merge into ${planned.path}.`
          : `Candidate already exists; preserved for review before merging into ${planned.path}.`,
    });
  }
  return { writes, conflicts, pendingMerges };
}

function rootInstructionPath(target: Target): string {
  if (target === "codex") return "AGENTS.md";
  if (target === "claude") return "CLAUDE.md";
  if (target === "copilot") return ".github/copilot-instructions.md";
  return ".pi/README.md";
}

function upsertAppliedTemplate(current: AppliedTemplatePack[], applied: AppliedTemplatePack): AppliedTemplatePack[] {
  const existing = current.find(
    (entry) => entry.name === applied.name && entry.version === applied.version && entry.source === applied.source,
  );
  const targets = Array.from(new Set([...(existing?.targets ?? []), ...applied.targets]));
  const fileHashes = { ...(existing?.fileHashes ?? {}), ...applied.fileHashes };
  return [
    ...current.filter(
      (entry) => !(entry.name === applied.name && entry.version === applied.version && entry.source === applied.source),
    ),
    { ...applied, targets, fileHashes },
  ].sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

async function readPolicyStrict(cwd: string): Promise<akrctxPolicy> {
  const absolute = path.join(cwd, ".akrctx/policy.json");
  if (!(await pathExists(absolute)))
    throw new Error(".akrctx/policy.json is missing. Run `akrctx doctor --fix` first.");
  try {
    const value = JSON.parse(await readFile(absolute, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid policy shape");
    return value as akrctxPolicy;
  } catch {
    throw new Error(".akrctx/policy.json is invalid JSON. Repair it before applying a template.");
  }
}

async function writeJsonIfChanged(
  cwd: string,
  relativePath: string,
  value: unknown,
  options: CommandOptions,
  reason: string,
): Promise<WriteResult> {
  const absolute = path.join(cwd, relativePath);
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const current = await readFile(absolute, "utf8").catch(() => undefined);
  if (current === next) return { kind: "preserve", path: relativePath, reason: "Template values already present." };
  if (!options.dryRun) {
    if (relativePath === ".akrctx/config.json") await writeConfig(cwd, value as akrctxConfig);
    else await writePlannedFile(cwd, relativePath, next, { force: true, reason });
  }
  return { kind: current === undefined ? "create" : "update", path: relativePath, reason };
}

function describePolicyWeakening(defaults: akrctxPolicy, merged: akrctxPolicy): string[] {
  const warnings: string[] = [];
  if (merged.mergeStrategy !== defaults.mergeStrategy) {
    warnings.push(`Template changed mergeStrategy to ${String(merged.mergeStrategy)}.`);
  }
  for (const key of Object.keys(defaults.enforcement) as Array<keyof akrctxPolicy["enforcement"]>) {
    if (defaults.enforcement[key] && merged.enforcement?.[key] === false) {
      warnings.push(`Template disabled enforcement.${key}.`);
    }
  }
  if (
    merged.protectedFileMerge?.agentMayEdit !== defaults.protectedFileMerge.agentMayEdit ||
    merged.protectedFileMerge?.approvalScope !== defaults.protectedFileMerge.approvalScope ||
    merged.protectedFileMerge?.requireDiffPreview !== true
  ) {
    warnings.push("Template weakened the protected-file human-approval contract.");
  }
  return warnings;
}

function resultFor(
  pack: TemplatePack,
  source: AppliedTemplatePack["source"],
  target: Target,
  options: CommandOptions,
  writes: WriteResult[],
  conflicts: string[],
  pendingMerges: string[],
  policyWarnings: string[],
): TemplateApplyResult {
  return {
    name: pack.name,
    version: pack.version,
    source,
    target,
    dryRun: Boolean(options.dryRun),
    completed: conflicts.length === 0,
    writes,
    conflicts,
    pendingMerges,
    policyWarnings,
  };
}
