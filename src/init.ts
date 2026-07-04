import { readFile } from "node:fs/promises";
import path from "node:path";
import select from "@inquirer/select";
import { detectTargets } from "./detect.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import { type TemplatePack, loadBundledTemplatePack, loadTemplatePack, mergeTemplateJson } from "./template-pack.js";
import {
  claudeCommands,
  claudeSkills,
  codexSkills,
  copilotFiles,
  copilotSkills,
  defaultConfig,
  defaultPolicy,
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
      upgrade: options.upgrade,
    });

  // Neutral foundation files (sequential — config before wiki for logical order in output).
  const config = mergeTemplateJson(defaultConfig(selectedTargets, profile), templatePack?.config);
  config.targets = selectedTargets;
  config.defaults.target = selectedTargets[0];
  writes.push(await writeFile(".akrctx/config.json", JSON.stringify(config, null, 2), false, "akrctx config."));
  const policy = mergeTemplateJson(defaultPolicy(profile), templatePack?.policy);
  policy.profile = profile;
  writes.push(
    await writeFile(".akrctx/policy.json", JSON.stringify(policy, null, 2), false, "akrctx security and merge policy."),
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

  // Target-specific harness files.
  for (const targetName of selectedTargets) {
    const targetWrites = await installTarget(cwd, targetName, options, templatePack);
    writes.push(...targetWrites);
  }

  for (const [relativePath, content] of Object.entries(templatePack?.targetFiles ?? {})) {
    writes.push(await writeFile(relativePath, content, false, "akrctx template pack target file."));
  }

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
  const writeFile = (relativePath: string, content: string, protectedFile = false, reason?: string) =>
    writePlannedFile(cwd, relativePath, String(content), {
      dryRun: options.dryRun,
      force: options.force,
      protected: protectedFile,
      reason,
      upgrade: options.upgrade,
    });

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
      await writeFile(".pi/README.md", templatePack.rootInstructions, false, "Pi template pack root instructions."),
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
