import { Command } from "commander";
import { registerCompile } from "./cli/compile.js";
import { registerComprehension } from "./cli/comprehension.js";
import { registerConfig } from "./cli/config.js";
import { registerDoctor } from "./cli/doctor.js";
import { registerImpl } from "./cli/impl.js";
import { registerInit } from "./cli/init.js";
import { registerJudge } from "./cli/judge.js";
import { registerRemove } from "./cli/remove.js";
import { registerStatus } from "./cli/status.js";
import { registerTask } from "./cli/task.js";
import { registerTemplates } from "./cli/templates.js";
import { registerTrace } from "./cli/trace.js";
import { registerUpgrade } from "./cli/upgrade.js";
import { CLI_VERSION } from "./version.js";

export function buildProgram(): Command {
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
        "  akrctx impl enable                             enable the implementer subagent",
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

  registerInit(program);
  registerTemplates(program);
  registerDoctor(program);
  registerStatus(program);
  registerConfig(program);
  registerTask(program);
  registerCompile(program);
  registerComprehension(program);
  registerImpl(program);
  registerJudge(program);
  registerTrace(program);
  registerUpgrade(program);
  registerRemove(program);

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}
