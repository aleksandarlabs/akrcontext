import type { AgentName, AgentTarget } from "../types.js";

/**
 * Rendering helpers shared by the three generated agent formats.
 *
 * The model is written where the host itself reads it, and the generated file names the
 * config path that controls it. Before this, the templates told the reader to hand-edit
 * the frontmatter — an edit the next `akrctx upgrade` overwrote.
 */

export const agentConfigPath = (name: AgentName, target: AgentTarget): string => `agents.${name}.model.${target}`;

/**
 * YAML frontmatter line for Claude Code and Copilot. Empty when no model is configured.
 *
 * Copilot names a model by display name — `Claude Opus 4.5`, `GPT-5 (copilot)` — so the
 * value is quoted whenever it carries anything a plain YAML scalar would mangle.
 */
export function frontmatterModel(model: string | undefined): string {
  if (!model) return "";
  return `model: ${/[\s:#'"[\]{},]/.test(model) ? JSON.stringify(model) : model}\n`;
}

/** TOML key for Codex. Empty when no model is configured. */
export function tomlModel(model: string | undefined): string {
  return model ? `model = ${JSON.stringify(model)}\n` : "";
}

/**
 * The closing section of every generated agent file. It states where the model comes from
 * so a reader who wants to change it edits the config rather than this file, which is
 * regenerated.
 */
export function modelSection(name: AgentName, target: AgentTarget, model: string | undefined): string {
  const key = agentConfigPath(name, target);
  const state = model
    ? `This file was generated with \`model: ${model}\`, from \`${key}\` in .akrctx/config.json.`
    : `This file was generated without a model field, so the host default applies. Set \`${key}\` in .akrctx/config.json to choose one.`;
  return `## Model

${state}

\`akrctx upgrade\` regenerates this file from the configuration, so a model added here by
hand does not survive. Change it with \`akrctx config set ${key} <model-id>\`. Model
identifiers are platform-specific and change over time: akrctx checks the shape and warns
about an unfamiliar one, but writes whatever you configure.`;
}
