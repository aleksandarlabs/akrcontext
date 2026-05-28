// Barrel re-export — keeps all existing import paths working while splitting
// the implementation into focused sub-modules.

export { configTemplate, defaultConfig, defaultPolicy, policyTemplate } from "./templates/defaults.js";
export { overviewTemplate, wikiTemplates, taskTemplateFiles } from "./templates/wiki.js";
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
