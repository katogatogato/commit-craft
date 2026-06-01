import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FileChange, Hunk, DiffLine } from "./templates.js";

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

export function isGitRepo(path: string): boolean {
  const result = git(["rev-parse", "--is-inside-work-tree"], path);
  return result === "true";
}

export function resolveGitDir(path: string): string {
  return resolve(git(["rev-parse", "--show-toplevel"], path) || path);
}

export function hasStagedChanges(cwd: string): boolean {
  const diff = git(["diff", "--cached", "--quiet"], cwd);
  return diff === "" && !git(["diff", "--cached", "--name-only"], cwd);
}

export function getStagedDiff(cwd: string): string {
  return git(
    ["diff", "--cached", "--no-color", "--unified=3", "--no-prefix"],
    cwd,
  );
}

export function getStagedFiles(cwd: string): string[] {
  const output = git(["diff", "--cached", "--name-only", "--diff-filter=ACDMRT"], cwd);
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

interface RawFileDiff {
  path: string;
  status: FileChange["status"];
  diffSection: string;
}

function splitDiffByFile(diff: string): RawFileDiff[] {
  const files: RawFileDiff[] = [];
  const sections = diff.split(/(?=^diff --git )/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const toMatch = section.match(/^diff --git (?:a\/\S+ )?b\/(\S+)/m);
    const fromMatch = section.match(/^diff --git a\/(\S+) /m);

    if (!toMatch) continue;

    const toPath = toMatch[1];
    const fromPath = fromMatch ? fromMatch[1] : toPath;
    let status: FileChange["status"] = "modified";

    if (section.includes("new file mode")) {
      status = "added";
    } else if (section.includes("deleted file mode")) {
      status = "deleted";
    } else if (section.includes("similarity index")) {
      status = "renamed";
    } else if (fromPath !== toPath) {
      status = "renamed";
    }

    files.push({ path: toPath, status, diffSection: section });
  }

  return files;
}

function parseHunks(diffSection: string): Hunk[] {
  const hunks: Hunk[] = [];
  const hunkRegex = /^@@[^@]+@@/gm;
  let match: RegExpExecArray | null;

  const positions: number[] = [];
  while ((match = hunkRegex.exec(diffSection)) !== null) {
    positions.push(match.index);
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : diffSection.length;
    const hunkText = diffSection.slice(start, end);

    const headerMatch = hunkText.match(/^@@[^@]+@@[ ]?(.*)/m);
    const header = headerMatch ? headerMatch[1] || "" : "";

    const lines: DiffLine[] = [];
    const rawLines = hunkText.split("\n").slice(1);

    for (const line of rawLines) {
      if (line.startsWith("+")) {
        lines.push({ type: "add", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        lines.push({ type: "remove", content: line.slice(1) });
      } else if (line.startsWith(" ")) {
        lines.push({ type: "context", content: line.slice(1) });
      }
    }

    hunks.push({ header, lines });
  }

  return hunks;
}

export function parseDiff(diff: string): FileChange[] {
  if (!diff.trim()) return [];

  const rawFiles = splitDiffByFile(diff);

  return rawFiles.map((raw) => {
    const hunks = parseHunks(raw.diffSection);
    let additions = 0;
    let deletions = 0;

    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === "add") additions++;
        if (line.type === "remove") deletions++;
      }
    }

    return {
      path: raw.path,
      status: raw.status,
      additions,
      deletions,
      hunks,
    };
  });
}

export function getConfigPath(cwd: string): string {
  return resolve(cwd, ".commit-craft.json");
}

export function configExists(cwd: string): boolean {
  return existsSync(getConfigPath(cwd));
}

export function getGitLog(cwd: string, count: number): string {
  return git(["log", `-${count}`, "--pretty=format:%s"], cwd);
}
