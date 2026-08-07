import type { Command } from "commander";
import { bold, dim, gray } from "../format.js";
import { type TemplateApplyResult, runTemplateApply, runTemplateStatus } from "../template-apply.js";
import { listBundledTemplatePacks } from "../template-pack.js";
import type { CommandOptions } from "../types.js";
import { addCommon, log, normalizeOptions, printTemplateApply } from "./shared.js";

export function registerTemplates(program: Command): void {
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
    printTemplateApply(result as TemplateApplyResult, options as CommandOptions);
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
}
