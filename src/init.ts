import { readFile } from "node:fs/promises";
import path from "node:path";
import { select } from "@inquirer/prompts";
import { detectTargets } from "./detect.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import {
  claudeCommands,
  claudeSkills,
  codexSkills,
  configTemplate,
  copilotFiles,
  copilotSkills,
  mainInstructionTemplate,
  overviewTemplate,
  piFiles,
  piSkills,
  policyTemplate,
  targetReferenceTemplates,
  taskTemplateFiles,
  wikiTemplates,
} from "./templates.js";
import type { CommandOptions, InitResult, Target, TargetOption, WriteResult } from "./types.js";
import { targets } from "./types.js";
import { CLI_VERSION } from "./version.js";

export async function runInit(options: CommandOptions): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const detection = await detectTargets(cwd);
  const { target, selectedTargets, fallbackUsed } = await resolveTarget(options, detection.detected);
  const writes: WriteResult[] = [];

  const writeFile = (relativePath: string, content: string, protectedFile = false, reason?: string) =>
    writePlannedFile(cwd, relativePath, String(content), {
      dryRun: options.dryRun,
      force: options.force,
      protected: protectedFile,
      reason,
    });

  // Neutral foundation files (sequential — config before wiki for logical order in output).
  writes.push(await writeFile(".akrctx/config.json", configTemplate(selectedTargets), false, "akrctx config."));
  writes.push(await writeFile(".akrctx/policy.json", policyTemplate(), false, "akrctx security and merge policy."));

  const projectName = await readProjectName(cwd);

  // Wiki, task templates, and target references are independent — write in parallel.
  const [overviewResult, wikiResults, taskResults, targetResults] = await Promise.all([
    writeFile(
      ".akrctx/wiki/overview.md",
      overviewTemplate(projectName, selectedTargets, CLI_VERSION),
      false,
      "akrctx wiki file.",
    ),
    Promise.all(
      Object.entries(wikiTemplates).map(([relativePath, content]) =>
        writeFile(path.posix.join(".akrctx", relativePath), content, false, "akrctx wiki file."),
      ),
    ),
    Promise.all(
      Object.entries(taskTemplateFiles).map(([relativePath, content]) =>
        writeFile(path.posix.join(".akrctx", relativePath), content, false, "akrctx task template."),
      ),
    ),
    Promise.all(
      targets.map((targetName) =>
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
    const targetWrites = await installTarget(cwd, targetName, options);
    writes.push(...targetWrites);
  }

  return {
    target,
    selectedTargets,
    fallbackUsed,
    detection,
    writes,
    conflicts: writes.filter((write) => write.kind === "suggest").map((write) => write.path),
  };
}

async function resolveTarget(
  options: CommandOptions,
  detected: Target[],
): Promise<{ target: TargetOption; selectedTargets: Target[]; fallbackUsed: boolean }> {
  if (options.target) {
    return {
      target: options.target,
      selectedTargets: options.target === "all" ? [...targets] : [options.target],
      fallbackUsed: false,
    };
  }

  if (detected.length === 1) {
    return { target: detected[0], selectedTargets: [detected[0]], fallbackUsed: false };
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
    return { target: answer, selectedTargets: answer === "all" ? [...targets] : [answer], fallbackUsed: false };
  }

  return { target: "codex", selectedTargets: ["codex"], fallbackUsed: true };
}

async function installTarget(cwd: string, target: Target, options: CommandOptions): Promise<WriteResult[]> {
  const writes: WriteResult[] = [];
  const writeFile = (relativePath: string, content: string, protectedFile = false, reason?: string) =>
    writePlannedFile(cwd, relativePath, String(content), {
      dryRun: options.dryRun,
      force: options.force,
      protected: protectedFile,
      reason,
    });

  if (target === "codex") {
    const [main, ...skills] = await Promise.all([
      writeFile(
        "AGENTS.md",
        mainInstructionTemplate("codex"),
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
        mainInstructionTemplate("claude"),
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
        mainInstructionTemplate("copilot"),
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
