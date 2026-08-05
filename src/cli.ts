import { Command, Option } from "commander";
import { runCompile } from "./compile.js";
import { runComprehensionDisable, runComprehensionEnable, runComprehensionStatus } from "./comprehension.js";
import { readConfig, setConfigValue } from "./config.js";
import { runDoctor } from "./doctor.js";
import { bold, cmd, dim, file, gray, green, minus, plus, rule, warn, yellow } from "./format.js";
import { runHook } from "./hook/index.js";
import { TRACE_MARKER, runTraceDisable, runTraceEnable, runTraceStatus } from "./hook/install.js";
import { runTraceReport } from "./hook/report.js";
import { runInit } from "./init.js";
import { createJudgeScope, verifyJudgeRecord } from "./judge-enforcement.js";
import { runJudgeDisable, runJudgeEnable, runJudgeStatus } from "./judge.js";
import { runRemove } from "./remove.js";
import { runStatus } from "./status.js";
import { listTasks, removeTask, runTask, showTask } from "./task.js";
import { type TemplateApplyResult, runTemplateApply, runTemplateStatus } from "./template-apply.js";
import { listBundledTemplatePacks } from "./template-pack.js";
import type { CommandOptions, DoctorResult, InitResult, Profile, Target, TargetOption, WriteResult } from "./types.js";
import { runUpgrade } from "./upgrade.js";
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
        "  akrctx comprehension enable                    enable understanding checkpoints",
        "",
        "Templates:",
        "  akrctx templates list                         list bundled template packs",
        "  akrctx init --target copilot --template NAME  install bundled template",
        "  akrctx templates apply NAME --target copilot  apply after initialization",
        "  akrctx templates status                       list applied template packs",
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
      .option("--template <name>", "apply a bundled enterprise template pack")
      .option("--template-pack <path>", "apply a target-relative enterprise template pack")
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
          "  6. Applies a template pack when --template-pack is provided.",
          "  7. Preserves any existing AGENTS.md / CLAUDE.md (writes .suggested instead).",
          "",
          "Run akrctx doctor after init to finish setup with your agent.",
        ].join("\n"),
      ),
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    if (options.force) {
      console.warn(
        "Warning: --force is set. akrctx-owned files will be overwritten.\n" +
          "         Protected root instructions (including .pi/README.md) are never overwritten.",
      );
    }
    const result = await runInit(options);
    printInit(result, options);
  });

  // ── templates ─────────────────────────────────────────────────────────────
  const templates = program.command("templates").description("List and apply akrctx template packs.");

  addCommon(templates.command("list").description("List bundled template packs."), false).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await listBundledTemplatePacks();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.length === 0) {
      log(gray("No bundled template packs found."));
      return;
    }

    log(bold("Available templates:"));
    for (const template of result) {
      log(`  ${template.name} ${dim(`v${template.version}`)}`);
    }
  });

  addCommon(
    templates
      .command("apply")
      .description("Safely apply a template pack to an initialized project.")
      .argument("<template>", "bundled template name or local path with --local")
      .option("--local", "load <template> as a local template-pack path", false)
      .addHelpText(
        "after",
        [
          "",
          "Examples:",
          "  akrctx templates apply company-base",
          "  akrctx templates apply ./company-template --local --target copilot",
          "  akrctx templates apply security-rules --dry-run",
          "",
          "Existing project files are preserved. Blocking conflicts produce versioned",
          "candidates under .akrctx/template-candidates/. Root instructions use the",
          "normal .akrctx.suggested.md + human-approved Doctor merge workflow.",
        ].join("\n"),
      ),
  ).action(async (templateRef: string, raw) => {
    const options = normalizeOptions(raw);
    const result = await runTemplateApply({ ...options, templateRef, local: Boolean(raw.local) });
    printTemplateApply(result, options);
    if (!result.completed) process.exitCode = 1;
  });

  addCommon(templates.command("status").description("List template packs applied to this project."), false).action(
    async (raw) => {
      const options = normalizeOptions(raw);
      const result = await runTemplateStatus(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (!result.installed) {
        log(gray("akrctx is not installed. Run `akrctx init` first."));
        return;
      }
      if (result.templates.length === 0) {
        log(gray("No template packs have been recorded."));
        return;
      }
      log(bold("Applied templates:"));
      for (const template of result.templates) {
        log(`  ${template.name} ${dim(`v${template.version}`)} ${gray(`[${template.source}]`)}`);
        log(`    targets: ${template.targets.join(", ")}`);
      }
    },
  );

  // ── doctor ────────────────────────────────────────────────────────────────
  addCommon(
    program
      .command("doctor")
      .description("Mechanically audit akrctx readiness and write generated reports to .akrctx/wiki/.")
      .option("--ci", "fail with exit code 1 when the harness is incomplete or has actionable issues", false)
      .option("--fix", "automatically recreate missing files and repair config/policy gaps", false)
      .addHelpText(
        "after",
        [
          "",
          "Doctor checks:",
          "  - The CLI performs deterministic setup checks; the installed Doctor skill performs semantic instruction review.",
          "  - Whether akrctx is installed.",
          "  - Which target adapters are present.",
          "  - Which required files are missing.",
          "  - Whether protected files have pending merge suggestions.",
          "  - Config completeness.",
          "",
          "Use --fix to recreate missing files and repair config/policy gaps automatically.",
          "Protected instructions remain read-only until the agent shows an exact diff and receives explicit human approval in the current conversation.",
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
    log(`${bold("Comprehension:")} ${result.comprehensionGate}`);

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
        "config key (defaultWorkflow | defaultTarget | allowedWorkflows | requireTaskCapsule | requireWorkflowReason | contextBudget)",
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
  const taskCmd = program
    .command("task")
    .description("Create, list, show, or remove akrctx task capsules.")
    .addHelpText(
      "after",
      [
        "",
        "Subcommands:",
        "  akrctx task <description>        create a new task capsule",
        "  akrctx task list                 list existing task capsules",
        "  akrctx task show TASK-001        show a task capsule's files",
        "  akrctx task rm TASK-001          remove a task capsule",
        "",
        "The create command is a HEADLESS FALLBACK for scripting and CI.",
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
    );

  addCommon(
    taskCmd
      .command("create [description]", { isDefault: true })
      .description("Create a akrctx task capsule for the given description.")
      .option(
        "--workflow <workflow>",
        "override workflow: fast-patch | research-first | SDD | TDD | EDD | SDD+TDD | SDD+EDD | TDD+EDD",
      ),
  ).action(async (description: string | undefined, raw) => {
    if (!description) {
      taskCmd.help();
      return;
    }
    await handleTaskCreate(description, raw);
  });

  addCommon(taskCmd.command("list").description("List existing akrctx task capsules."), false).action(async (raw) => {
    const options = normalizeOptions(raw);
    const cwd = options.cwd ?? process.cwd();
    const tasks = await listTasks(cwd);
    if (options.json) {
      console.log(JSON.stringify(tasks, null, 2));
      return;
    }
    if (!tasks.length) {
      log(dim("No task capsules found."));
      return;
    }
    log(bold("Task capsules:"));
    for (const task of tasks) {
      log(`  ${file(task.taskId)}  ${task.description ? dim(task.description) : dim("(no description)")}`);
    }
  });

  addCommon(taskCmd.command("show <taskId>").description("Show the contents of a task capsule."), false).action(
    async (taskId: string, raw) => {
      const options = normalizeOptions(raw);
      const cwd = options.cwd ?? process.cwd();
      const result = await showTask(cwd, taskId);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      log(`${bold("Task:")} ${file(result.taskId)}`);
      log(`${bold("Workflow:")} ${result.workflow ?? dim("unknown")}`);
      ln();
      for (const [name, content] of Object.entries(result.files)) {
        log(`${bold(name)}`);
        log(content);
        ln();
      }
    },
  );

  addCommon(taskCmd.command("rm <taskId>").description("Remove a task capsule."), false).action(
    async (taskId: string, raw) => {
      const options = normalizeOptions(raw);
      const cwd = options.cwd ?? process.cwd();
      const result = await removeTask(cwd, taskId, options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      if (options.dryRun) {
        log(`${warn()} ${yellow("Would remove")} ${file(result.taskDir)}`);
        return;
      }
      log(`${minus()} ${file(result.taskDir)}`);
    },
  );

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
    const compileOptions = options as CommandOptions & { target?: TargetOption };
    const result = await runCompile(taskId, compileOptions);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (Array.isArray(result)) {
      log(`${bold("Compiled briefs:")}`);
      for (const r of result) log(`  ${r.target}: ${file(r.outputPath)}`);
    } else {
      console.log(`Compiled (${result.target}): ${result.outputPath}`);
    }
  });

  // ── comprehension ─────────────────────────────────────────────────────────
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
    for (const write of result.writes) log(`  ${plus()} ${file(write.path)}`);
    if (result.skippedTargets.length) {
      log(`  ${dim(`Skipped (no native independent agent): ${result.skippedTargets.join(", ")}`)}`);
    }
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
    false,
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runJudgeEnable(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const verb = options.dryRun ? "Would install" : "Installed";
    log(`${bold("Judge:")} ${options.dryRun ? yellow("would enable (dry-run)") : green("enabled")}`);
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

  judge
    .command("scope")
    .description("Compute the deterministic task and code boundary a judge must review.")
    .argument("<task-id>", "task capsule ID, for example TASK-001")
    .requiredOption("--base <ref>", "base Git commit or ref")
    .option("--candidate <ref>", "candidate Git commit/ref, or WORKTREE", "WORKTREE")
    .option("--json", "emit the scope block to copy into the review record", false)
    .action(async (taskId: string, raw: Record<string, unknown>) => {
      const options = normalizeOptions(raw);
      const scope = await createJudgeScope(
        options.cwd ?? process.cwd(),
        taskId,
        raw.base as string,
        raw.candidate as string,
      );
      if (options.json) {
        console.log(JSON.stringify(scope, null, 2));
        return;
      }
      log(`${bold("Judge scope:")} ${scope.taskId}`);
      ln();
      log(`  ${dim("base")}       ${scope.base} ${dim(`(${scope.baseCommit.slice(0, 12)})`)}`);
      log(`  ${dim("candidate")}  ${scope.candidate} ${dim(`(${scope.candidateCommit.slice(0, 12)})`)}`);
      log(`  ${dim("akrctx")}     v${scope.cliVersion}`);
      log(`  ${dim("task")}       ${scope.taskDigest}`);
      log(`  ${dim("change")}     ${scope.changeDigest}`);
      log(`  ${dim("scope")}      ${scope.scopeDigest}`);
      ln();
      log(`  ${dim(`Changed files (${scope.changedFiles.length}):`)}`);
      for (const f of scope.changedFiles) log(`    ${file(f)}`);
      if (scope.excludedPaths.length) {
        ln();
        log(`  ${yellow(`Withheld by policy.json — not read, not fingerprinted (${scope.excludedPaths.length}):`)}`);
        for (const f of scope.excludedPaths) log(`    ${minus()} ${file(f)}`);
      }
      ln();
      log(`  ${dim("Run with")} ${cmd("--json")} ${dim("to emit the scope block for the review record.")}`);
    });

  judge
    .command("verify")
    .description("Verify that a judge review is APPROVED and still matches the repository.")
    .argument("<review-file>", "path to the judge review JSON")
    .option("--json", "emit JSON output", false)
    .option("--run-tests", "re-run the capsule-declared commands the record claims passed", false)
    .addHelpText(
      "after",
      [
        "",
        "Without --run-tests, a passing validation is taken from the record on trust.",
        "With it, this CLI re-executes those commands itself, fails if any fails, and",
        "fails if running them moved the reviewed boundary.",
        "",
        "Only commands declared in a fenced block under `## Validation` in the",
        "capsule's task.md are ever executed, so a review record cannot get an",
        "arbitrary command run. The capsule itself is usually written by an agent,",
        "so this moves trust from the record to task.md rather than removing it.",
        "Read task.md before using this on work you did not supervise.",
      ].join("\n"),
    )
    .action(async (reviewFile: string, raw: Record<string, unknown>) => {
      const options = normalizeOptions(raw);
      const runTests = Boolean(raw.runTests);
      const result = await verifyJudgeRecord(options.cwd ?? process.cwd(), reviewFile, { runTests });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.approved) {
          log(`${bold("Judge verification:")} ${green("APPROVED and current")}`);
          log(`  ${dim(result.scopeDigest ?? "")}`);
        } else {
          log(`${bold("Judge verification:")} ${yellow("INVALID")}`);
          for (const reason of result.reasons) log(`  ${minus()} ${reason}`);
        }
        for (const run of result.reexecuted) {
          log(`  ${run.passed ? plus() : minus()} ${dim("re-ran")} ${cmd(run.command)}`);
        }
        if (result.reexecuted.length) {
          log(`  ${dim("Commands came from the capsule's task.md `## Validation` block.")}`);
        }
        if (!runTests && result.declaredCommands.length) {
          ln();
          log(`  ${dim("Validation was taken on trust. Re-run it here with")} ${cmd("--run-tests")}${dim(".")}`);
        }
      }
      if (!result.approved) process.exitCode = 1;
    });

  // ── hook (hidden) ─────────────────────────────────────────────────────────
  // Invoked by the host, never by a human. Reads the event payload on stdin.
  //
  // This command must never exit non-zero: on Copilot a non-zero exit from preToolUse
  // denies the tool call, so a crash here would block every tool call in the session.
  program
    .command("hook <event>", { hidden: true })
    .description("Internal: record a host hook event. Reads the payload on stdin.")
    // The marker is declared so it is never an unknown option, and unknown options and
    // excess arguments are tolerated too: commander rejects them with exit 1, which on
    // Copilot's preToolUse denies the tool call before runHook is ever reached.
    .option(`${TRACE_MARKER} `.trim(), "marks this entry as owned by akrctx")
    .option("--akrctx-host <target>", "which agent host produced this event")
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async (event: string, raw: Record<string, unknown>) => {
      const host = typeof raw.akrctxHost === "string" ? raw.akrctxHost : undefined;
      const result = await runHook(event, await readStdin(), process.cwd(), { host }).catch(() => undefined);
      if (result?.body) console.log(JSON.stringify(result.body));
      process.exitCode = 0;
    });

  // ── trace ─────────────────────────────────────────────────────────────────
  const trace = program
    .command("trace")
    .description("Record and report whether the harness contract was honored in a session.")
    .addHelpText(
      "after",
      [
        "",
        "Tracing is opt-in and observes only — it never blocks or injects anything.",
        "Records live in .akrctx/local/traces/, which is already git-ignored.",
        "",
        "  akrctx trace enable     wire the hooks for installed targets",
        "  akrctx trace status     show what is wired and how many sessions were recorded",
        "  akrctx trace report     derive the contract predicates from the recorded sessions",
        "  akrctx trace disable    remove only the akrctx hook entries",
      ].join("\n"),
    );

  addCommon(trace.command("enable").description("Start recording sessions for installed targets."), false).action(
    async (raw) => {
      const options = normalizeOptions(raw);
      const result = await runTraceEnable(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      log(`${bold("Trace:")} ${options.dryRun ? yellow("would enable (dry-run)") : green("enabled")}`);
      for (const write of result.writes) log(`  ${plus()} ${file(write)}`);
      ln();
      // Every host, Pi included, is wired to an absolute interpreter and entry point, so
      // nothing here depends on PATH.
      log(`  ${dim("Pinned to this build; PATH is not consulted.")}`);
      log(`  ${dim("Nothing is blocked or injected; this only records.")}`);
    },
  );

  addCommon(trace.command("disable").description("Stop recording and remove akrctx hook entries."), false).action(
    async (raw) => {
      const options = normalizeOptions(raw);
      const result = await runTraceDisable(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      log(`${bold("Trace:")} ${yellow("disabled")}`);
      for (const write of result.writes) log(`  ${minus()} ${file(write)}`);
      log(`  ${dim("Existing trace records were kept. Delete .akrctx/local/traces/ to discard them.")}`);
    },
  );

  addCommon(trace.command("status").description("Show what is wired and how much has been recorded."), false).action(
    async (raw) => {
      const options = normalizeOptions(raw);
      const result = await runTraceStatus(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      log(`${bold("Trace:")} ${result.enabled ? green("enabled") : yellow("disabled")}`);
      log(`  ${dim("Wired:    ")} ${result.wiredTargets.length ? result.wiredTargets.join(", ") : gray("none")}`);
      if (result.unwiredTargets.length) {
        log(`  ${dim("Not wired:")} ${gray(result.unwiredTargets.join(", "))}`);
      }
      log(`  ${dim("Sessions: ")} ${result.traceCount}`);
      if (result.unverified.length) {
        ln();
        log(`  ${yellow("Wired from vendor documentation, not from an observed run:")}`);
        log(`    ${result.unverified.join(", ")}`);
        log(`  ${dim("Treat these as unverified until a conformance run exercises them.")}`);
      }
    },
  );

  addCommon(
    trace
      .command("report")
      .description("Derive the contract predicates from the recorded sessions.")
      .addHelpText(
        "after",
        [
          "",
          "Reports two candidate definitions of an active capsule side by side:",
          "  bound          a capsule was read or written at some point",
          "  bound-first    a capsule was bound before the first mutating write",
          "",
          "They differ on resumed work, which is why both are measured before either",
          "is used to block anything.",
        ].join("\n"),
      ),
    false,
  ).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runTraceReport(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const { totals } = result;
    if (totals.sessions === 0) {
      log(gray("No sessions recorded yet. Run `akrctx trace enable`, then use your agent normally."));
      return;
    }
    log(
      `${bold("Sessions recorded:")} ${totals.sessions}${totals.incomplete ? dim(` (${totals.incomplete} truncated, excluded)`) : ""}`,
    );
    log(`${bold("Sessions that changed anything outside .akrctx/:")} ${totals.mutating}`);
    if (totals.orderingUnknown > 0) {
      log(
        `${bold("First-mutation ordering unknown:")} ${totals.orderingUnknown} ${dim("(their known mutation, capsule, and validation evidence remain counted)")}`,
      );
    }
    // This bucket has no known mutation and is distinct from mutating sessions whose
    // first-mutation ordering alone is unknown.
    if (totals.uncertain > 0) {
      log(
        `${bold("Sessions with no known mutation but possible change:")} ${totals.uncertain} ${dim("(a shell command or an unresolved write could have changed the tree)")}`,
      );
    }
    ln();
    const pct = (value: number) => (totals.mutating ? `${Math.round((value / totals.mutating) * 100)}%` : "n/a");
    const orderingPct = () => {
      if (totals.orderingKnown > 0) {
        return `${Math.round((totals.capsuleBeforeFirstMutation / totals.orderingKnown) * 100)}% of ${totals.orderingKnown} known`;
      }
      return totals.orderingUnknown > 0 ? "unknown" : "n/a";
    };
    log(
      `  ${dim("capsule bound              ")} ${totals.capsuleBound} ${dim(`(${pct(totals.capsuleBound)} of those)`)}`,
    );
    log(`  ${dim("capsule bound first       ")} ${totals.capsuleBeforeFirstMutation} ${dim(`(${orderingPct()})`)}`);
    log(`  ${dim("capsule complete          ")} ${totals.capsuleComplete} ${dim(`(${pct(totals.capsuleComplete)})`)}`);
    log(
      `  ${dim("validation declared       ")} ${totals.validationDeclared} ${dim(`(${pct(totals.validationDeclared)})`)}`,
    );
    log(
      `  ${dim("validation observed       ")} ${totals.validationObserved} ${dim(`(${pct(totals.validationObserved)})`)}`,
    );
    log(`  ${dim("blocked path touched      ")} ${totals.blockedPathTouched}`);
    ln();
    log(`  ${dim("Run with")} ${cmd("--json")} ${dim("for the per-session records.")}`);
  });

  // ── upgrade ───────────────────────────────────────────────────────────────
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
      for (const write of changed) log(`  ${plus()} ${file(write.path)}`);
    }
    if (suggestions.length) {
      ln();
      log(`  ${yellow("Preserved files with upgrade candidates:")}`);
      for (const write of suggestions) log(`    ${warn()} ${file(write.path)}`);
    }
    ln();
    if (result.obsolete.length) {
      log(yellow(`  ${result.obsolete.length} obsolete managed file(s) were preserved for manual review.`));
    }
    if (result.installationComplete) {
      log(green(options.dryRun ? "  Upgrade can complete safely." : "  Upgrade completed safely."));
    } else if (result.completed) {
      log(yellow("  Selected targets updated; run upgrade for all installed targets to advance installedVersion."));
    } else {
      log(yellow(`  Upgrade incomplete: resolve ${result.conflicts.length} managed-file conflict(s) and rerun.`));
    }
    if (!result.completed) process.exitCode = 1;
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
        ln();
        log(`${dim("Protected (skipped — remove manually):")}`);
        for (const f of result.protected) log(`  ${gray(f)}`);
      }
      if (result.planned.length === 0 && result.updated.length === 0 && result.protected.length === 0) {
        log(gray("Nothing to remove."));
      }
    });

  await program.parseAsync(argv);
}

/** Shared handler for `task create <description>` and `task <description>`. */
async function handleTaskCreate(description: string, raw: Record<string, unknown>): Promise<void> {
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
}

/**
 * Read the hook payload from stdin. Resolves to "" rather than rejecting on any failure.
 *
 * The cap has to sit under the tightest budget any host imposes — Claude Code's SessionEnd
 * hooks share 1.5s — so it is well below that rather than merely below the generous
 * per-hook defaults. Resolving is not enough on its own: an open pipe keeps the event loop
 * alive and the process outlives the promise, so stdin is torn down explicitly on every
 * exit path. Timing out is a safety net for a host that never closes the pipe, not the
 * normal path, which ends on `end`.
 */
const STDIN_BUDGET_MS = 750;

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Stop the stream from holding the process open past the resolved promise.
      process.stdin.pause();
      process.stdin.destroy();
      resolve(data);
    };
    const timer = setTimeout(done, STDIN_BUDGET_MS);
    timer.unref?.();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      done();
    });
  });
}

function normalizeOptions(raw: Record<string, unknown>): CommandOptions {
  return {
    target: raw.target as TargetOption | undefined,
    workflow: raw.workflow as string | undefined,
    dryRun: Boolean(raw.dryRun),
    force: Boolean(raw.force),
    json: Boolean(raw.json),
    ci: Boolean(raw.ci),
    fix: Boolean(raw.fix),
    profile: raw.profile as Profile | undefined,
    template: raw.template as string | undefined,
    templatePack: raw.templatePack as string | undefined,
    nonInteractive: !process.stdin.isTTY || !process.stdout.isTTY,
    ...(raw.all !== undefined ? { all: Boolean(raw.all) } : {}),
  } as CommandOptions & { all?: boolean };
}

// ── Output formatters ─────────────────────────────────────────────────────────

const ln = () => console.log("");
const log = (s = "") => console.log(s);

function printTemplateApply(result: TemplateApplyResult, options: CommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const verb = options.dryRun ? "Template plan" : result.completed ? "Template applied" : "Template blocked";
  log(`${bold(`${verb}:`)} ${result.name} ${dim(`v${result.version}`)} → ${bold(result.target)}`);

  const changed = result.writes.filter((write) => write.kind === "create" || write.kind === "update");
  const suggested = result.writes.filter((write) => write.kind === "suggest");
  if (changed.length > 0) {
    ln();
    log(`  ${green(bold(`Written (${changed.length}):`))}`);
    for (const write of changed) log(`    ${plus()} ${file(write.path)}`);
  }
  if (suggested.length > 0) {
    ln();
    log(`  ${yellow(bold(`Candidates (${suggested.length}):`))}`);
    for (const write of suggested) log(`    ${warn()} ${file(write.path)}`);
  }
  if (result.conflicts.length > 0) {
    ln();
    log(`  ${yellow(bold("Blocking conflicts:"))}`);
    for (const conflict of result.conflicts) log(`    ${warn()} ${file(conflict)}`);
    log(dim("  Merge the versioned candidates, then rerun the same command."));
  }
  if (result.pendingMerges.length > 0) {
    ln();
    log(`  ${yellow(bold("Human-approved instruction merges pending:"))}`);
    for (const pending of result.pendingMerges) log(`    ${warn()} ${file(pending)}`);
    log(dim("  Run Doctor; the agent must show the exact diff and receive approval before editing."));
  }
  if (result.policyWarnings.length > 0) {
    ln();
    log(`  ${yellow(bold("Policy warnings:"))}`);
    for (const warning of result.policyWarnings) log(`    ${warn()} ${warning}`);
  }
}

function printInit(result: InitResult, options: CommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const verb = options.dryRun ? "Planned" : "Installed";
  const targetList = result.selectedTargets.map((t) => bold(t)).join(", ");
  log(`${bold(`${verb}:`)} akrctx → ${targetList}`);

  if (result.detection.detected.length > 0) {
    log(gray(`  Detected existing setup: ${result.detection.detected.join(", ")}`));
  }
  if (result.policyWarnings.length > 0) {
    ln();
    log(`  ${yellow(bold(`Policy weakened by template pack (${result.policyWarnings.length}):`))}`);
    for (const w of result.policyWarnings) log(`    ${warn()} ${yellow(w)}`);
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

  const overwrittenWithLocalEdits = updated.filter((w) => w.reason === "overwritten (had local modifications)");
  if (overwrittenWithLocalEdits.length > 0) {
    ln();
    log(
      `  ${yellow(bold(`Overwritten files had local edits — review with git diff (${overwrittenWithLocalEdits.length}):`))}`,
    );
    for (const w of overwrittenWithLocalEdits) log(`    ${warn()} ${file(w.path)}`);
  }

  // What's next.
  ln();
  log(rule());
  log(bold("  What's next"));
  ln();

  if (suggested.length > 0) {
    log("  An existing instruction file was preserved.");
    log(`  Ask your agent: ${gray('"Run akrctx doctor and compare the existing')}`);
    log(`                  ${gray("instructions with the .suggested file. Show the exact minimal")}`);
    log(`                  ${gray('diff and ask for approval before applying it."')}`);
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
  log(`    ${cmd("akrctx comprehension enable")} ${dim("— enable understanding checkpoints")}`);
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
  if (result.fixed && result.fixed.length > 0) {
    ln();
    log(`  ${green(bold(`Fixed (${result.fixed.length}):`))} `);
    for (const f of result.fixed) log(`    ${plus()} ${file(f)}`);
  }
  if (result.conflicts.length > 0) {
    ln();
    log(`  ${yellow(bold(`Pending merges (${result.conflicts.length}):`))} `);
    for (const c of result.conflicts) log(`    ${warn()} ${c}`);
  }
  if (result.suggestions.length > 0) {
    ln();
    log(`  ${bold("Suggestions:")}`);
    for (const s of result.suggestions) log(`    ${s.text}`);
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
    for (const s of result.suggestions) log(`- [${s.severity}] ${s.text}`);
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

  const errorSuggestions = result.suggestions.filter((suggestion) => suggestion.severity === "error");
  if (errorSuggestions.length > 0) failures.push(`${errorSuggestions.length} actionable suggestion(s) remain.`);

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
    "Run `akrctx doctor` for deterministic checks, then use the `akrctx-doctor` skill to semantically audit this repo's agent instructions. Record instruction findings in .akrctx/wiki/instruction-audit.md. Audit setup only; do not implement product features. For pending instruction merges, show the exact minimal diff and ask for explicit approval before editing the protected file.";
  if (target === "pi") {
    return "Run `akrctx doctor` for deterministic checks, then use the `akrctx-doctor` skill to semantically audit this repo's Pi Code harness. Record instruction findings in .akrctx/wiki/instruction-audit.md. Audit setup only; do not implement product features. Show the exact minimal diff and ask for explicit approval before editing a protected instruction.";
  }
  if (target === "claude") {
    return "Run `akrctx doctor` for deterministic checks, then use the `akrctx-doctor` skill to semantically audit this repo's Claude Code harness. Record instruction findings in .akrctx/wiki/instruction-audit.md. Audit setup only; do not implement product features. Show the exact minimal diff and ask for explicit approval before editing a protected instruction.";
  }
  if (target === "copilot") {
    return "Run `akrctx doctor` for deterministic checks, then use the akrctx Doctor prompt and skill to semantically audit this repo's Copilot instructions. Record instruction findings in .akrctx/wiki/instruction-audit.md. Audit setup only; do not implement product features. Show the exact minimal diff and ask for explicit approval before editing a protected instruction.";
  }
  return shared;
}
