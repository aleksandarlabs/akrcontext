import { readFile } from "node:fs/promises";
import path from "node:path";
import select from "@inquirer/select";
import { normalizeConfig, readConfig } from "./config.js";
import { detectTargets } from "./detect.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import { createManifestFromWrites, templateHash } from "./manifest.js";
import { type TemplatePack, loadBundledTemplatePack, loadTemplatePack, mergeTemplateJson } from "./template-pack.js";
import {
  claudeCommands,
  claudeSkills,
  codexSkills,
  comprehensionFiles,
  copilotFiles,
  copilotSkills,
  defaultConfig,
  defaultPolicy,
  judgeContractFiles,
  localComprehensionIgnoreTemplate,
  mainInstructionTemplate,
  overviewTemplate,
  piFiles,
  piSkills,
  targetReferenceTemplates,
  taskTemplateFiles,
  wikiTemplates,
} from "./templates.js";
import type { CommandOptions, InitResult, Target, TargetOption, WriteResult } from "./types.js";
import { targets } from "./types.js";
import { CLI_VERSION } from "./version.js";

export async function runInit(options: CommandOptions): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const profile = options.profile ?? "default";
  const detection = await detectTargets(cwd);
  const { target, selectedTargets } = await resolveTarget(options, detection.detected);
  if (options.template && options.templatePack) {
    throw new Error("Use either --template or --template-pack, not both.");
  }
  if ((options.template || options.templatePack) && selectedTargets.length !== 1) {
    throw new Error("Templates require a single --target. They cannot be used with --target all.");
  }
  const templatePack = options.templatePack
    ? await loadTemplatePack(cwd, options.templatePack, selectedTargets[0])
    : options.template
      ? await loadBundledTemplatePack(options.template, selectedTargets[0])
      : undefined;
  const writes: WriteResult[] = [];

  const writeFile = (relativePath: string, content: string, protectedFile = false, reason?: string) =>
    writePlannedFile(cwd, relativePath, String(content), {
      dryRun: options.dryRun,
      force: options.force,
      protected: protectedFile,
      reason,
    });

  // Neutral foundation files (sequential — config before wiki for logical order in output).
  //
  // A repeat install adds its target to the existing configuration rather than rebuilding
  // one from defaults. Assigning the selection used to leave a second `init` writing the new
  // target's files while `config.targets` never learned about it, so `doctor` reported the
  // target as installed and every agent command reported it as absent.
  const existing = await readExistingConfig(cwd);
  const config = existing
    ? { ...existing, targets: mergeTargets(existing.targets, selectedTargets) }
    : normalizeConfig(mergeTemplateJson(defaultConfig(selectedTargets, profile), templatePack?.config));
  config.installedVersion = CLI_VERSION;
  // `defaults.target` answers which target a command assumes when none is given. A second
  // install adds a target; it does not restate that preference.
  if (!existing) config.defaults.target = selectedTargets[0];
  if (templatePack) {
    config.templatePacks = [
      {
        name: templatePack.name,
        version: templatePack.version,
        source: options.templatePack ? "local" : "bundled",
        targets: selectedTargets,
        fileHashes: Object.fromEntries(
          Object.entries(templatePack.targetFiles).map(([relativePath, content]) => [
            relativePath,
            templateHash(content),
          ]),
        ),
      },
    ];
  }
  writes.push(
    await writePlannedFile(cwd, ".akrctx/config.json", JSON.stringify(config, null, 2), {
      dryRun: options.dryRun,
      // Forced only when the existing config could be read and merged into. An unreadable
      // one is left exactly where it is for `akrctx doctor` to report, because overwriting
      // it with defaults would destroy a file the user can still recover.
      force: options.force || Boolean(existing),
      reason: "akrctx config.",
    }),
  );
  const policy = mergeTemplateJson(defaultPolicy(profile), templatePack?.policy);
  policy.profile = profile;
  writes.push(
    await writeFile(".akrctx/policy.json", JSON.stringify(policy, null, 2), false, "akrctx security and merge policy."),
  );
  writes.push(
    await writeFile(
      ".akrctx/local/.gitignore",
      localComprehensionIgnoreTemplate,
      false,
      "Keep personal akrctx comprehension records local.",
    ),
  );
  const policyWarnings = describePolicyWeakening(defaultPolicy(profile), policy);

  const projectName = await readProjectName(cwd);

  // Wiki, task templates, and target references are independent — write in parallel.
  const wikiFiles = {
    ...wikiTemplates,
    ...Object.fromEntries(
      Object.entries(templatePack?.wikiFiles ?? {}).map(([name, content]) => [`wiki/${name}`, content]),
    ),
  };

  const [overviewResult, wikiResults, taskResults, targetResults] = await Promise.all([
    writeFile(
      ".akrctx/wiki/overview.md",
      overviewTemplate(projectName, selectedTargets, CLI_VERSION),
      false,
      "akrctx wiki file.",
    ),
    Promise.all(
      Object.entries(wikiFiles).map(([relativePath, content]) =>
        writeFile(path.posix.join(".akrctx", relativePath), content, false, "akrctx wiki file."),
      ),
    ),
    Promise.all(
      Object.entries(taskTemplateFiles).map(([relativePath, content]) =>
        writeFile(path.posix.join(".akrctx", relativePath), content, false, "akrctx task template."),
      ),
    ),
    Promise.all(
      selectedTargets.map((targetName) =>
        writeFile(
          `.akrctx/targets/${targetName}.md`,
          targetReferenceTemplates[targetName],
          false,
          "akrctx target reference.",
        ),
      ),
    ),
  ]);
  writes.push(overviewResult, ...wikiResults, ...taskResults, ...targetResults);
  const comprehensionResults = await Promise.all(
    Object.entries(comprehensionFiles).map(([relativePath, content]) =>
      writeFile(relativePath, content, false, "akrctx comprehension contract."),
    ),
  );
  writes.push(...comprehensionResults);
  const judgeContractResults = await Promise.all(
    Object.entries(judgeContractFiles).map(([relativePath, content]) =>
      writeFile(relativePath, content, false, "akrctx judge enforcement contract."),
    ),
  );
  writes.push(...judgeContractResults);

  // Target-specific harness files.
  for (const targetName of selectedTargets) {
    const targetWrites = await installTarget(cwd, targetName, options, templatePack);
    writes.push(...targetWrites);
  }

  for (const [relativePath, content] of Object.entries(templatePack?.targetFiles ?? {})) {
    writes.push(await writeFile(relativePath, content, false, "akrctx template pack target file."));
  }

  writes.push(await createManifestFromWrites(cwd, writes, CLI_VERSION, Boolean(options.dryRun)));

  return {
    target,
    selectedTargets,
    detection,
    writes,
    conflicts: writes.filter((write) => write.kind === "suggest").map((write) => write.path),
    policyWarnings,
  };
}

/**
 * Compare the merged policy (after a template pack applies) against the
 * profile's default policy and surface — but never block on — any
 * enforcement weakening the pack introduced. Some enterprise packs may
 * relax enforcement on purpose; this just makes that visible.
 */
function describePolicyWeakening(
  defaults: import("./types.js").akrctxPolicy,
  merged: import("./types.js").akrctxPolicy,
): string[] {
  const warnings: string[] = [];

  if (merged.mergeStrategy !== defaults.mergeStrategy) {
    warnings.push(
      `Template pack changed mergeStrategy to "${merged.mergeStrategy}" (default: "${defaults.mergeStrategy}").`,
    );
  }

  if (
    merged.protectedFileMerge?.agentMayEdit !== defaults.protectedFileMerge.agentMayEdit ||
    merged.protectedFileMerge?.approvalScope !== defaults.protectedFileMerge.approvalScope ||
    merged.protectedFileMerge?.requireDiffPreview !== defaults.protectedFileMerge.requireDiffPreview
  ) {
    warnings.push("Template pack weakened the protected-file human-approval contract.");
  }

  for (const key of Object.keys(defaults.enforcement) as Array<keyof typeof defaults.enforcement>) {
    if (defaults.enforcement[key] === true && merged.enforcement[key] === false) {
      warnings.push(`Template pack disabled enforcement.${key} (default: true).`);
    }
  }

  return warnings;
}

async function resolveTarget(
  options: CommandOptions,
  detected: Target[],
): Promise<{ target: TargetOption; selectedTargets: Target[] }> {
  if (options.target) {
    return {
      target: options.target,
      selectedTargets: options.target === "all" ? [...targets] : [options.target],
    };
  }

  if (detected.length === 1) {
    return { target: detected[0], selectedTargets: [detected[0]] };
  }

  const canPrompt = !options.nonInteractive && process.stdin.isTTY && process.stdout.isTTY;
  if (canPrompt) {
    const answer = await select<TargetOption>({
      message:
        detected.length > 1
          ? `Multiple agent setups detected (${detected.join(", ")}). Which target should akrctx install?`
          : "No agentic structure detected. Which agent will this project use?",
      choices: [
        { name: "Codex", value: "codex" },
        { name: "Claude Code", value: "claude" },
        { name: "GitHub Copilot", value: "copilot" },
        { name: "Pi", value: "pi" },
        { name: "All", value: "all" },
      ],
    });
    return { target: answer, selectedTargets: answer === "all" ? [...targets] : [answer] };
  }

  if (detected.length > 1) {
    throw new Error(
      `Multiple agent setups detected (${detected.join(", ")}) and no --target given. Pass --target <codex|claude|copilot|pi|all>.`,
    );
  }

  throw new Error("No agent setup detected and no --target given. Pass --target <codex|claude|copilot|pi|all>.");
}

async function installTarget(
  cwd: string,
  target: Target,
  options: CommandOptions,
  templatePack?: TemplatePack,
): Promise<WriteResult[]> {
  const writes: WriteResult[] = [];
  const writeFile = async (relativePath: string, content: string, protectedFile = false, reason?: string) => {
    if (protectedFile && options.repair && (await pathExists(path.join(cwd, relativePath)))) {
      return {
        kind: "preserve" as const,
        path: relativePath,
        reason: "Existing protected instruction preserved during Doctor repair.",
      };
    }
    return writePlannedFile(cwd, relativePath, String(content), {
      dryRun: options.dryRun,
      force: options.force,
      protected: protectedFile,
      reason,
    });
  };

  if (target === "codex") {
    const [main, ...skills] = await Promise.all([
      writeFile(
        "AGENTS.md",
        templatePack?.rootInstructions ?? mainInstructionTemplate("codex"),
        true,
        "Existing AGENTS.md preserved; wrote suggested Codex harness.",
      ),
      ...Object.entries(codexSkills).map(([relativePath, content]) =>
        writeFile(relativePath, content, false, "Codex akrctx skill."),
      ),
    ]);
    writes.push(main, ...skills);
    return writes;
  }

  if (target === "claude") {
    const [main, ...rest] = await Promise.all([
      writeFile(
        "CLAUDE.md",
        templatePack?.rootInstructions ?? mainInstructionTemplate("claude"),
        true,
        "Existing CLAUDE.md preserved; wrote suggested Claude harness.",
      ),
      ...Object.entries(claudeCommands).map(([relativePath, content]) =>
        writeFile(relativePath, content, false, "Claude akrctx command."),
      ),
      ...Object.entries(claudeSkills).map(([relativePath, content]) =>
        writeFile(relativePath, content, false, "Claude akrctx skill."),
      ),
    ]);
    writes.push(main, ...rest);
    return writes;
  }

  if (target === "copilot") {
    const [main, ...rest] = await Promise.all([
      writeFile(
        ".github/copilot-instructions.md",
        templatePack?.rootInstructions ?? mainInstructionTemplate("copilot"),
        true,
        "Existing Copilot instructions preserved; wrote suggested harness.",
      ),
      ...Object.entries(copilotFiles).map(([relativePath, content]) =>
        writeFile(relativePath, content, false, "Copilot akrctx prompt or instruction."),
      ),
      ...Object.entries(copilotSkills).map(([relativePath, content]) =>
        writeFile(relativePath, content, false, "Copilot akrctx skill."),
      ),
    ]);
    writes.push(main, ...rest);
    return writes;
  }

  // pi
  if (templatePack?.rootInstructions) {
    writes.push(
      await writeFile(
        ".pi/README.md",
        templatePack.rootInstructions,
        true,
        "Existing Pi README preserved; wrote suggested template instructions.",
      ),
    );
  }

  const piResults = await Promise.all([
    ...Object.entries(piFiles).map(([relativePath, content]) =>
      writeFile(relativePath, content, false, "Pi akrctx prompt."),
    ),
    ...Object.entries(piSkills).map(([relativePath, content]) =>
      writeFile(relativePath, content, false, "Pi akrctx skill."),
    ),
  ]);
  writes.push(...piResults);

  if (!(await pathExists(path.join(cwd, ".pi")))) {
    writes.push(
      await writeFile(
        ".pi/README.md",
        "# Pi akrctx Harness\n\nThis directory contains akrctx prompts and skills for Pi.\n",
      ),
    );
  }

  return writes;
}

async function readProjectName(cwd: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
    if (typeof pkg.name === "string" && pkg.name.trim()) return pkg.name.trim();
  } catch {
    // no package.json or invalid JSON — fall through
  }
  return path.basename(cwd);
}

/**
 * The existing configuration, or undefined when there is none to merge into.
 *
 * An unreadable config is treated as absent rather than as an error: `init` is one of the
 * commands a user runs to get out of a broken state, and `akrctx doctor` is what reports the
 * damage. Returning undefined also keeps the config write unforced, so the broken file
 * survives for recovery.
 */
async function readExistingConfig(cwd: string) {
  return readConfig(cwd).catch(() => undefined);
}

/** Union, in first-seen order. `init` adds a target and never removes one. */
function mergeTargets(existing: Target[], selected: Target[]): Target[] {
  return [...new Set([...existing, ...selected])];
}
