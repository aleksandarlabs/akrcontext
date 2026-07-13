// Barrel re-export — keeps all existing import paths working while splitting
// the implementation into focused sub-modules.

export {
  configTemplate,
  defaultConfig,
  defaultPolicy,
  localComprehensionIgnoreTemplate,
  policyTemplate,
} from "./templates/defaults.js";
export {
  agentSetupTemplate,
  gapsTemplate,
  recommendationsTemplate,
  overviewTemplate,
  wikiFrontmatter,
  wikiTemplates,
  taskTemplateFiles,
  type GapSection,
} from "./templates/wiki.js";
export {
  targetReferenceTemplates,
  mainInstructionTemplate,
  codexSkills,
  claudeSkills,
  claudeCommands,
  copilotSkills,
  copilotFiles,
  piSkills,
  piFiles,
} from "./templates/instructions.js";
export { claudeJudgeFile, copilotJudgeFile, codexJudgeFile } from "./templates/judge.js";
export { comprehensionFiles } from "./templates/comprehension.js";
