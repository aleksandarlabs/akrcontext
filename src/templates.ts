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
export { claudeJudgeFile, copilotJudgeFile, codexJudgeFile, judgeFilePaths } from "./templates/judge.js";
export {
  claudeImplementerFile,
  copilotImplementerFile,
  codexImplementerFile,
  implementerFilePaths,
  implementerInstructions,
} from "./templates/implementer.js";
export { judgeContractFiles } from "./templates/judge-contract.js";
export { comprehensionFiles } from "./templates/comprehension.js";
export {
  claudeComprehensionAgentFile,
  codexComprehensionAgentFile,
  copilotComprehensionAgentFile,
  comprehensionFilePaths,
} from "./templates/comprehension-agent.js";
