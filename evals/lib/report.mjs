import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function redact(value, roots) {
  if (typeof value === "string") {
    return roots.reduce((text, root) => (root ? text.replaceAll(root, "<repo>") : text), value);
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry, roots));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry, roots)]));
  }
  return value;
}

export function summarizeResults(results) {
  return {
    scenarios: results.length,
    passed: results.filter((item) => item.mechanism === "pass").length,
    failed: results.filter((item) => item.mechanism !== "pass").length,
    improved: results.filter((item) => item.outcome === "improved").length,
    preserved: results.filter((item) => item.outcome === "preserved").length,
    worsened: results.filter((item) => item.outcome === "worsened").length,
    inconclusive: results.filter((item) => item.outcome === "inconclusive").length,
    notApplicable: results.filter((item) => item.outcome === "not-applicable").length,
  };
}

export function overallOutcome(summary) {
  if (summary.worsened > 0) return "WORSENED";
  if (summary.improved > 0 && summary.inconclusive > 0) return "PARTIAL";
  if (summary.improved > 0) return "IMPROVED";
  if (summary.inconclusive > 0) return "INCONCLUSIVE";
  if (summary.notApplicable > 0 && summary.preserved === 0) return "NOT_APPLICABLE";
  return "PRESERVED";
}

function renderMarkdown(report) {
  const mechanism = report.summary.failed === 0 ? "PASS" : "FAIL";
  const outcome = overallOutcome(report.summary);
  const lines = [
    "# akrctx evaluation report",
    "",
    `- Mode: ${report.mode}`,
    `- Mechanism: ${mechanism}`,
    `- Outcome: ${outcome}`,
    `- Scenarios: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.inconclusive} inconclusive, ${report.summary.notApplicable} not applicable`,
    "",
  ];
  if (report.summary.worsened > 0 || report.summary.failed > 0) {
    lines.push("## Regressions", "");
    for (const item of report.results.filter((entry) => entry.mechanism !== "pass" || entry.outcome === "worsened")) {
      lines.push(`- **${item.id}**: mechanism=${item.mechanism}, outcome=${item.outcome}`);
    }
    lines.push("");
  }
  if (report.summary.improved > 0) {
    lines.push("## Supported improvements", "");
    for (const item of report.results.filter((entry) => entry.outcome === "improved"))
      lines.push(`- **${item.id}**: ${item.hypothesis}`);
    lines.push("");
  }
  if (report.summary.inconclusive > 0) {
    lines.push("## Inconclusive claims", "");
    for (const item of report.results.filter((entry) => entry.outcome === "inconclusive"))
      lines.push(`- **${item.id}**: ${item.hypothesis}`);
    lines.push("");
  }
  lines.push("## Scenarios", "");
  for (const item of report.results) {
    lines.push(
      `### ${item.id}: ${item.title}`,
      "",
      item.hypothesis ?? "",
      "",
      `- Mechanism: ${item.mechanism}`,
      `- Outcome: ${item.outcome}`,
    );
    if (item.error) lines.push(`- Error: ${item.error}`);
    for (const assertion of item.assertions ?? []) {
      lines.push(
        `- ${assertion.passed ? "PASS" : "FAIL"} ${assertion.type}: expected ${JSON.stringify(assertion.expected)}, actual ${JSON.stringify(assertion.actual)}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function writeReport(input, options) {
  const summary = summarizeResults(input.results);
  const report = redact(
    {
      schemaVersion: 1,
      runId: options.runId,
      generatedAt: new Date().toISOString(),
      ...input,
      summary,
    },
    [options.repoRoot, process.env.HOME],
  );
  const directory = path.join(options.outputRoot, options.runId);
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "report.json");
  const markdownPath = path.join(directory, "report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");
  return { directory, jsonPath, markdownPath, report };
}
