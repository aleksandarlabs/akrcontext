import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { bold, dim, file, green, warn, yellow } from "../format.js";
import { parseRecordInput, runImplDisable, runImplEnable, runImplLog, runImplStart, runImplStatus } from "../impl.js";
import {
  addCommon,
  ln,
  log,
  mark,
  normalizeOptions,
  parseValidation,
  printAgentDiscoveryNotice,
  printAgentModels,
  printAgentWarnings,
  splitList,
} from "./shared.js";

export function registerImpl(program: Command): void {
  const impl = program
    .command("impl")
    .description("Manage the optional implementer agent and its append-only implementation log.")
    .addHelpText(
      "after",
      [
        "",
        "The implementation log lives at .akrctx/local/impl/<TASK-ID>/log.md — local,",
        "Git-ignored, and outside every review boundary by construction.",
        "",
        "  akrctx impl enable                 install the implementer agent files",
        "  akrctx impl start TASK-001         open or resume the log, get the round number",
        "  akrctx impl log TASK-001 ...       append one round record",
        "  akrctx impl status TASK-001        attempts used, remaining, last blocker",
        "",
        "The attempt budget comes from agents.implementer.maxAttempts (default 3) and is",
        "enforced by the store: `impl log` refuses to append past it whether or not",
        "`impl start` was called first.",
      ].join("\n"),
    );

  addCommon(
    impl.command("enable").description("Enable the implementer agent for the installed targets."),
    false,
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runImplEnable(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    log(`${bold("Implementer:")} ${options.dryRun ? yellow("would enable (dry-run)") : green("enabled")}`);
    if (result.writes.length) {
      ln();
      for (const write of result.writes) log(`  ${mark(write.kind)} ${file(write.path)}`);
    }
    if (result.skippedTargets.length) {
      ln();
      log(
        `  ${dim(`Skipped (no agent format, or not listed in agents.implementer.targets): ${result.skippedTargets.join(", ")}`)}`,
      );
    }
    ln();
    log(`  ${dim(`Attempt budget: ${result.maxAttempts} ← agents.implementer.maxAttempts`)}`);
    printAgentModels(result.models);
    printAgentDiscoveryNotice(result.discoveryNotice);
    printAgentWarnings(result.warnings);
  });

  addCommon(
    impl.command("disable").description("Disable the implementer. Agent files are kept — remove them manually."),
    false,
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    await runImplDisable(options);
    if (options.json) {
      console.log(JSON.stringify({ enabled: false }));
      return;
    }
    log(`${bold("Implementer:")} ${yellow("disabled")}`);
  });

  addCommon(
    impl
      .command("start")
      .description("Open or resume the implementation log and report the round the caller may begin.")
      .argument("<task-id>", "task capsule ID, for example TASK-001"),
    false,
  ).action(async (taskId: string, raw) => {
    const options = normalizeOptions(raw);
    const result = await runImplStart(taskId, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      if (result.refused) process.exitCode = 1;
      return;
    }
    if (result.refused) {
      log(`${bold("Implementation:")} ${yellow("refused")}`);
      log(`  ${warn()} ${result.reason}`);
      process.exitCode = 1;
      return;
    }
    log(`${bold("Implementation:")} ${green(`round ${result.round} of ${result.maxAttempts}`)}`);
    log(`  ${dim(`Log: ${result.logPath}`)}`);
    log(`  ${dim(`Attempts used: ${result.attemptsUsed}  remaining: ${result.attemptsRemaining}`)}`);
    if (result.lastBlocker) log(`  ${dim(`Last blocker: ${result.lastBlocker}`)}`);
  });

  addCommon(
    impl
      .command("log")
      .description("Append one round record to the implementation log.")
      .argument("<task-id>", "task capsule ID, for example TASK-001")
      .option("--criteria <list>", "acceptance criteria targeted (comma-separated)")
      .option("--files <list>", "files changed (comma-separated)")
      .option(
        "--validation <entry>",
        "validation command as `command::status::verbatim output` (repeatable)",
        (value: string, previous: string[]) => [...previous, value],
        [] as string[],
      )
      .option("--blocker <text>", "what stopped this round")
      .option("--decision <text>", "the decision needed from the caller")
      .option("--record <file>", "read the whole record from a JSON file instead of flags"),
    false,
  ).action(async (taskId: string, raw) => {
    const options = normalizeOptions(raw);
    const cwd = options.cwd ?? process.cwd();
    const input = raw.record
      ? parseRecordInput(JSON.parse(await readFile(path.resolve(cwd, String(raw.record)), "utf8")))
      : {
          criteria: splitList(raw.criteria),
          files: splitList(raw.files),
          validation: (raw.validation as string[]).map(parseValidation),
          blocker: raw.blocker ? String(raw.blocker) : undefined,
          decisionNeeded: raw.decision ? String(raw.decision) : undefined,
        };
    const result = await runImplLog(taskId, input, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      if (result.refused) process.exitCode = 1;
      return;
    }
    if (result.refused) {
      log(`${bold("Implementation:")} ${yellow("refused")}`);
      log(`  ${warn()} ${result.reason}`);
      process.exitCode = 1;
      return;
    }
    log(`${bold("Implementation:")} ${green(`round ${result.record?.round} recorded`)}`);
    log(`  ${dim(`Log: ${result.logPath}`)}`);
    log(`  ${dim(`Attempts used: ${result.attemptsUsed}  remaining: ${result.attemptsRemaining}`)}`);
    if (result.stopped) log(`  ${warn()} ${yellow("Attempt budget spent. Hand the task back.")}`);
  });

  addCommon(
    impl
      .command("status")
      .description("Report attempts used, attempts remaining, the last blocker, and whether the task is stopped.")
      .argument("<task-id>", "task capsule ID, for example TASK-001"),
    false,
  ).action(async (taskId: string, raw) => {
    const options = normalizeOptions(raw);
    const result = await runImplStatus(taskId, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.attemptsUsed === null) {
      log(`${bold("Implementation:")} ${yellow(result.readable ? "log exposed" : "log unreadable")}`);
      log(`  ${warn()} ${result.blocked}`);
      log(`  ${dim("No attempt count is reported, so no fresh budget is granted.")}`);
      process.exitCode = 1;
      return;
    }
    log(
      `${bold("Implementation:")} ${result.stopped ? yellow("stopped") : green("open")} ${dim(`(${result.attemptsUsed}/${result.maxAttempts} rounds)`)}`,
    );
    log(`  ${dim(`Log: ${result.logPath}`)}`);
    log(`  ${dim(`Attempts remaining: ${result.attemptsRemaining}`)}`);
    if (result.lastBlocker) log(`  ${dim(`Last blocker: ${result.lastBlocker}`)}`);
  });
}
