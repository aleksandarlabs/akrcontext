import type { Command } from "commander";
import { readConfig, setConfigValue } from "../config.js";
import { addCommon, normalizeOptions } from "./shared.js";

export function registerConfig(program: Command): void {
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
}
