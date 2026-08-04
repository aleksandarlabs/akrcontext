import { realpath } from "node:fs/promises";
import path from "node:path";

function assertInside(root, target) {
  const relative = path.relative(root, target);
  if (relative === "") return;
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`Resolved path is outside the fixture root: ${target}.`);
  }
}

export async function resolveInsideFixture(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const lexicalTarget = path.resolve(absoluteRoot, relativePath);
  assertInside(absoluteRoot, lexicalTarget);
  const realRoot = await realpath(absoluteRoot);
  let existing = lexicalTarget;
  while (true) {
    try {
      const realExisting = await realpath(existing);
      const suffix = path.relative(existing, lexicalTarget);
      const resolvedTarget = path.resolve(realExisting, suffix);
      assertInside(realRoot, resolvedTarget);
      return resolvedTarget;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      existing = parent;
    }
  }
}
