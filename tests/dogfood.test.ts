import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { agentFilePathList, resolveAgents } from "../src/agents.js";
import { readConfig } from "../src/config.js";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(import.meta.dirname, "..");

async function gitTrackedFiles(): Promise<Set<string>> {
  const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: repoRoot });
  return new Set(stdout.split("\n").filter(Boolean));
}

describe("dogfooded install reproducibility", () => {
  it("cleans stale dist artifacts before every release build", async () => {
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts?: { build?: string };
    };

    expect(packageJson.scripts?.build).toMatch(/(?:^|\s)--clean(?:\s|$)/);
  });

  it("tracks every agent file required by .akrctx/config.json", async () => {
    const config = await readConfig(repoRoot);
    if (!config) throw new Error("akrctx is not installed in the source repo");

    const tracked = await gitTrackedFiles();
    const agents = resolveAgents(config);
    const required = Object.values(agents)
      .filter((agent) => agent.enabled)
      .flatMap((agent) => agentFilePathList(agent.name, agent.targets));

    const missing = required.filter((file) => !tracked.has(file));
    expect(missing).toEqual([]);
  });
});
