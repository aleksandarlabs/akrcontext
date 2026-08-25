import type { Command } from "commander";
import { bold, file, green, yellow } from "../format.js";
import { runUpgrade } from "../upgrade.js";
import { addCommon, ln, log, mark, normalizeOptions, printAgentWarnings, warn } from "./shared.js";

export function registerUpgrade(program: Command): void {
  addCommon(
    program
      .command("upgrade")
      .description("Update akrctx-owned harness files to the current CLI version.")
      .addHelpText(
        "after",
        [
          "",
          "Safely migrates the installed harness to the current CLI version.",
          "Wiki, task capsules, local records, and root instructions are never overwritten.",
          "",
          "Examples:",
          "  akrctx upgrade                    upgrade installed targets",
          "  akrctx upgrade --target codex     upgrade only codex harness files",
          "  akrctx upgrade --dry-run          preview what would change",
          "",
          "Files with verified akrctx provenance are updated automatically. Modified or",
          "legacy files are preserved and receive a candidate under .akrctx/upgrades/.",
          "Resolve candidates and rerun upgrade to complete installedVersion migration.",
          "",
          "A rerun that covers every installed target removes the candidates it no longer",
          "writes, because those are the resolved ones. Candidate directories of earlier",
          "versions are kept: they cannot be regenerated.",
        ].join("\n"),
      ),
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    if (options.force) throw new Error("`akrctx upgrade` never force-overwrites files; remove --force.");
    const result = await runUpgrade(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      if (!result.completed) process.exitCode = 1;
      return;
    }
    log(
      `${bold(options.dryRun ? "Upgrade plan:" : "Upgrade:")} ${result.fromVersion ?? "legacy"} → ${result.toVersion}`,
    );
    const changed = result.writes.filter((write) => write.kind === "create" || write.kind === "update");
    const suggestions = result.writes.filter((write) => write.kind === "suggest");
    if (changed.length) {
      ln();
      for (const write of changed) log(`  ${mark(write.kind)} ${file(write.path)}`);
    }
    if (suggestions.length) {
      ln();
      log(`  ${yellow("Preserved files with upgrade candidates:")}`);
      for (const write of suggestions) log(`    ${warn()} ${file(write.path)}`);
    }
    if (result.removed.length) {
      ln();
      log(`  ${options.dryRun ? "Resolved candidates to remove:" : "Removed resolved candidates:"}`);
      for (const removed of result.removed) log(`    - ${file(removed)}`);
    }
    ln();
    if (result.obsolete.length) {
      log(yellow(`  ${result.obsolete.length} obsolete managed file(s) were preserved for manual review.`));
    }
    printAgentWarnings(result.warnings);
    if (result.installationComplete) {
      log(green(options.dryRun ? "  Upgrade can complete safely." : "  Upgrade completed safely."));
    } else if (result.completed) {
      log(yellow("  Selected targets updated; run upgrade for all installed targets to advance installedVersion."));
    } else {
      log(yellow(`  Upgrade incomplete: resolve ${result.conflicts.length} managed-file conflict(s) and rerun.`));
    }
    if (!result.completed) process.exitCode = 1;
  });
}
