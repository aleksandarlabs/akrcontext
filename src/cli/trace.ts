import type { Command } from "commander";
import { bold, cmd, dim, file, gray, green, minus, plus, yellow } from "../format.js";
import { runHook } from "../hook/index.js";
import { TRACE_MARKER, runTraceDisable, runTraceEnable, runTraceStatus } from "../hook/install.js";
import { runTraceReport } from "../hook/report.js";
import { addCommon, ln, log, normalizeOptions, readStdin } from "./shared.js";

export function registerTrace(program: Command): void {
  program
    .command("hook <event>", { hidden: true })
    .description("Internal: record a host hook event. Reads the payload on stdin.")
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
}
