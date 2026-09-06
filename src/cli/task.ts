import type { Command } from "commander";
import { bold, cmd, dim, file, gray, minus, warn, yellow } from "../format.js";
import { listTasks, removeTask, runTask, searchTaskCapsules, showTask } from "../task.js";
import { addCommon, ln, log, normalizeOptions, plus } from "./shared.js";

export function registerTask(program: Command): void {
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
        "  akrctx task search <query>       find literal text in capsule files",
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

  addCommon(
    taskCmd.command("search <query>").description("Search literal text in canonical task capsule files."),
    false,
  ).action(async (query: string, raw) => {
    const options = normalizeOptions(raw);
    const matches = await searchTaskCapsules(options.cwd ?? process.cwd(), query);
    if (options.json) {
      console.log(JSON.stringify(matches, null, 2));
      return;
    }
    if (!matches.length) {
      log(dim("No matching capsule lines."));
      return;
    }
    for (const match of matches) log(`${file(match.file)}:${match.line}  ${match.text}`);
  });

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
}

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
