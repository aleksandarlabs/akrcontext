import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { isFixtureRelative } from "./scenario.mjs";

const execFileAsync = promisify(execFile);

export async function loadFixture(repoRoot, name) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`Invalid fixture name: ${name}.`);
  const raw = await readFile(path.join(repoRoot, "evals", "fixtures", name, "fixture.json"), "utf8");
  return JSON.parse(raw);
}

export async function materializeFixture(recipe, options = {}) {
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe))
    throw new Error("Fixture recipe must be an object.");
  const tempRoot = options.tempRoot ?? os.tmpdir();
  await mkdir(tempRoot, { recursive: true });
  const root = await mkdtemp(path.join(tempRoot, "akrctx-eval-"));
  try {
    for (const [relative, content] of Object.entries(recipe.files ?? {})) {
      if (!isFixtureRelative(relative)) throw new Error(`Fixture path must stay inside the fixture root: ${relative}.`);
      if (typeof content !== "string") throw new Error(`Fixture file content must be a string: ${relative}.`);
      const target = path.resolve(root, relative);
      if (target !== root && !target.startsWith(`${root}${path.sep}`))
        throw new Error(`Fixture path must stay inside the fixture root: ${relative}.`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    if (recipe.git === true) {
      await execFileAsync("git", ["init", "--quiet"], { cwd: root });
      await execFileAsync("git", ["config", "user.email", "evals@akrctx.local"], { cwd: root });
      await execFileAsync("git", ["config", "user.name", "akrctx evals"], { cwd: root });
      await execFileAsync("git", ["add", "."], { cwd: root });
      await execFileAsync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: root });
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return {
    root,
    async cleanup() {
      if (!options.keepWorkdir) await rm(root, { recursive: true, force: true });
    },
  };
}
