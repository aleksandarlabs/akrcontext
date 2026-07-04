import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs-utils.js";
import type { WikiLintIssue, WikiLintResult } from "./types.js";

export type { WikiLintIssue, WikiLintResult };

const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
const isoTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function parseFrontmatter(rawContent: string): { frontmatter: Record<string, string> | null; body: string } {
  // Normalize CRLF for parsing only — files on disk are never rewritten here.
  const content = rawContent.replace(/\r\n/g, "\n");
  if (!content.startsWith("---\n")) return { frontmatter: null, body: content };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { frontmatter: null, body: content };
  const raw = content.slice(4, end);
  const frontmatter: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: content.slice(end + 5) };
}

function isExternalLink(link: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(link);
}

function resolveWikiLink(rawLink: string, sourceFile: string, wikiDir: string): string | null {
  // Markdown links can carry a "title" after the URL (`url "title"`) and/or
  // an anchor fragment (`file.md#anchor`) — strip both before resolving.
  const link = rawLink.split(/\s+/)[0].split("#")[0];
  if (!link) return null;
  if (isExternalLink(link)) return null;
  if (link.startsWith("/wiki/")) {
    return path.join(wikiDir, link.slice(6));
  }
  if (link.startsWith("/")) return null;
  return path.resolve(path.dirname(sourceFile), link);
}

export async function lintWiki(cwd: string): Promise<WikiLintResult> {
  const wikiDir = path.join(cwd, ".akrctx", "wiki");
  if (!(await pathExists(wikiDir))) {
    return { brokenLinks: [], orphans: [], missingTimestamps: [] };
  }

  const entries = await readdir(wikiDir, { withFileTypes: true });
  const wikiFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
  const filePaths = wikiFiles.map((name) => path.join(wikiDir, name));
  const contents = await Promise.all(filePaths.map((filePath) => readFile(filePath, "utf8")));

  const brokenLinks: WikiLintIssue[] = [];
  const inboundCounts: Record<string, number> = Object.fromEntries(wikiFiles.map((name) => [name, 0]));
  const missingTimestamps: WikiLintIssue[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const relativeFile = path.posix.join(".akrctx", "wiki", wikiFiles[i]);
    const content = contents[i];
    const { frontmatter, body } = parseFrontmatter(content);

    if (!frontmatter?.timestamp || !isoTimestampRegex.test(frontmatter.timestamp)) {
      missingTimestamps.push({ file: relativeFile, message: "missing or invalid frontmatter timestamp" });
    }

    const matches = body.matchAll(markdownLinkRegex);
    for (const match of matches) {
      const link = match[2];
      const resolved = resolveWikiLink(link, filePath, wikiDir);
      if (resolved === null) continue;

      const basename = path.basename(resolved);
      if (wikiFiles.includes(basename)) {
        inboundCounts[basename] = (inboundCounts[basename] ?? 0) + 1;
      }

      if (!(await pathExists(resolved))) {
        brokenLinks.push({ file: relativeFile, message: `broken link \`${link}\`` });
      }
    }
  }

  const orphans = wikiFiles.filter((name) => {
    if (name === "index.md" || name === "log.md") return false;
    return inboundCounts[name] === 0;
  });

  return { brokenLinks, orphans, missingTimestamps };
}
