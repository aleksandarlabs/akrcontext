import path from "node:path";
import { isDirectory } from "./fs-utils.js";
import {
  claudeComprehensionAgentFile,
  codexComprehensionAgentFile,
  comprehensionFilePaths,
  copilotComprehensionAgentFile,
} from "./templates/comprehension-agent.js";
import {
  claudeImplementerFile,
  codexImplementerFile,
  copilotImplementerFile,
  implementerFilePaths,
} from "./templates/implementer.js";
import { claudeJudgeFile, codexJudgeFile, copilotJudgeFile, judgeFilePaths } from "./templates/judge.js";
import {
  type AgentEntryConfig,
  type AgentName,
  type AgentTarget,
  type ResolvedAgent,
  type Target,
  agentNames,
  type akrctxConfig,
} from "./types.js";

/**
 * The `agents` block is the canonical configuration for akrctx agents, and this module is
 * the single place that resolves it.
 *
 * The three entries are fixed because each one's trustworthiness comes from a CLI contract
 * rather than from its prose — `judge verify --run-tests`, the comprehension schemas, and
 * the `akrctx impl` attempt store. An entry with no command behind it would be an agent
 * akrctx generates and cannot vouch for.
 */

export const DEFAULT_MAX_ATTEMPTS = 3;

export const agentTargets: AgentTarget[] = ["claude", "copilot", "codex"];

export const agentFilePaths: Record<AgentName, Record<AgentTarget, string>> = {
  judge: judgeFilePaths,
  comprehension: comprehensionFilePaths,
  implementer: implementerFilePaths,
};

type FileFactory = (model?: string) => Record<string, string>;

const agentFileFactories: Record<AgentName, Record<AgentTarget, FileFactory>> = {
  judge: { claude: claudeJudgeFile, copilot: copilotJudgeFile, codex: codexJudgeFile },
  comprehension: {
    claude: claudeComprehensionAgentFile,
    copilot: copilotComprehensionAgentFile,
    codex: codexComprehensionAgentFile,
  },
  implementer: { claude: claudeImplementerFile, copilot: copilotImplementerFile, codex: codexImplementerFile },
};

/** Triggers akrctx recognizes. Anything else is accepted and warned about, never rejected. */
export const knownTriggers: Record<AgentName, string[]> = {
  judge: ["post-implementation"],
  comprehension: ["agent-assessed-significance"],
  implementer: ["on-request", "post-clarification"],
};

const defaultTrigger: Record<AgentName, string> = {
  judge: "post-implementation",
  comprehension: "agent-assessed-significance",
  implementer: "on-request",
};

/**
 * Model identifiers are validated by pattern, not by a list.
 *
 * A list of names goes stale on every provider release and would make a new model unusable
 * until akrctx shipped a version that knew about it. A pattern does not expire, and a
 * mismatch is only ever a warning: akrctx does not have the provider's catalogue, so
 * refusing an unrecognized identifier would block a legitimate new model to catch a typo.
 */
export const modelPatterns: Record<AgentTarget, { pattern: RegExp; shape: string }> = {
  claude: {
    // https://code.claude.com/docs/en/model-config — a model alias, a full Anthropic model
    // name, or a provider-specific id: a Bedrock inference-profile ARN, a Mantle
    // `anthropic.*` id, a Vertex version name. Foundry deployment names are arbitrary and
    // will warn; that is the correct signal for an identifier akrctx cannot recognize.
    pattern:
      /^(claude-[a-z0-9][a-z0-9.@-]*|opus|sonnet|haiku|fable|default|inherit|best|opusplan(\[1m\])?|arn:aws:bedrock:[a-z0-9:/._-]+|(?:us|eu|apac|global)\.anthropic\.claude-[a-z0-9.:-]+|anthropic\.claude-[a-z0-9.:-]+)$/i,
    shape:
      "an alias (opus, sonnet, haiku, fable, opusplan, default, inherit), a full name like claude-opus-5, or a provider id such as a Bedrock ARN",
  },
  codex: {
    pattern: /^(gpt-[a-z0-9][a-z0-9.-]*|o[0-9][a-z0-9.-]*|codex-[a-z0-9.-]+)$/i,
    shape: "gpt-<version>, o<n>, or codex-<name> (for example gpt-5-codex)",
  },
  copilot: {
    // https://code.visualstudio.com/docs/agent-customization/custom-agents — Copilot names
    // a model by display name, optionally qualified by vendor: 'Claude Opus 4.5',
    // 'GPT-5.2', 'GPT-5 (copilot)'. Spaces are part of the identifier, so a "no spaces"
    // check would warn about every correctly written value.
    //
    // VS Code also accepts an array of fallbacks here, but the Copilot CLI rejects one
    // (github/copilot-cli#2133), so akrctx writes a single string — the form both read.
    pattern: /^(gpt|claude|gemini|grok|o[0-9])[a-z0-9. -]*(\s\([a-z0-9-]+\))?$/i,
    shape: 'a vendor model name, optionally qualified: "Claude Opus 4.5", "GPT-5.2", "GPT-5 (copilot)"',
  },
};

export function hasAgentFormat(target: Target): target is AgentTarget {
  return (agentTargets as Target[]).includes(target);
}

export function agentFiles(name: AgentName, target: AgentTarget, model?: string): Record<string, string> {
  return agentFileFactories[name][target](model);
}

/**
 * Warn when the agent file akrctx is about to write will not be discovered by the host.
 *
 * Claude Code watches `.claude/agents/` for live changes, but it does not watch a
 * directory that did not exist when the session started
 * (https://code.claude.com/docs/en/sub-agents). On a fresh install `enable` creates that
 * directory for the first time, so its agent stays unspawnable until the session
 * restarts — the failure this reports.
 *
 * Call this before writing the agent files. Afterwards the directory always exists and
 * the check reports nothing.
 *
 * A dry run reports nothing either. It writes no file, so the directory it would have
 * created still does not exist and no restart would make anything spawnable.
 */
export async function agentDiscoveryNotice(
  cwd: string,
  name: AgentName,
  targets: Target[],
  options: { dryRun?: boolean } = {},
): Promise<string | undefined> {
  if (options.dryRun) return undefined;
  if (!targets.includes("claude")) return undefined;
  const dir = path.posix.dirname(agentFilePaths[name].claude);
  if (await isDirectory(path.join(cwd, dir))) return undefined;
  return `Claude Code does not watch ${dir}/ in this session, because the directory did not exist when the session started. akrctx-${name} is not spawnable until you restart Claude Code. Sessions you start after this one pick it up automatically.`;
}

/** Every file path an agent can occupy, for path-only callers (doctor, remove, status). */
export function agentFilePathList(name: AgentName, targets: Target[] = agentTargets): string[] {
  return targets.filter(hasAgentFormat).map((target) => agentFilePaths[name][target]);
}

function legacyEntry(config: akrctxConfig, name: AgentName): AgentEntryConfig | undefined {
  if (name === "judge") {
    return config.judge ? { enabled: config.judge.enabled, trigger: config.judge.trigger } : undefined;
  }
  if (name === "comprehension") {
    return config.comprehensionGate
      ? { enabled: config.comprehensionGate.enabled, trigger: config.comprehensionGate.trigger }
      : undefined;
  }
  return config.impl ? { enabled: config.impl.enabled } : undefined;
}

/** The config path of the legacy key an agent maps onto, for divergence reporting. */
export const legacyPaths: Record<AgentName, string> = {
  judge: "judge",
  comprehension: "comprehensionGate",
  implementer: "impl",
};

/**
 * Resolve one agent from the canonical block, falling back to the legacy key.
 *
 * When both are present and disagree, `agents` wins. Silently honouring one of two
 * contradictory settings is the failure this block exists to remove, so the divergence is
 * reported by `agentWarnings` rather than resolved in silence.
 */
export function resolveAgent(config: akrctxConfig, name: AgentName): ResolvedAgent {
  const entry = config.agents?.[name];
  const legacy = legacyEntry(config, name);
  const configuredTargets = entry?.targets;
  const installed = config.targets.filter(hasAgentFormat);
  const targets = configuredTargets ? installed.filter((target) => configuredTargets.includes(target)) : installed;

  return {
    name,
    enabled: entry?.enabled ?? legacy?.enabled ?? false,
    trigger: entry?.trigger ?? legacy?.trigger ?? defaultTrigger[name],
    configuredTargets,
    targets,
    model: { ...(entry?.model ?? {}) },
    maxAttempts: entry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
  };
}

export function resolveAgents(config: akrctxConfig): Record<AgentName, ResolvedAgent> {
  return {
    judge: resolveAgent(config, "judge"),
    comprehension: resolveAgent(config, "comprehension"),
    implementer: resolveAgent(config, "implementer"),
  };
}

export interface AgentWarning {
  /** Null for a warning about the block itself rather than about one agent. */
  agent: AgentName | null;
  text: string;
}

/**
 * Everything akrctx has to say about an agent configuration without refusing to act on it.
 *
 * Every case here is a warning by design. The one error in the agents schema is
 * `maxAttempts`, which `normalizeAgents` rejects, because akrctx fully knows that domain
 * and an unparseable budget would otherwise resolve to "no limit".
 */
export function agentWarnings(config: akrctxConfig): AgentWarning[] {
  const warnings: AgentWarning[] = [];
  for (const key of Object.keys(config.agents ?? {})) {
    if ((agentNames as readonly string[]).includes(key)) continue;
    warnings.push({
      agent: null,
      text: `agents.${key} is not an agent akrctx generates, so it is ignored and left untouched. Recognized entries: ${agentNames.join(", ")}.`,
    });
  }
  for (const name of agentNames) {
    const entry = config.agents?.[name];
    const resolved = resolveAgent(config, name);
    const legacy = legacyEntry(config, name);

    if (entry?.enabled !== undefined && legacy?.enabled !== undefined && entry.enabled !== legacy.enabled) {
      warnings.push({
        agent: name,
        text: `agents.${name}.enabled (${entry.enabled}) and ${legacyPaths[name]}.enabled (${legacy.enabled}) disagree. agents.${name}.enabled is in effect (${resolved.enabled}).`,
      });
    }
    if (entry?.trigger !== undefined && legacy?.trigger !== undefined && entry.trigger !== legacy.trigger) {
      warnings.push({
        agent: name,
        text: `agents.${name}.trigger ("${entry.trigger}") and ${legacyPaths[name]}.trigger ("${legacy.trigger}") disagree. agents.${name}.trigger is in effect ("${resolved.trigger}").`,
      });
    }

    if (!knownTriggers[name].includes(resolved.trigger)) {
      warnings.push({
        agent: name,
        text: `agents.${name}.trigger is "${resolved.trigger}", which akrctx does not recognize. It is propagated as configured. Recognized values: ${knownTriggers[name].join(", ")}.`,
      });
    }

    for (const [target, model] of Object.entries(resolved.model) as Array<[AgentTarget, string]>) {
      const rule = modelPatterns[target];
      if (!rule || rule.pattern.test(model)) continue;
      warnings.push({
        agent: name,
        text: `agents.${name}.model.${target} is "${model}", which does not look like a ${target} model identifier (expected ${rule.shape}). akrctx writes it to the generated file as configured — check it if this was a typo.`,
      });
    }

    for (const target of resolved.configuredTargets ?? []) {
      if (target === "pi") {
        warnings.push({
          agent: name,
          text: `agents.${name}.targets lists pi, which has no agent format. Pi is supported for prompts and skills only; the agent file is skipped.`,
        });
        continue;
      }
      if (!config.targets.includes(target)) {
        warnings.push({
          agent: name,
          text: `agents.${name}.targets lists ${target}, which is not installed. It is skipped; agents.${name}.targets narrows the installed targets and never widens them.`,
        });
      }
    }

    if (resolved.enabled && config.targets.includes("pi") && !(resolved.configuredTargets ?? []).includes("pi")) {
      warnings.push({
        agent: name,
        text: `pi is installed but has no ${name} agent format, so no agent file is written for it. Claude Code, Codex, and Copilot are the supported agent hosts.`,
      });
    }
  }
  return warnings;
}

export function agentWarningTexts(config: akrctxConfig): string[] {
  return agentWarnings(config).map((warning) => warning.text);
}

/**
 * Write an agent setting to the canonical block, keeping an existing legacy key in step.
 *
 * The legacy key is mirrored rather than left stale on purpose: it is still what an older
 * akrctx reads, and leaving it contradicting the canonical value would put every install
 * that ran `enable` into permanent divergence. Divergence should mean somebody hand-edited
 * two sources of truth, which is what Doctor reports.
 */
export function withAgentSetting(config: akrctxConfig, name: AgentName, patch: AgentEntryConfig): akrctxConfig {
  const next: akrctxConfig = {
    ...config,
    agents: { ...(config.agents ?? {}), [name]: { ...(config.agents?.[name] ?? {}), ...patch } },
  };
  const resolved = resolveAgent(next, name);

  if (name === "judge" && config.judge) {
    next.judge = { ...config.judge, enabled: resolved.enabled, trigger: resolved.trigger };
  }
  if (name === "comprehension" && config.comprehensionGate) {
    next.comprehensionGate = {
      ...config.comprehensionGate,
      enabled: resolved.enabled,
      trigger: resolved.trigger,
    };
  }
  if (name === "implementer" && config.impl) {
    next.impl = { ...config.impl, enabled: resolved.enabled };
  }
  return next;
}
