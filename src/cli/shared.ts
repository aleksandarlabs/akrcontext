import { type Command, Option } from "commander";
import { bold, cmd, dim, file, gray, green, mark, minus, plus, rule, warn, yellow } from "../format.js";
import type { CommandOptions, DoctorResult, InitResult, Profile, Target, TargetOption, WriteResult } from "../types.js";

export const addCommon = (command: Command, includeTarget = true) => {
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

export function normalizeOptions(raw: Record<string, unknown>): CommandOptions {
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

export const ln = (): void => console.log("");
export const log = (s = ""): void => console.log(s);

export function printAgentModels(models: Array<{ target: string; model?: string; configPath: string }>): void {
  if (!models.length) return;
  ln();
  log(`  ${dim("Model per target:")}`);
  for (const entry of models) {
    const value = entry.model ? bold(entry.model) : gray("host default");
    log(`    ${entry.target}: ${value} ${dim(`← ${entry.configPath}`)}`);
  }
  log(`  ${dim("Change one with `akrctx config set agents.<agent>.model.<target> <model-id>`.")}`);
}

export function splitList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseValidation(entry: string): {
  command: string;
  status: "passed" | "failed" | "not-run";
  output: string;
} {
  const [command, status, ...rest] = entry.split("::");
  if (!command || !["passed", "failed", "not-run"].includes(status)) {
    throw new Error(`--validation expects \`command::passed|failed|not-run::output\`, got: "${entry}".`);
  }
  return { command: command.trim(), status: status as "passed" | "failed" | "not-run", output: rest.join("::") };
}

export function printAgentDiscoveryNotice(notice: string | undefined): void {
  if (!notice) return;
  ln();
  log(`  ${warn()} ${yellow(notice)}`);
}

export function printAgentWarnings(warnings: string[]): void {
  if (!warnings.length) return;
  ln();
  for (const text of warnings) log(`  ${warn()} ${yellow(text)}`);
}

export function printTemplateApply(
  result: {
    name: string;
    version: string;
    target: string;
    writes: WriteResult[];
    completed: boolean;
    conflicts: string[];
    pendingMerges: string[];
    policyWarnings: string[];
  },
  options: CommandOptions,
): void {
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
    for (const write of changed) log(`    ${mark(write.kind)} ${file(write.path)}`);
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

export function printInit(result: InitResult, options: CommandOptions): void {
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
  if (result.agentTargetWarnings.length > 0) {
    ln();
    log(`  ${yellow(bold(`Agent target narrowing (${result.agentTargetWarnings.length}):`))}`);
    for (const w of result.agentTargetWarnings) log(`    ${warn()} ${yellow(w)}`);
  }

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
  log(`    ${cmd("akrctx impl enable")}    ${dim("— add optional implementer subagent + attempt log")}`);
  log(`    ${cmd("akrctx --help")}         ${dim("— full reference")}`);
  ln();
  log(rule());
}

export function printGroupedWrites(writes: WriteResult[]): void {
  const groups = new Map<string, WriteResult[]>();

  for (const w of writes) {
    const parts = w.path.split("/");
    const key = parts.length > 2 ? `${parts[0]}/${parts[1]}/` : parts[0];
    const existing = groups.get(key) ?? [];
    existing.push(w);
    groups.set(key, existing);
  }

  for (const [group, entries] of groups) {
    if (entries.length === 1) {
      log(`    ${mark(entries[0].kind)} ${file(entries[0].path)}`);
      continue;
    }
    const kinds = new Set(entries.map((entry) => entry.kind));
    const marker = kinds.size === 1 ? mark(entries[0].kind) : dim("·");
    log(`    ${marker} ${file(group)}  ${dim(`(${entries.length} files)`)}`);
  }
}

export function printDoctor(result: DoctorResult, options: CommandOptions): void {
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
    log(`${bold("Suggestions:")}`);
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

export function printDoctorCi(result: DoctorResult, options: CommandOptions): void {
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

export function doctorCiFailed(result: DoctorResult): boolean {
  return doctorCiFailures(result).length > 0;
}

export function doctorCiFailures(result: DoctorResult): string[] {
  const failures: string[] = [];
  if (!result.installed) failures.push("akrctx is not installed.");
  if (result.installedTargets.length === 0) failures.push("No target adapter is installed.");
  if (result.missing.length > 0) failures.push(`${result.missing.length} required file(s) are missing.`);
  if (result.conflicts.length > 0) failures.push(`${result.conflicts.length} pending merge conflict(s) need review.`);

  const errorSuggestions = result.suggestions.filter((suggestion) => suggestion.severity === "error");
  if (errorSuggestions.length > 0) failures.push(`${errorSuggestions.length} actionable suggestion(s) remain.`);

  return Array.from(new Set(failures));
}

export function buildReadinessBar(score: number): string {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = "█".repeat(filled) + dim("░".repeat(empty));
  const colored = score >= 70 ? green(bar) : yellow(bar);
  return `[${colored}]`;
}

export function printWriteGroup(label: string, values: string[]): void {
  if (values.length === 0) return;
  log(`${label} ${dim(`(${values.length})`)}:`);
  for (const value of values) log(`  ${value}`);
}

export function targetLabel(target: Target): string {
  const labels: Record<Target, string> = {
    codex: "Codex",
    claude: "Claude Code",
    copilot: "GitHub Copilot",
    pi: "Pi Code",
  };
  return labels[target];
}

export function doctorPromptFor(target: Target): string {
  const shared =
    "Run `akrctx doctor` for deterministic checks, then use the `akrctx-doctor` skill to semantically audit this repo's agent instructions. Record instruction findings in .akrctx/wiki/instruction-audit.md. Audit setup only; do not implement product features. For pending instruction merges, show the exact minimal diff and ask for explicit approval in the current conversation.";
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

/**
 * Read the hook payload from stdin. Resolves to "" rather than rejecting on any failure.
 */
const STDIN_BUDGET_MS = 750;

export async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = "";
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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

// Re-export format helpers used by command modules so they can import from one place.
export { bold, cmd, dim, file, gray, green, mark, minus, plus, rule, warn, yellow };
