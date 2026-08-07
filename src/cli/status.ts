import type { Command } from "commander";
import { bold, cmd, dim, gray, green, yellow } from "../format.js";
import { runStatus } from "../status.js";
import { addCommon, log, normalizeOptions, printAgentWarnings } from "./shared.js";

export function registerStatus(program: Command): void {
  addCommon(
    program
      .command("status")
      .description("Print a quick summary of the installation — targets, tasks, and config defaults."),
    false,
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runStatus(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const installedLabel = result.installed ? green("installed") : yellow("not installed");
    log(`${bold("akrctx:")} ${installedLabel}`);
    log(`${bold("Targets:     ")} ${result.targets.length ? bold(result.targets.join(", ")) : gray("none")}`);
    const uninstalledDetected = result.detectedTargets.filter((t) => !result.targets.includes(t));
    if (uninstalledDetected.length) {
      log(`${dim("Detected:    ")} ${gray(uninstalledDetected.join(", "))} ${dim("(not installed)")}`);
    }
    log(
      `${bold("Tasks:       ")} ${result.taskCount}${result.recentTaskIds.length ? dim(` (${result.recentTaskIds.join(", ")})`) : ""}`,
    );
    log(`${bold("Workflow:    ")} ${result.defaultWorkflow}`);
    log(`${bold("Context:     ")} ${result.contextBudget}`);
    log(`${bold("Comprehension:")} ${result.comprehensionGate}`);
    for (const agent of result.agents) {
      const state = agent.enabled ? green("enabled") : gray("disabled");
      log(`  ${agent.name.padEnd(13)} ${state} ${dim(`trigger: ${agent.trigger}`)}`);
    }
    printAgentWarnings(result.warnings);

    if (!result.installed) {
      log("");
      log(`  Run ${cmd("akrctx init")} to install.`);
    }
  });
}
