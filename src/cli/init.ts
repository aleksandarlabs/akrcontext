import type { Command } from "commander";
import { Option } from "commander";
import { runInit } from "../init.js";
import { addCommon, normalizeOptions, printInit } from "./shared.js";

export function registerInit(program: Command): void {
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
}
