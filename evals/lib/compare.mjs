import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { evaluationEnvironment } from "./process.mjs";
import { runScenario } from "./run.mjs";

const execFileAsync = promisify(execFile);
const buildsInFlight = new Map();
const LOCK_STALE_MS = 10 * 60_000;

export async function resolveRef(repoRoot, ref) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: repoRoot });
  return stdout.trim();
}

export function buildCacheKey(sha, nodeVersion = process.versions.node) {
  return `${sha}-node${nodeVersion}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function sha256Directory(directory) {
  const hash = createHash("sha256");
  const visit = async (current, prefix = "") => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        hash
          .update(relative)
          .update("\0")
          .update(await readFile(absolute))
          .update("\0");
      } else {
        throw new Error(`Unsupported file type in cached dist: ${relative}.`);
      }
    }
  };
  await visit(directory);
  return hash.digest("hex");
}

export async function isBuildCacheValid(directory, sha) {
  try {
    const marker = JSON.parse(await readFile(path.join(directory, "ready.json"), "utf8"));
    if (marker.sha !== sha || marker.node !== process.versions.node || typeof marker.distSha256 !== "string")
      return false;
    const distDirectory = path.join(directory, "source", "dist");
    return (await sha256Directory(distDirectory)) === marker.distSha256;
  } catch {
    return false;
  }
}

async function run(command, args, options) {
  try {
    return await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 180_000,
      maxBuffer: 10 * 1024 * 1024,
      env: options.env,
    });
  } catch (error) {
    const stderr = error?.stderr ? `\n${error.stderr}` : "";
    throw new Error(`${command} ${args.join(" ")} failed in ${options.cwd}.${stderr}`);
  }
}

async function readBuildLockOwner(lockDirectory) {
  const ownerPath = path.join(lockDirectory, "owner.json");
  let owner;
  try {
    owner = JSON.parse(await readFile(ownerPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(
      `Malformed evaluation build cache lock owner metadata at ${ownerPath}. Remove the lock directory manually after confirming no evaluation build is running.`,
      { cause: error },
    );
  }
  if (
    !Number.isInteger(owner.pid) ||
    owner.pid <= 0 ||
    typeof owner.token !== "string" ||
    typeof owner.startedAt !== "string"
  ) {
    throw new Error(
      `Malformed evaluation build cache lock owner metadata at ${ownerPath}. Remove the lock directory manually after confirming no evaluation build is running.`,
    );
  }
  return owner;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function isStaleDeadOwner(owner) {
  const startedAt = Date.parse(owner.startedAt);
  return Number.isFinite(startedAt) && Date.now() - startedAt > LOCK_STALE_MS && !isProcessAlive(owner.pid);
}

export async function claimStaleOwnerlessBuildLock(lockDirectory, token) {
  try {
    const lockStat = await stat(lockDirectory);
    if (Date.now() - lockStat.mtimeMs <= LOCK_STALE_MS) return false;
    await writeFile(
      path.join(lockDirectory, "owner.json"),
      JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }),
      { flag: "wx" },
    );
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EEXIST") return false;
    throw error;
  }
}

export async function releaseBuildLock(lockDirectory, token) {
  const owner = await readBuildLockOwner(lockDirectory);
  if (!owner || owner.token !== token) return false;
  await rm(lockDirectory, { recursive: true, force: true });
  return true;
}

export async function acquireBuildLock(lockDirectory, cacheDirectory, sha) {
  const deadline = Date.now() + LOCK_STALE_MS;
  while (Date.now() < deadline) {
    if (await isBuildCacheValid(cacheDirectory, sha)) return undefined;
    const token = randomUUID();
    try {
      await mkdir(lockDirectory);
      try {
        await writeFile(
          path.join(lockDirectory, "owner.json"),
          JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }),
          { flag: "wx" },
        );
      } catch (error) {
        await rm(lockDirectory, { recursive: true, force: true });
        throw error;
      }
      return token;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = await readBuildLockOwner(lockDirectory);
      if (owner && isStaleDeadOwner(owner) && (await releaseBuildLock(lockDirectory, owner.token))) continue;
      if (!owner && (await claimStaleOwnerlessBuildLock(lockDirectory, token))) return token;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for evaluation build cache lock: ${lockDirectory}.`);
}

async function buildRef(repoRoot, ref, sha, cacheRoot) {
  const key = buildCacheKey(sha);
  const directory = path.join(cacheRoot, key);
  const source = path.join(directory, "source");
  const cliEntry = path.join(source, "dist", "index.js");
  if (await isBuildCacheValid(directory, sha)) return { ref, sha, directory, cliEntry, cacheHit: true };

  await mkdir(cacheRoot, { recursive: true });
  const lockDirectory = `${directory}.lock`;
  const lockToken = await acquireBuildLock(lockDirectory, directory, sha);
  if (!lockToken) return { ref, sha, directory, cliEntry, cacheHit: true };

  let staging;
  try {
    if (await isBuildCacheValid(directory, sha)) return { ref, sha, directory, cliEntry, cacheHit: true };
    staging = await mkdtemp(path.join(cacheRoot, `.tmp-${key}-`));
    const stagingSource = path.join(staging, "source");
    const archive = path.join(staging, "source.tar");
    const home = path.join(cacheRoot, ".tool-home");
    await Promise.all([mkdir(stagingSource, { recursive: true }), mkdir(home, { recursive: true })]);
    const env = evaluationEnvironment(home, {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      npm_config_userconfig: process.platform === "win32" ? "NUL" : "/dev/null",
    });
    await run("git", ["archive", "--format=tar", `--output=${archive}`, sha], { cwd: repoRoot, env });
    await run("tar", ["-xf", archive, "-C", stagingSource], { cwd: repoRoot, env });
    await rm(archive, { force: true });
    await run("corepack", ["pnpm", "install", "--frozen-lockfile"], { cwd: stagingSource, env });
    await run("corepack", ["pnpm", "build"], { cwd: stagingSource, env });
    await rm(path.join(stagingSource, "node_modules"), { recursive: true, force: true });
    const stagingCli = path.join(stagingSource, "dist", "index.js");
    await stat(stagingCli);
    const distSha256 = await sha256Directory(path.join(stagingSource, "dist"));
    await writeFile(path.join(staging, "ready.json"), JSON.stringify({ sha, node: process.versions.node, distSha256 }));
    await rm(directory, { recursive: true, force: true });
    await rename(staging, directory);
    staging = undefined;
    return { ref, sha, directory, cliEntry, cacheHit: false };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await releaseBuildLock(lockDirectory, lockToken);
  }
}

export async function prepareRefBuild(repoRoot, ref, cacheRoot) {
  const sha = await resolveRef(repoRoot, ref);
  const key = buildCacheKey(sha);
  const existing = buildsInFlight.get(key);
  if (existing) return existing;
  const build = buildRef(repoRoot, ref, sha, cacheRoot);
  buildsInFlight.set(key, build);
  try {
    return await build;
  } finally {
    if (buildsInFlight.get(key) === build) buildsInFlight.delete(key);
  }
}

export function classifyComparison(scenario, baseMechanism, candidateMechanism) {
  if (baseMechanism === "pass" && candidateMechanism === "fail") {
    return { mechanism: "fail", verdict: "regression", outcome: "worsened" };
  }
  const expectationMismatch =
    (scenario.comparison?.baseExpected && scenario.comparison.baseExpected !== baseMechanism) ||
    (scenario.comparison?.candidateExpected && scenario.comparison.candidateExpected !== candidateMechanism);
  if (expectationMismatch) return { mechanism: "fail", verdict: "invalidated", outcome: "inconclusive" };
  if (scenario.changeType === "fix" && baseMechanism === "fail" && candidateMechanism === "pass") {
    return { mechanism: "pass", verdict: "validated", outcome: "improved" };
  }
  if (scenario.changeType === "fix" && candidateMechanism === "pass") {
    return { mechanism: "pass", verdict: "inconclusive", outcome: "inconclusive" };
  }
  if (candidateMechanism === "fail") return { mechanism: "fail", verdict: "invalidated", outcome: "inconclusive" };
  if (baseMechanism === "fail" && candidateMechanism === "pass") {
    return {
      mechanism: "pass",
      verdict: "mechanism-added",
      outcome: "inconclusive",
    };
  }
  const declaredOutcome = scenario.outcome.verdict;
  return {
    mechanism: "pass",
    verdict: "preserved",
    outcome: declaredOutcome === "inconclusive" || declaredOutcome === "not-applicable" ? declaredOutcome : "preserved",
  };
}

export async function compareScenarios(scenarios, options) {
  const [baseBuild, candidateBuild] = await Promise.all([
    prepareRefBuild(options.repoRoot, options.baseRef, options.cacheRoot),
    prepareRefBuild(options.repoRoot, options.candidateRef, options.cacheRoot),
  ]);
  const results = [];
  for (const scenario of scenarios) {
    const [base, candidate] = await Promise.all([
      runScenario(scenario, { ...options, cliEntry: baseBuild.cliEntry }),
      runScenario(scenario, { ...options, cliEntry: candidateBuild.cliEntry }),
    ]);
    results.push({
      id: scenario.id,
      title: scenario.title,
      changeType: scenario.changeType,
      hypothesis: scenario.hypothesis,
      base,
      candidate,
      ...classifyComparison(scenario, base.mechanism, candidate.mechanism),
    });
  }
  return { base: baseBuild, candidate: candidateBuild, results };
}
