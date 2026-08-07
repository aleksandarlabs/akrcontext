import type { Command } from "commander";
import { runCompile } from "../compile.js";
import { bold, file } from "../format.js";
import type { CommandOptions, TargetOption } from "../types.js";
import { addCommon, log, normalizeOptions } from "./shared.js";

export function registerCompile(program: Command): void {
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
}
