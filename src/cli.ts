import { Command, Option } from "commander";
import { runCompile } from "./compile.js";
import { readConfig, setConfigValue } from "./config.js";
import { runDoctor } from "./doctor.js";
import { runInit } from "./init.js";
import { runTask } from "./task.js";
import type { CommandOptions, DoctorResult, InitResult, Target, TargetOption } from "./types.js";

export async function main(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("contextforge")
    .description("Install and manage ContextForge agentic workflow harnesses.")
    .version("0.1.0");

  const addCommon = (command: Command, includeTarget = true) => {
    if (includeTarget) {
      command.addOption(new Option("--target <target>", "target agent").choices(["codex", "claude", "copilot", "pi", "all"]));
    }
    command.option("--dry-run", "show planned writes without writing files", false);
    command.option("--force", "update ContextForge-owned files when they already exist", false);
    command.option("--json", "print JSON output", false);
    return command;
  };

  addCommon(program.command("init").description("Install a ContextForge harness.")).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runInit(options);
    printInit(result, options);
  });

  addCommon(program.command("doctor").description("Audit the ContextForge setup.")).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await runDoctor(options);
    printDoctor(result, options);
  });

  const config = program.command("config").description("Show or update ContextForge project defaults.");

  addCommon(config.command("show").description("Print .contextforge/config.json."), false).action(async (raw) => {
    const options = normalizeOptions(raw);
    const result = await readConfig(process.cwd());
    if (!result) {
      throw new Error("ContextForge config not found. Run `contextforge init` first.");
    }
    console.log(JSON.stringify(result, null, 2));
  });

  addCommon(
    config.command("set").description("Set a ContextForge config default.").argument("<key>", "config key").argument("<value>", "config value"),
    false,
  ).action(async (key: string, value: string, raw) => {
    const options = normalizeOptions(raw);
    const result = await setConfigValue(process.cwd(), key, value, options.dryRun);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`${options.dryRun ? "Planned" : "Updated"} config ${key} = ${value}`);
  });

  addCommon(program.command("task").description("Create a ContextForge task capsule.").argument("<description>", "task description")).action(
    async (description: string, raw) => {
      const options = normalizeOptions(raw);
      const result = await runTask(description, options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`Created task capsule: ${result.taskDir}`);
      console.log(`Workflow: ${result.workflow}`);
      console.log(`Next: ask your configured agent to run the ContextForge task workflow for ${result.taskId}.`);
      console.log(`Headless fallback: \`contextforge compile ${result.taskId} --target codex\`.`);
    },
  ).option("--workflow <workflow>", "workflow: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD, or TDD+EDD");

  addCommon(program.command("compile").description("Compile a task capsule into a target brief.").argument("<taskId>", "task id")).action(
    async (taskId: string, raw) => {
      const options = normalizeOptions(raw) as CommandOptions & { target?: Target };
      if (options.target === "all") {
        throw new Error("compile requires a single target, not `all`.");
      }
      const result = await runCompile(taskId, options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`Compiled ${result.target} brief: ${result.outputPath}`);
    },
  );

  await program.parseAsync(argv);
}

function normalizeOptions(raw: Record<string, unknown>): CommandOptions {
  return {
    target: raw.target as TargetOption | undefined,
    workflow: raw.workflow as string | undefined,
    dryRun: Boolean(raw.dryRun),
    force: Boolean(raw.force),
    json: Boolean(raw.json),
    nonInteractive: !process.stdin.isTTY || !process.stdout.isTTY,
  };
}

function printInit(result: InitResult, options: CommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`${options.dryRun ? "Planned" : "Installed"} ContextForge target: ${result.target}`);
  if (result.fallbackUsed) {
    console.log("No target was selected interactively; defaulted to codex.");
  }
  console.log(`Detected: ${result.detection.detected.length ? result.detection.detected.join(", ") : "none"}`);
  printWriteGroup("Created", result.writes.filter((write) => write.kind === "create").map((write) => write.path));
  printWriteGroup("Updated", result.writes.filter((write) => write.kind === "update").map((write) => write.path));
  printWriteGroup("Suggested", result.writes.filter((write) => write.kind === "suggest").map((write) => write.path));
  printWriteGroup("Preserved", result.writes.filter((write) => write.kind === "preserve").map((write) => write.path));
  console.log("Next: run `contextforge doctor` or ask your chosen agent to run the ContextForge doctor workflow.");
}

function printDoctor(result: DoctorResult, options: CommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Agent readiness: ${result.readiness}/100`);
  console.log(`Detected targets: ${result.detectedTargets.length ? result.detectedTargets.join(", ") : "none"}`);
  console.log(`Installed targets: ${result.installedTargets.length ? result.installedTargets.join(", ") : "none"}`);
  printWriteGroup("Missing", result.missing);
  printWriteGroup("Human-approved merge needed", result.conflicts);
  printWriteGroup("Suggested safe next steps", result.suggestions);
  console.log('Suggested Codex prompt: "Run ContextForge doctor. Inspect this repo agent instructions and .contextforge wiki. Do not modify source code. Update only .contextforge/wiki and propose instruction merges."');
}

function printWriteGroup(label: string, values: string[]): void {
  if (values.length === 0) return;
  console.log(`${label}:`);
  for (const value of values) console.log(`+ ${value}`);
}
