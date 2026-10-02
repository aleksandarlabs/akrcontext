import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import { readAcceptanceCriteria } from "../src/judge-enforcement.js";
import { migrateAcceptanceCriteriaIdentifiers } from "../src/task.js";

const repository = process.cwd();
let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "akrctx-criteria-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function capsule(markdown: string, id = "TASK-001"): Promise<string> {
  const file = path.join(tmp, ".akrctx/tasks", id, "acceptance-criteria.md");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, markdown);
  await utimes(file, new Date("2020-01-01"), new Date("2020-01-01"));
  return file;
}

describe("stable criterion migration", () => {
  it.each(["TASK-076-judge-round-accounting", "TASK-078-clarification-signal", "TASK-081-checklist-claim-classes"])(
    "preserves real retired identifiers in %s, including bytes and mtime",
    async (dir) => {
      const markdown = await readFile(path.join(repository, ".akrctx/tasks", dir, "acceptance-criteria.md"), "utf8");
      const file = await capsule(markdown);
      const before = await stat(file);
      for (const dryRun of [true, false]) {
        expect((await migrateAcceptanceCriteriaIdentifiers(tmp, { dryRun }))[0].changed).toBe(false);
        expect(await readFile(file, "utf8")).toBe(markdown);
        expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
      }
      const declaration = await readAcceptanceCriteria(tmp, "TASK-001");
      expect(declaration.problems).toEqual([]);
      const retired = [...markdown.matchAll(/^Retired: (AC-\d+)$/gm)].map((match) => match[1]);
      for (const id of retired) expect(declaration.ids).not.toContain(id);
      expect(declaration.criteria).toHaveLength(declaration.ids.length);
    },
  );

  it("scans all active and retired IDs before adding prefixes, preserving CRLF and whitespace", async () => {
    const markdown =
      "# Criteria\r\n\r\n-  First.\r\n- AC-3:  Existing.  \r\n-\tNext.\r\n  continuation\r\n- AC-1: Last.\r\n\r\nRetired: AC-8\r\n";
    const file = await capsule(markdown);
    const before = await stat(file);
    const planned = await migrateAcceptanceCriteriaIdentifiers(tmp, { dryRun: true });
    expect(planned[0].changed).toBe(true);
    expect(await readFile(file, "utf8")).toBe(markdown);
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(await migrateAcceptanceCriteriaIdentifiers(tmp)).toEqual(planned);
    expect(await readFile(file, "utf8")).toBe(
      markdown.replace("-  First.", "-  AC-9: First.").replace("-\tNext.", "-\tAC-10: Next."),
    );
    const after = await stat(file);
    expect((await migrateAcceptanceCriteriaIdentifiers(tmp))[0].changed).toBe(false);
    expect((await stat(file)).mtimeMs).toBe(after.mtimeMs);
    expect((await readAcceptanceCriteria(tmp, "TASK-001")).ids).toEqual(["AC-9", "AC-3", "AC-10", "AC-1"]);
  });

  it("accepts undeclared gaps and reordered IDs without changing their associations", async () => {
    const markdown = "- AC-7: First.\n- AC-2: Second.\n";
    const file = await capsule(markdown);
    expect((await migrateAcceptanceCriteriaIdentifiers(tmp))[0].changed).toBe(false);
    expect(await readFile(file, "utf8")).toBe(markdown);
    expect((await readAcceptanceCriteria(tmp, "TASK-001")).problems).toEqual([]);
  });

  it("allocates exact integers beyond Number.MAX_SAFE_INTEGER", async () => {
    const file = await capsule("- New.\n\nRetired: AC-9007199254740992\n");
    await migrateAcceptanceCriteriaIdentifiers(tmp);
    expect(await readFile(file, "utf8")).toBe("- AC-9007199254740993: New.\n\nRetired: AC-9007199254740992\n");
  });

  it.each([
    ["- AC-1: First.\n- AC-1: Duplicate.\n", 2],
    ["- AC-1: Active.\nRetired: AC-1\n", 2],
    ["- AC-1: Active.\nRetired: AC-5\nRetired: AC-5\n", 3],
    ["- AC-0: Invalid.\n", 1],
    ["- AC-01: Invalid.\n", 1],
    ["- AC-x: Invalid.\n", 1],
    ["- AC-2 Missing colon.\n", 1],
    ["- AC-2:\n", 1],
    ["- New.\nRetired: AC-0\n", 2],
    ["- New.\nRetired AC-5\n", 2],
    ["- New.\nRetired: AC-5 extra\n", 2],
    ["- New.\n  Retired: AC-5\n", 2],
    ["- New.\n- Retired: AC-5\n", 2],
    ["Retired: AC-5\n- AC-1: Active after footer.\n", 2],
  ])("refuses identity defects with the same file/line diagnosis as the reader (%s)", async (markdown, line) => {
    const file = await capsule(markdown);
    const before = await stat(file);
    const declaration = await readAcceptanceCriteria(tmp, "TASK-001");
    const identityProblems = declaration.problems.filter((problem) => !problem.includes("has no AC-<n> identifier"));
    expect(identityProblems.length).toBeGreaterThan(0);
    expect(identityProblems.join("\n")).toContain(`acceptance-criteria.md line ${line}`);
    for (const dryRun of [true, false]) {
      const [result] = await migrateAcceptanceCriteriaIdentifiers(tmp, { dryRun });
      expect(result.changed).toBe(false);
      expect(result.problems).toEqual(identityProblems);
      expect(await readFile(file, "utf8")).toBe(markdown);
      expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    }
  });

  it.each([false, true])("bulk CLI reports all defects and continues safe capsules (json=%s)", async (json) => {
    const bad = await capsule("- AC-1: One.\n- AC-1: Two.\n", "TASK-001");
    const good = await capsule("- AC-4: Existing.\n- New.\n", "TASK-002");
    await capsule("- AC-x: Bad.\n", "TASK-003");
    const previousCwd = process.cwd();
    const previousExitCode = process.exitCode;
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((value) => logs.push(String(value)));
    try {
      process.chdir(tmp);
      await main(["node", "akrctx", "task", "migrate-criteria", ...(json ? ["--json"] : [])]);
      expect(process.exitCode).toBe(1);
      expect(await readFile(good, "utf8")).toBe("- AC-4: Existing.\n- AC-5: New.\n");
      expect(await readFile(bad, "utf8")).toBe("- AC-1: One.\n- AC-1: Two.\n");
      expect(logs.join("\n")).toContain("TASK-001");
      expect(logs.join("\n")).toContain("TASK-003");
      expect(logs.join("\n")).toContain("line 2");
      expect(logs.join("\n")).toContain("line 1");
      if (json) expect(JSON.parse(logs[0])).toHaveLength(3);
    } finally {
      spy.mockRestore();
      process.chdir(previousCwd);
      process.exitCode = previousExitCode;
    }
  });
});
