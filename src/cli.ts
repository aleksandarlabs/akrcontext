import { Command, Option } from "commander";
import { runCompile } from "./compile.js";
import { readConfig, setConfigValue } from "./config.js";
import { runDoctor } from "./doctor.js";
import { bold, cmd, dim, file, gray, green, minus, plus, rule, warn, yellow } from "./format.js";
import { runInit } from "./init.js";
import { runJudgeDisable, runJudgeEnable, runJudgeStatus } from "./judge.js";
import { runRemove } from "./remove.js";
import { runStatus } from "./status.js";
import { runTask } from "./task.js";
import type { CommandOptions, DoctorResult, InitResult, Profile, Target, TargetOption, WriteResult } from "./types.js";
import { CLI_VERSION } from "./version.js";

export async function main(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("akrctx")
    .version(CLI_VERSION)
    .description(
      [
        "akrctx installs an agentic workflow harness into a repository.",
        "",
        "It gives your coding agent structured context, task capsules, workflow",
        "selection, merge safety, and quality gates — without replacing the agent.",
      ].join("\n"),
    )
    .addHelpText(
      "after",
      [
        "",
        "Quick start:",
        "  akrctx init                                    install harness (auto-detects agent)",
        "  akrctx init --target claude                   install for Claude Code",
        "  akrctx doctor                                  audit readiness + write wiki",
        "  akrctx status                                  quick install summary",
        "",
        "Normal coding flow (agent-first, no CLI needed):",
        '  Open your agent → ask "create X" or "fix Y"',
        "  → Agent creates the task capsule with real codebase context, then implements.",
        "",
        "CLI task (headless fallback for scripts/CI only):",
        '  akrctx task "Add invoice API"                  create empty capsule skeleton',
        '  akrctx task "Fix auth bug" --workflow TDD      force a specific workflow',
        "  akrctx compile TASK-001 --target codex         generate agent brief from capsule",
        "",
        "Config:",
        "  akrctx config show                             print current config",
        "  akrctx config set defaultWorkflow SDD+TDD      set project default",
        "  akrctx config set contextBudget proportional   adjust context loading",
        "",
        "Supported workflows:",
        "  fast-patch   research-first   SDD   TDD   EDD   SDD+TDD   SDD+EDD   TDD+EDD",
        "",
        "Supported profiles: default | strict | regulated",
        "",
        "Supported targets: codex | claude | copilot | pi | all",
      ].join("\n"),
    );

  const addCommon = (command: Command, includeTarget = true) => {
    if (includeTarget) {
      command.addOption(
        new Option("--target <target>", "target agent").choices(["codex", "claude", "copilot", "pi", "all"]),
      );
    }
    command.option("--dry-run", "show planned writes without writing files", false);
    command.option("--force", "update akrctx-owned files when they already exist", false);
    command.option("--json", "emit JSON output (for scripting)", false);
    return command;
  };

  // ── init ──────────────────────────────────────────────────────────────────
  addCommon(
    program
      .command("init")
      .description("Install a akrctx harness into the current repository.")
      .addOption(new Option("--profile <profile>", "installation profile").choices(["default", "strict", "regulated"]))
      .addHelpText(
        "after",
        [
          "",
          "What init does:",
          "  1. Detects existing agent setup (Codex, Claude, Copilot, Pi).",
          "  2. Asks which agent to target if none is detected.",
          "  3. Creates .akrctx/ — the neutral source of truth.",
          "  4. Installs target-specific harness files (skills, prompts, instructions).",
          "  5. Applies the selected profile (default, strict, or regulated).",
          "  6. Preserves any existing AGENTS.md / CLAUDE.md (writes .suggested instead).",
          "",
          "Run akrctx doctor after init to finish setup with your agent.",
        ].join("\n"),
      ),
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    if (options.force) {
      console.warn(
        "Warning: --force is set. akrctx-owned files will be overwritten.\n" +
          "         Protected files (AGENTS.md, CLAUDE.md, copilot-instructions.md) are never overwritten.",
      );
    }
    const result = await runInit(options);
    printInit(result, options);
  });

  // ── doctor ────────────────────────────────────────────────────────────────
  addCommon(
    program
      .command("doctor")
      .description("Audit the akrctx setup and write a readiness report to .akrctx/wiki/.")
      .option("--ci", "fail with exit code 1 when the harness is incomplete or has actionable issues", false)
      .addHelpText(
        "after",
        [
          "",
          "Doctor checks:",
          "  - Whether akrctx is installed.",
          "  - Which target adapters are present.",
          "  - Which required files are missing.",
          "  - Whether protected files have pending merge suggestions.",
          "  - Config completeness.",
          "",
          "It writes the report to .akrctx/wiki/agent-setup.md",
          "and prints a suggested agent prompt to finish the audit intelligently.",
        ].join("\n"),
      ),
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runDoctor(options);
    if (options.ci) {
      printDoctorCi(result, options);
      if (doctorCiFailed(result)) process.exitCode = 1;
      return;
    }
    printDoctor(result, options);
  });

  // ── status ────────────────────────────────────────────────────────────────
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

    if (!result.installed) {
      ln();
      log(`  Run ${cmd("akrctx init")} to install.`);
    }
  });

  // ── config ────────────────────────────────────────────────────────────────
  const config = program.command("config").description("Show or update akrctx project defaults.");

  addCommon(config.command("show").description("Print .akrctx/config.json."), false).action(async () => {
    const result = await readConfig(process.cwd());
    if (!result) {
      throw new Error("akrctx config not found. Run `akrctx init` first.");
    }
    console.log(JSON.stringify(result, null, 2));
  });

  addCommon(
    config
      .command("set")
      .description("Set a akrctx config default.")
      .argument(
        "<key>",
        "config key (defaultWorkflow | defaultTarget | requireTaskCapsule | requireWorkflowReason | contextBudget)",
      )
      .argument("<value>", "new value"),
    false,
  ).action(async (key: string, value: string, raw) => {
    const options = normalizeOptions(raw);
    const result = await setConfigValue(process.cwd(), key, value, options.dryRun);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`${options.dryRun ? "Planned" : "Updated"} config: ${key} = ${value}`);
  });

  // ── task ──────────────────────────────────────────────────────────────────
  addCommon(
    program
      .command("task")
      .description("Create a akrctx task capsule for the given description.")
      .argument("<description>", "what you want to build or fix")
      .addHelpText(
        "after",
        [
          "",
          "This command is a HEADLESS FALLBACK for scripting and CI.",
          "During normal agent-assisted work you do NOT need this command.",
          "",
          'Normal flow: just ask your agent "create X" or "fix Y".',
          "  → The agent reads AGENTS.md / CLAUDE.md and creates the task capsule",
          "    itself, intelligently filling context from your actual codebase.",
          "",
          "CLI task is useful when:",
          "  - You want to pre-create a capsule skeleton before opening the agent.",
          "  - You are running in CI / headless without an interactive agent.",
          "  - You want a deterministic workflow override (--workflow flag).",
          "",
          "A task capsule is a directory under .akrctx/tasks/TASK-XXX-<slug>/",
          "containing: task.md  context.md  plan.md  acceptance-criteria.md  review-checklist.md",
          "",
          "The CLI fills in a basic skeleton with regex-matched workflow selection.",
          "The agent fills in real context, relevant file lists, and smart criteria.",
        ].join("\n"),
      ),
  )
    .option(
      "--workflow <workflow>",
      "override workflow: fast-patch | research-first | SDD | TDD | EDD | SDD+TDD | SDD+EDD | TDD+EDD",
    )
    .action(async (description: string, raw) => {
      const options = normalizeOptions(raw);
      const result = await runTask(description, options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      log(`${bold("Task capsule:")} ${file(result.taskDir)}`);
      log(`${bold("Workflow:    ")} ${bold(result.workflow)}  ${dim(result.workflowReason)}`);
      ln();
      log(`  ${dim("Files created:")}`);
      for (const w of result.writes) log(`    ${plus()} ${file(w)}`);
      ln();
      log(`  ${bold("Next:")} open your agent and ask:`);
      log(`        ${gray(`"Run akrctx task workflow for ${result.taskId}."`)}`);
      log(`  Or compile a brief: ${cmd(`akrctx compile ${result.taskId} --target codex`)}`);
    });

  // ── compile ───────────────────────────────────────────────────────────────
  addCommon(
    program
      .command("compile")
      .description("Compile a task capsule into a ready-to-paste agent brief.")
      .argument("<taskId>", "task id (e.g. TASK-001)")
      .addHelpText(
        "after",
        [
          "",
          "Concatenates task.md + context.md + plan.md + acceptance-criteria.md",
          "into a single .md file at .akrctx/tasks/TASK-XXX/exports/<target>.md.",
          "Paste the brief directly into your agent's context, or let the agent read it.",
        ].join("\n"),
      ),
  ).action(async (taskId: string, raw) => {
    const options = normalizeOptions(raw);
    if (options.target === "all") {
      throw new Error("compile requires a single target, not `all`.");
    }
    const compileOptions = options as CommandOptions & { target?: Target };
    const result = await runCompile(taskId, compileOptions);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Compiled (${result.target}): ${result.outputPath}`);
  });

  // ── judge ─────────────────────────────────────────────────────────────────
  const judge = program.command("judge").description("Manage the optional akrctx judge subagent.");

  addCommon(
    judge
      .command("enable")
      .description("Enable the judge and install agent files for the installed targets.")
      .addHelpText(
        "after",
        [
          "",
          "Generates a judge agent file for each installed target:",
          "  Claude Code  →  .claude/agents/akrctx-judge.md",
          "  Copilot      →  .github/agents/akrctx-judge.agent.md",
          "  Codex        →  .codex/agents/akrctx-judge.toml",
          "  Pi           →  not supported (skipped)",
          "",
          "The generated files do not specify a model.",
          "To use a specific model, add the model field manually:",
          "",
          "  Claude Code / Copilot — add to YAML frontmatter:",
          "    model: <model-id>",
          "",
          "  Codex — add to the TOML file:",
          '    model = "<model-id>"',
          "",
          "Check your platform's documentation for valid model identifiers.",
          "They are platform-specific and change over time.",
        ].join("\n"),
      ),
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runJudgeEnable(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const verb = options.dryRun ? "Would install" : "Installed";
    log(`${bold("Judge:")} ${green("enabled")}`);
    if (result.writes.length) {
      ln();
      for (const w of result.writes) log(`  ${plus()} ${file(w.path)}`);
    }
    if (result.skippedTargets.length) {
      ln();
      log(`  ${dim(`Skipped (no native subagent support): ${result.skippedTargets.join(", ")}`)}`);
    }
    ln();
    log(`  ${dim(`${verb} for: ${result.installedTargets.join(", ")}`)}`);
    log(`  ${dim("To set a model, edit the generated file and add the model field.")}`);
    log(`  ${dim("See docs/JUDGE.md for examples.")}`);
  });

  addCommon(
    judge.command("disable").description("Disable the judge. Agent files are kept — remove them manually if needed."),
    false,
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    await runJudgeDisable(options);
    if (options.json) {
      console.log(JSON.stringify({ enabled: false }));
      return;
    }
    log(`${bold("Judge:")} ${yellow("disabled")}`);
    log(dim("  Agent files were not removed. Delete them manually if you no longer need them."));
  });

  addCommon(judge.command("status").description("Show judge configuration and installed agent files."), false).action(
    async (raw) => {
      const options = normalizeOptions(raw);
      const result = await runJudgeStatus(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      const enabledLabel = result.enabled ? green("enabled") : yellow("disabled");
      log(`${bold("Judge:")} ${enabledLabel}  ${dim(`trigger: ${result.trigger}`)}`);
      if (result.presentFiles.length) {
        ln();
        log(`  ${dim("Agent files present:")}`);
        for (const f of result.presentFiles) log(`    ${plus()} ${file(f)}`);
      }
      if (result.missingFiles.length) {
        ln();
        log(`  ${yellow("Agent files missing (run `akrctx judge enable`):")}`);
        for (const f of result.missingFiles) log(`    ${minus()} ${file(f)}`);
      }
      if (!result.enabled) {
        ln();
        log(`  Run ${cmd("akrctx judge enable")} to activate.`);
      }
    },
  );

  // ── upgrade ───────────────────────────────────────────────────────────────
  addCommon(
    program
      .command("upgrade")
      .description("Update akrctx-owned harness files to the current CLI version.")
      .addHelpText(
        "after",
        [
          "",
          "Rewrites skill files, prompts, and instructions to the current CLI version.",
          "Protected files (AGENTS.md, CLAUDE.md, copilot-instructions.md) are never overwritten.",
          "",
          "Examples:",
          "  akrctx upgrade                    upgrade installed targets",
          "  akrctx upgrade --target codex     upgrade only codex harness files",
          "  akrctx upgrade --dry-run          preview what would change",
        ].join("\n"),
      ),
  ).action(async (raw) => {
    const options = { ...normalizeOptions(raw), force: true };
    const result = await runInit(options);
    printInit(result, options);
  });

  // ── remove ────────────────────────────────────────────────────────────────
  addCommon(
    program
      .command("remove")
      .description("Remove akrctx harness files for a target.")
      .addHelpText(
        "after",
        [
          "",
          "Without --force, shows a dry-run of what would be removed.",
          "Protected files (AGENTS.md, CLAUDE.md) are always skipped — remove them manually.",
          "",
          "Examples:",
          "  akrctx remove --target codex            dry-run: list what would be removed",
          "  akrctx remove --target codex --force    actually remove codex skill files",
          "  akrctx remove --all --force             remove .akrctx/ and all targets",
        ].join("\n"),
      ),
  )
    .option("--all", "remove .akrctx/ and all target files", false)
    .action(async (raw) => {
      const options = normalizeOptions(raw) as CommandOptions & { all?: boolean };
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
      if (result.protected.length > 0) {
        ln();
        log(`${dim("Protected (skipped — remove manually):")}`);
        for (const f of result.protected) log(`  ${gray(f)}`);
      }
      if (result.planned.length === 0 && result.protected.length === 0) {
        log(gray("Nothing to remove."));
      }
    });

  await program.parseAsync(argv);
}

function normalizeOptions(raw: Record<string, unknown>): CommandOptions {
  return {
    target: raw.target as TargetOption | undefined,
    workflow: raw.workflow as string | undefined,
    dryRun: Boolean(raw.dryRun),
    force: Boolean(raw.force),
    json: Boolean(raw.json),
    ci: Boolean(raw.ci),
    profile: raw.profile as Profile | undefined,
    nonInteractive: !process.stdin.isTTY || !process.stdout.isTTY,
    ...(raw.all !== undefined ? { all: Boolean(raw.all) } : {}),
  } as CommandOptions & { all?: boolean };
}

// ── Output formatters ─────────────────────────────────────────────────────────

const ln = () => console.log("");
const log = (s = "") => console.log(s);

function printInit(result: InitResult, options: CommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const verb = options.dryRun ? "Planned" : "Installed";
  const targetList = result.selectedTargets.map((t) => bold(t)).join(", ");
  log(`${bold(`${verb}:`)} akrctx → ${targetList}`);

  if (result.fallbackUsed) {
    log(gray("  No target specified and none detected — defaulted to codex."));
  }
  if (result.detection.detected.length > 0) {
    log(gray(`  Detected existing setup: ${result.detection.detected.join(", ")}`));
  }

  // Group writes by category.
  const created = result.writes.filter((w) => w.kind === "create");
  const updated = result.writes.filter((w) => w.kind === "update");
  const suggested = result.writes.filter((w) => w.kind === "suggest");
  const preserved = result.writes.filter((w) => w.kind === "preserve");

  if (created.length > 0) {
    ln();
    log(`  ${bold(`Created (${created.length} files):`)}`);
    printGroupedWrites(created);
  }
  if (updated.length > 0) {
    ln();
    log(`  ${bold(`Updated (${updated.length} files):`)}`);
    for (const w of updated) log(`    ${green("+")} ${file(w.path)}`);
  }
  if (suggested.length > 0) {
    ln();
    log(`  ${yellow(bold(`Suggested — review and merge (${suggested.length}):`))} `);
    for (const w of suggested) log(`    ${warn()} ${file(w.path)}`);
  }
  if (preserved.length > 0) {
    ln();
    log(`  ${dim(`Preserved unchanged (${preserved.length}): ${preserved.map((w) => w.path).join(", ")}`)}`);
  }

  // What's next.
  ln();
  log(rule());
  log(bold("  What's next"));
  ln();

  if (suggested.length > 0) {
    log("  An existing instruction file was preserved.");
    log(`  Ask your agent: ${gray('"Run akrctx doctor and compare the existing')}`);
    log(`                  ${gray('instructions with the .suggested file. Propose a merge."')}`);
  } else {
    log(`  ${bold("1.")} Open your agent in this repository.`);
    log(`  ${bold("2.")} Ask: ${gray('"Run akrctx doctor."')}`);
    log(gray("     It fills in .akrctx/wiki/ and gets ready for tasks."));
  }

  ln();
  log(`  ${bold("Normal coding flow")} ${dim("(agent-first, no CLI needed)")}`);
  log(`    Ask your agent: ${gray('"create X"')} or ${gray('"fix Y"')}`);
  log(gray("    → Agent creates the task capsule from your codebase, then implements."));

  ln();
  log(`  ${bold("CLI fallback")} ${dim("(scripts / CI / no agent)")}`);
  log(`    ${cmd('akrctx task "your task"')}  ${dim("— skeleton capsule")}`);
  log(`    ${cmd("akrctx compile TASK-001")}    ${dim("— generate agent brief")}`);

  ln();
  log(`  ${bold("Useful commands")}`);
  log(`    ${cmd("akrctx status")}         ${dim("— quick check")}`);
  log(`    ${cmd("akrctx doctor")}         ${dim("— full audit + readiness score")}`);
  log(`    ${cmd("akrctx judge enable")}   ${dim("— add optional judge subagent (Claude / Copilot / Codex)")}`);
  log(`    ${cmd("akrctx --help")}         ${dim("— full reference")}`);
  ln();
  log(rule());
}

/**
 * Group write results by top-level directory, collapsing multiple files
 * under the same dir into a single counted line.
 */
function printGroupedWrites(writes: WriteResult[]): void {
  const groups = new Map<string, string[]>();

  for (const w of writes) {
    const parts = w.path.split("/");
    const key = parts.length > 2 ? `${parts[0]}/${parts[1]}/` : parts[0];
    const existing = groups.get(key) ?? [];
    existing.push(w.path);
    groups.set(key, existing);
  }

  for (const [group, paths] of groups) {
    if (paths.length === 1) {
      log(`    ${plus()} ${file(paths[0])}`);
    } else {
      log(`    ${plus()} ${file(group)}  ${dim(`(${paths.length} files)`)}`);
    }
  }
}

function printDoctor(result: DoctorResult, options: CommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const bar = buildReadinessBar(result.readiness);
  log(`${bold("Readiness")}  ${bold(String(result.readiness))}/100  ${bar}`);
  ln();
  log(`  ${dim("Detected: ")} ${result.detectedTargets.length ? result.detectedTargets.join(", ") : gray("none")}`);
  log(
    `  ${dim("Installed:")} ${result.installedTargets.length ? bold(result.installedTargets.join(", ")) : gray("none")}`,
  );

  if (result.missing.length > 0) {
    ln();
    log(`  ${yellow(bold(`Missing (${result.missing.length}):`))} `);
    for (const m of result.missing) log(`    ${minus()} ${file(m)}`);
  }
  if (result.conflicts.length > 0) {
    ln();
    log(`  ${yellow(bold(`Pending merges (${result.conflicts.length}):`))} `);
    for (const c of result.conflicts) log(`    ${warn()} ${c}`);
  }
  if (result.suggestions.length > 0) {
    ln();
    log(`  ${bold("Suggestions:")}`);
    for (const s of result.suggestions) log(`    ${s}`);
  }

  const target = result.installedTargets[0] ?? result.detectedTargets[0];
  ln();
  if (target) {
    log(`  ${bold(`Suggested ${targetLabel(target)} prompt:`)}`);
    log(`  ${gray(`"${doctorPromptFor(target)}"`)}`);
  } else {
    log(gray('  Suggested: "Run akrctx doctor after installing a target harness."'));
  }
}

function printDoctorCi(result: DoctorResult, options: CommandOptions): void {
  const failures = doctorCiFailures(result);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ...result,
          ci: {
            passed: failures.length === 0,
            failureCount: failures.length,
            failures,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  if (failures.length === 0) {
    log(`${green("akrctx doctor CI passed")}`);
    log(`Readiness: ${result.readiness}/100`);
    log(`Installed targets: ${result.installedTargets.length ? result.installedTargets.join(", ") : "none"}`);
    return;
  }

  log(`${yellow("akrctx doctor CI failed")}`);
  log(`Readiness: ${result.readiness}/100`);

  if (result.missing.length > 0) {
    ln();
    log(`Missing (${result.missing.length}):`);
    for (const m of result.missing) log(`- ${m}`);
  }

  if (result.conflicts.length > 0) {
    ln();
    log(`Conflicts (${result.conflicts.length}):`);
    for (const c of result.conflicts) log(`- ${c}`);
  }

  if (result.suggestions.length > 0) {
    ln();
    log("Suggestions:");
    for (const s of result.suggestions) log(`- ${s}`);
  }
}

function doctorCiFailed(result: DoctorResult): boolean {
  return doctorCiFailures(result).length > 0;
}

function doctorCiFailures(result: DoctorResult): string[] {
  const failures: string[] = [];
  if (!result.installed) failures.push("akrctx is not installed.");
  if (result.installedTargets.length === 0) failures.push("No target adapter is installed.");
  if (result.missing.length > 0) failures.push(`${result.missing.length} required file(s) are missing.`);
  if (result.conflicts.length > 0) failures.push(`${result.conflicts.length} pending merge conflict(s) need review.`);

  const actionableSuggestions = result.suggestions.filter((suggestion) => !suggestion.startsWith("Setup is complete."));
  if (actionableSuggestions.length > 0)
    failures.push(`${actionableSuggestions.length} actionable suggestion(s) remain.`);

  return Array.from(new Set(failures));
}

/** Colored readiness bar: green when high, yellow mid, red low. */
function buildReadinessBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = "█".repeat(filled) + dim("░".repeat(empty));
  const colored = score >= 70 ? green(bar) : yellow(bar);
  return `[${colored}]`;
}

function printWriteGroup(label: string, values: string[]): void {
  if (values.length === 0) return;
  log(`${label} ${dim(`(${values.length})`)}:`);
  for (const value of values) log(`  ${value}`);
}

function targetLabel(target: Target): string {
  const labels: Record<Target, string> = {
    codex: "Codex",
    claude: "Claude Code",
    copilot: "GitHub Copilot",
    pi: "Pi Code",
  };
  return labels[target];
}

function doctorPromptFor(target: Target): string {
  const shared =
    "Run akrctx doctor. Inspect this repo's agent instructions and .akrctx wiki. Audit setup only; do not implement product features during doctor. Update .akrctx/wiki and propose instruction merges.";
  if (target === "pi") {
    return "Run the akrctx doctor workflow. Inspect this repo's Pi Code harness and .akrctx wiki. Audit setup only; do not implement product features. Update .akrctx/wiki and propose instruction merges.";
  }
  if (target === "claude") {
    return "Run the akrctx doctor skill. Inspect this repo's Claude Code harness and .akrctx wiki. Audit setup only; do not implement product features. Update .akrctx/wiki and propose instruction merges.";
  }
  if (target === "copilot") {
    return "Use the akrctx doctor prompt. Inspect this repo's Copilot instructions and .akrctx wiki. Audit setup only; do not implement product features. Update .akrctx/wiki and propose instruction merges.";
  }
  return shared;
}
