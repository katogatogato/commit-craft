import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import type { CommitType, StyleProfile } from "./templates.js";
import {
  COMMIT_TYPES,
  CONFIG_FILENAME,
  DEFAULT_STYLE_PROFILE,
} from "./templates.js";
import { resolveGitDir } from "./diff.js";

interface ParsedCommitSubject {
  type: string;
  scope: string;
  subject: string;
  hasBody: boolean;
}

const CONVENTIONAL_REGEX =
  /^(feat|fix|refactor|docs|style|test|chore|perf|build|ci|revert)(?:\(([^)]+)\))?!?:\s*(.+)$/;

function parseCommitSubject(line: string): ParsedCommitSubject | null {
  const match = line.match(CONVENTIONAL_REGEX);
  if (!match) {
    return {
      type: "",
      scope: "",
      subject: line,
      hasBody: false,
    };
  }

  return {
    type: match[1],
    scope: match[2] || "",
    subject: match[3],
    hasBody: false,
  };
}

function getCommitMessages(cwd: string, count: number): string[] {
  try {
    const output = execFileSync("git", ["log", `-${count}`, "--pretty=format:%s%x00%B%x01"], {
      cwd,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }).trim();

    if (!output) return [];

    const entries = output.split("\x01").filter(Boolean);
    return entries.map((e) => e.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function parseCommitEntries(entries: string[]): ParsedCommitSubject[] {
  const results: ParsedCommitSubject[] = [];

  for (const entry of entries) {
    const parts = entry.split("\x00");
    const subjectLine = parts[0]?.trim() || "";
    const bodyText = parts.slice(1).join("\x00").trim();

    const parsed = parseCommitSubject(subjectLine);
    if (parsed) {
      parsed.hasBody = bodyText.length > 0;
      results.push(parsed);
    }
  }

  return results;
}

function getChangedFilesForCommit(cwd: string, hash: string): string[] {
  try {
    const output = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", hash], {
      cwd,
      encoding: "utf-8",
    }).trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function inferScopeFromPaths(paths: string[]): string {
  if (paths.length === 0) return "";

  const dirCounts: Record<string, number> = {};
  for (const p of paths) {
    const parts = p.split(sep);
    if (parts.length >= 2) {
      const dir = parts[0];
      dirCounts[dir] = (dirCounts[dir] || 0) + 1;
    }
  }

  const sorted = Object.entries(dirCounts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : "";
}

export function learnStyle(cwd: string, count: number = 50): StyleProfile {
  const gitDir = resolveGitDir(cwd);
  const messages = getCommitMessages(gitDir, count);

  if (messages.length === 0) {
    return { ...DEFAULT_STYLE_PROFILE };
  }

  const parsed = parseCommitEntries(messages);

  const typeCounts: Record<string, number> = {};
  let totalSubjectLength = 0;
  let scopesUsed = 0;
  let bodiesCount = 0;
  const scopePatterns: Record<string, Set<string>> = {};

  for (const commit of parsed) {
    if (commit.type && COMMIT_TYPES.includes(commit.type as CommitType)) {
      typeCounts[commit.type] = (typeCounts[commit.type] || 0) + 1;
    }

    totalSubjectLength += commit.subject.length;

    if (commit.scope) {
      scopesUsed++;
      if (!scopePatterns[commit.scope]) {
        scopePatterns[commit.scope] = new Set();
      }
    }

    if (commit.hasBody) {
      bodiesCount++;
    }
  }

  const formattedTypes: Record<CommitType, number> = {
    feat: 0,
    fix: 0,
    refactor: 0,
    docs: 0,
    style: 0,
    test: 0,
    chore: 0,
    perf: 0,
    build: 0,
    ci: 0,
    revert: 0,
  };

  for (const type of COMMIT_TYPES) {
    formattedTypes[type] = typeCounts[type] || 0;
  }

  try {
    const hashes = execFileSync("git", ["log", `-${count}`, "--pretty=format:%H"], {
      cwd: gitDir,
      encoding: "utf-8",
    }).trim().split("\n").filter(Boolean);

    for (const hash of hashes.slice(0, 20)) {
      const files = getChangedFilesForCommit(gitDir, hash);
      const scope = inferScopeFromPaths(files);

      if (scope && scopePatterns[scope]) {
        for (const f of files.slice(0, 5)) {
          scopePatterns[scope].add(f);
        }
      }
    }
  } catch {
    // If we can't get file lists, skip scope pattern learning
  }

  const serializedPatterns: Record<string, string[]> = {};
  for (const [scope, fileSet] of Object.entries(scopePatterns)) {
    serializedPatterns[scope] = [...fileSet];
  }

  const conventionalCount = parsed.filter((p) => p.type).length;

  return {
    version: 1,
    commonTypes: formattedTypes,
    averageSubjectLength:
      parsed.length > 0
        ? Math.round(totalSubjectLength / parsed.length)
        : DEFAULT_STYLE_PROFILE.averageSubjectLength,
    usesScopes: scopesUsed > parsed.length * 0.3,
    scopesUsed: scopesUsed,
    bodiesCommon: bodiesCount > parsed.length * 0.3,
    scopeFilePatterns: serializedPatterns,
    sampledAt: new Date().toISOString(),
  };
}

export function saveProfile(cwd: string, profile: StyleProfile): string {
  const gitDir = resolveGitDir(cwd);
  const configPath = resolve(gitDir, CONFIG_FILENAME);
  writeFileSync(configPath, JSON.stringify(profile, null, 2) + "\n", "utf-8");
  return configPath;
}

export function loadProfile(cwd: string): StyleProfile | null {
  try {
    const gitDir = resolveGitDir(cwd);
    const configPath = resolve(gitDir, CONFIG_FILENAME);
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as StyleProfile;
  } catch {
    return null;
  }
}

export function getOrLearnProfile(cwd: string): StyleProfile {
  const existing = loadProfile(cwd);
  if (existing) return existing;

  return learnStyle(cwd);
}
