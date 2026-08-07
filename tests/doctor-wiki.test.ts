import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor.js";
import { runInit } from "../src/init.js";
import { lintWiki } from "../src/wiki-lint.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "akrctx-doctor-wiki-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function readWiki(file: string): Promise<string> {
  return readFile(path.join(tmp, ".akrctx/wiki", file), "utf8");
}

function stripTimestamp(content: string): string {
  return content.replace(/^timestamp:.*\n/m, "");
}

describe("doctor wiki timestamp churn", () => {
  it("leaves wiki reports byte-identical across two unchanged doctor runs", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runDoctor({ cwd: tmp, nonInteractive: true });

    const first = {
      agentSetup: await readWiki("agent-setup.md"),
      gaps: await readWiki("gaps.md"),
      recommendations: await readWiki("recommendations.md"),
    };

    await runDoctor({ cwd: tmp, nonInteractive: true });

    expect(await readWiki("agent-setup.md")).toBe(first.agentSetup);
    expect(await readWiki("gaps.md")).toBe(first.gaps);
    expect(await readWiki("recommendations.md")).toBe(first.recommendations);
  });

  it("updates wiki reports and timestamp when findings change", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runDoctor({ cwd: tmp, nonInteractive: true });

    const first = {
      agentSetup: await readWiki("agent-setup.md"),
      gaps: await readWiki("gaps.md"),
      recommendations: await readWiki("recommendations.md"),
    };

    // Introduce a real finding change.
    await rm(path.join(tmp, ".agents/skills/akrctx-workflow/SKILL.md"), { force: true });
    await runDoctor({ cwd: tmp, nonInteractive: true });

    const second = {
      agentSetup: await readWiki("agent-setup.md"),
      gaps: await readWiki("gaps.md"),
      recommendations: await readWiki("recommendations.md"),
    };

    // Content excluding timestamp must have changed.
    expect(stripTimestamp(second.agentSetup)).not.toBe(stripTimestamp(first.agentSetup));
    expect(stripTimestamp(second.gaps)).not.toBe(stripTimestamp(first.gaps));
    expect(stripTimestamp(second.recommendations)).not.toBe(stripTimestamp(first.recommendations));

    // Timestamps should be different.
    const firstTs = first.agentSetup.match(/^timestamp: (.*)\n/m)?.[1];
    const secondTs = second.agentSetup.match(/^timestamp: (.*)\n/m)?.[1];
    expect(secondTs).not.toBe(firstTs);
  });

  it("keeps timestamps valid for wiki-lint after unchanged doctor runs", async () => {
    await runInit({ cwd: tmp, target: "codex", nonInteractive: true });
    await runDoctor({ cwd: tmp, nonInteractive: true });
    await runDoctor({ cwd: tmp, nonInteractive: true });

    const wikiLint = await lintWiki(tmp);
    const reportFiles = ["agent-setup.md", "gaps.md", "recommendations.md"];
    const reportTimestampIssues = wikiLint.missingTimestamps.filter((issue) =>
      reportFiles.some((name) => issue.file.includes(name)),
    );
    expect(reportTimestampIssues).toEqual([]);
  });
});
