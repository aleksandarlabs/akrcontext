import type { Command } from "commander";
import { dim, gray, yellow } from "../format.js";
import { runRemove } from "../remove.js";
import type { CommandOptions } from "../types.js";
import { addCommon, log, normalizeOptions, printWriteGroup } from "./shared.js";

export function registerRemove(program: Command): void {
  addCommon(
    program
      .command("remove")
      .description("Remove akrctx harness files for a target.")
      .addHelpText(
        "after",
        [
          "",
          "Without --force, shows a dry-run of what would be removed.",
          "Protected root instruction files are always skipped — remove them manually.",
          "",
          "--target all removes harness FILES for every target (codex, claude, copilot, pi).",
          "--all additionally removes the neutral .akrctx/ directory itself.",
          "",
          "Examples:",
          "  akrctx remove --target codex            dry-run: list what would be removed",
          "  akrctx remove --target codex --force    actually remove codex skill files",
          "  akrctx remove --target all --force      remove skill files for every target",
          "  akrctx remove --all --force             remove .akrctx/ and all target files",
          "                                           (task capsules under .akrctx/tasks/ are kept)",
          "  akrctx remove --all --purge-tasks --force  also delete .akrctx/tasks/ entirely",
          "  akrctx remove --all --purge-local --force  also delete personal comprehension records",
        ].join("\n"),
      ),
  )
    .option("--all", "remove .akrctx/ and all target files", false)
    .option("--purge-tasks", "with --all, also delete .akrctx/tasks/ (task capsules) instead of keeping them", false)
    .option("--purge-local", "with --all, also delete .akrctx/local/ personal records instead of keeping them", false)
    .action(async (raw) => {
      const options = normalizeOptions(raw) as CommandOptions & {
        all?: boolean;
        purgeTasks?: boolean;
        purgeLocal?: boolean;
      };
      options.purgeTasks = Boolean(raw.purgeTasks);
      options.purgeLocal = Boolean(raw.purgeLocal);
      if (!options.target && !options.all) {
        throw new Error("Specify a target with --target <target> or use --all to remove everything.");
      }
      const result = await runRemove(options);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (result.dryRun) {
        log(yellow("Dry-run — pass --force to apply:"));
      }
      printWriteGroup(result.dryRun ? "Would remove" : "Removed", result.planned);
      printWriteGroup(
        result.dryRun ? "Would update (remove trace hooks)" : "Updated (removed trace hooks)",
        result.updated,
      );
      if (result.protected.length > 0) {
        log("");
        log(`${dim("Protected (skipped — remove manually):")}`);
        for (const f of result.protected) log(`  ${gray(f)}`);
      }
      if (result.planned.length === 0 && result.updated.length === 0 && result.protected.length === 0) {
        log(gray("Nothing to remove."));
      }
    });
}
