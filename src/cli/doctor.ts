import type { Command } from "commander";
import { runDoctor } from "../doctor.js";
import { addCommon, doctorCiFailed, normalizeOptions, printDoctor, printDoctorCi } from "./shared.js";

export function registerDoctor(program: Command): void {
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
}
