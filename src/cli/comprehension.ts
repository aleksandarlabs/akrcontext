import type { Command } from "commander";
import { runComprehensionDisable, runComprehensionEnable, runComprehensionStatus } from "../comprehension.js";
import { bold, dim, file, green, yellow } from "../format.js";
import {
  addCommon,
  log,
  mark,
  normalizeOptions,
  printAgentDiscoveryNotice,
  printAgentModels,
  printAgentWarnings,
} from "./shared.js";

export function registerComprehension(program: Command): void {
  const comprehension = program
    .command("comprehension")
    .description("Manage the optional developer comprehension checkpoint.");

  addCommon(
    comprehension
      .command("enable")
      .description("Enable the independent comprehension agent for supported installed targets."),
    false,
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runComprehensionEnable(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    log(`${bold("Comprehension gate:")} ${options.dryRun ? yellow("would enable (dry-run)") : green("enabled")}`);
    log(`  ${dim(`Trigger: ${result.trigger}`)}`);
    log(`  ${dim(`Local ignore valid: ${result.localIgnoreValid ? "yes" : "no"}`)}`);
    for (const write of result.writes) log(`  ${mark(write.kind)} ${file(write.path)}`);
    if (result.skippedTargets.length) {
      log(
        `  ${dim(`Skipped (no agent format, or not listed in agents.comprehension.targets): ${result.skippedTargets.join(", ")}`)}`,
      );
    }
    printAgentModels(result.models);
    printAgentDiscoveryNotice(result.discoveryNotice);
    printAgentWarnings(result.warnings);
  });

  addCommon(comprehension.command("disable").description("Disable comprehension checkpoints."), false).action(
    async (raw) => {
      const options = normalizeOptions(raw);
      const result = await runComprehensionDisable(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      log(`${bold("Comprehension gate:")} ${options.dryRun ? yellow("would disable (dry-run)") : yellow("disabled")}`);
    },
  );

  addCommon(comprehension.command("status").description("Show checkpoint and local-storage status."), false).action(
    async (raw) => {
      const options = normalizeOptions(raw);
      const result = await runComprehensionStatus(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      log(`${bold("Comprehension gate:")} ${result.enabled ? green("enabled") : yellow("disabled")}`);
      log(`  ${dim(`Trigger: ${result.trigger}`)}`);
      log(`  ${dim(`Evaluation: ${result.evaluationMode}`)}`);
      log(`  ${dim(`Local ignore valid: ${result.localIgnoreValid ? "yes" : "NO — run akrctx doctor --fix"}`)}`);
      if (result.presentFiles.length) {
        log(`  ${dim(`Agent files: ${result.presentFiles.join(", ")}`)}`);
      }
      if (result.missingFiles.length) {
        log(`  ${yellow(`Missing agents — run akrctx comprehension enable: ${result.missingFiles.join(", ")}`)}`);
      }
    },
  );
}
