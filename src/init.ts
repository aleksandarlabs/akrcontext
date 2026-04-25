import { select } from "@inquirer/prompts";
import path from "node:path";
import { detectTargets } from "./detect.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import {
  claudeCommands,
  claudeSkills,
  codexSkills,
  configTemplate,
  copilotFiles,
  mainInstructionTemplate,
  piFiles,
  piSkills,
  policyTemplate,
  targetReferenceTemplates,
  taskTemplateFiles,
  wikiTemplates,
} from "./templates.js";
import type { CommandOptions, InitResult, Target, TargetOption, WriteResult } from "./types.js";
import { targets } from "./types.js";

export async function runInit(options: CommandOptions): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const detection = await detectTargets(cwd);
  const { target, selectedTargets, fallbackUsed } = await resolveTarget(options, detection.detected);
  const writes: WriteResult[] = [];

  const addWrite = async (relativePath: string, content: string, protectedFile = false, reason?: string) => {
    writes.push(
      await writePlannedFile(cwd, relativePath, String(content), {
        dryRun: options.dryRun,
        force: options.force,
        protected: protectedFile,
        reason,
      }),
    );
  };

  await addWrite(".contextforge/config.json", configTemplate(selectedTargets), false, "ContextForge config.");
  await addWrite(".contextforge/policy.json", policyTemplate(), false, "ContextForge security and merge policy.");

  for (const [relativePath, content] of Object.entries(wikiTemplates)) {
    await addWrite(path.posix.join(".contextforge", relativePath), content, false, "ContextForge wiki file.");
  }
  for (const [relativePath, content] of Object.entries(taskTemplateFiles)) {
    await addWrite(path.posix.join(".contextforge", relativePath), content, false, "ContextForge task template.");
  }
  for (const targetName of targets) {
    await addWrite(
      `.contextforge/targets/${targetName}.md`,
      targetReferenceTemplates[targetName],
      false,
      "ContextForge target reference.",
    );
  }

  for (const targetName of selectedTargets) {
    await installTarget(cwd, targetName, addWrite);
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
          ? `Multiple agent setups detected (${detected.join(", ")}). Which target should ContextForge install?`
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

async function installTarget(
  cwd: string,
  target: Target,
  addWrite: (relativePath: string, content: string, protectedFile?: boolean, reason?: string) => Promise<void>,
): Promise<void> {
  if (target === "codex") {
    await addWrite("AGENTS.md", mainInstructionTemplate("codex"), true, "Existing AGENTS.md preserved; wrote suggested Codex harness.");
    for (const [relativePath, content] of Object.entries(codexSkills)) {
      await addWrite(relativePath, content, false, "Codex ContextForge skill.");
    }
    return;
  }

  if (target === "claude") {
    await addWrite("CLAUDE.md", mainInstructionTemplate("claude"), true, "Existing CLAUDE.md preserved; wrote suggested Claude harness.");
    for (const [relativePath, content] of Object.entries(claudeCommands)) {
      await addWrite(relativePath, content, false, "Claude ContextForge command.");
    }
    for (const [relativePath, content] of Object.entries(claudeSkills)) {
      await addWrite(relativePath, content, false, "Claude ContextForge skill.");
    }
    return;
  }

  if (target === "copilot") {
    await addWrite(
      ".github/copilot-instructions.md",
      mainInstructionTemplate("copilot"),
      true,
      "Existing Copilot instructions preserved; wrote suggested harness.",
    );
    for (const [relativePath, content] of Object.entries(copilotFiles)) {
      await addWrite(relativePath, content, false, "Copilot ContextForge prompt or instruction.");
    }
    return;
  }

  await addWrite(".pi/prompts/contextforge-doctor.md", piFiles[".pi/prompts/contextforge-doctor.md"], false, "Pi ContextForge prompt.");
  await addWrite(".pi/prompts/contextforge-task.md", piFiles[".pi/prompts/contextforge-task.md"], false, "Pi ContextForge prompt.");
  await addWrite(".pi/prompts/contextforge-workflow.md", piFiles[".pi/prompts/contextforge-workflow.md"], false, "Pi ContextForge prompt.");
  await addWrite(".pi/prompts/contextforge-write-policy.md", piFiles[".pi/prompts/contextforge-write-policy.md"], false, "Pi ContextForge prompt.");
  for (const [relativePath, content] of Object.entries(piSkills)) {
    await addWrite(relativePath, content, false, "Pi ContextForge skill.");
  }

  if (!(await pathExists(path.join(cwd, ".pi")))) {
    await addWrite(".pi/README.md", "# Pi ContextForge Harness\n\nThis directory contains ContextForge prompts and skills for Pi.\n");
  }
}
