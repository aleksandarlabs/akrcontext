import { evaluateAssertions } from "./assertions.mjs";
import { loadFixture, materializeFixture } from "./fixture.mjs";
import { executeStep } from "./process.mjs";
import { reportValue, summarizeStepResult } from "./safe-report.mjs";
import { validateScenario } from "./scenario.mjs";

export async function runScenario(rawScenario, options) {
  const scenario = validateScenario(rawScenario);
  const recipe = options.fixtureRecipe ?? (await loadFixture(options.repoRoot, scenario.fixture));
  const fixture = await materializeFixture(recipe, {
    tempRoot: options.tempRoot,
    keepWorkdir: options.keepWorkdir,
  });
  const stepResults = [];
  let assertionResults = [];
  let executionError;
  try {
    for (const step of scenario.steps) {
      stepResults.push(
        await executeStep(step, { fixtureRoot: fixture.root, cliEntry: options.cliEntry, env: options.env }),
      );
    }
    assertionResults = await evaluateAssertions(scenario.assertions, { fixtureRoot: fixture.root, stepResults });
  } catch (error) {
    executionError = error instanceof Error ? error.message : String(error);
  } finally {
    await fixture.cleanup();
  }
  const mechanism =
    !executionError &&
    assertionResults.length === scenario.assertions.length &&
    assertionResults.every((item) => item.passed)
      ? "pass"
      : "fail";
  return {
    id: scenario.id,
    title: scenario.title,
    changeType: scenario.changeType,
    hypothesis: scenario.hypothesis,
    mechanism,
    outcome: "inconclusive",
    outcomeMetric: scenario.outcome.metric,
    assertions: assertionResults,
    steps: stepResults.map(summarizeStepResult),
    ...(executionError ? { error: reportValue(executionError) } : {}),
    ...(options.keepWorkdir ? { workdir: fixture.root } : {}),
  };
}
