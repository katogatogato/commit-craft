import { basename, dirname, extname, join, sep } from "node:path";
import type { CommitType, FileChange, DiffAnalysis } from "./templates.js";

interface TypeSignal {
  type: CommitType;
  weight: number;
}

const FILE_TYPE_PATTERNS: Array<{
  pattern: RegExp;
  type: CommitType;
  weight: number;
}> = [
  { pattern: /\.test\.(ts|js|tsx|jsx|py|go|rs)$/, type: "test", weight: 3 },
  { pattern: /\.spec\.(ts|js|tsx|jsx)$/, type: "test", weight: 3 },
  { pattern: /(^|[\\/])(test|tests|__tests__|spec)[\\/]/, type: "test", weight: 3 },
  { pattern: /\.md$/, type: "docs", weight: 3 },
  { pattern: /\.rst$/, type: "docs", weight: 3 },
  { pattern: /\.tex$/, type: "docs", weight: 2 },
  { pattern: /(^|[\\/])docs[\\/]/, type: "docs", weight: 2 },
  { pattern: /(^|[\\/])LICENSE/, type: "docs", weight: 2 },
  { pattern: /\.css$/, type: "style", weight: 3 },
  { pattern: /\.scss$/, type: "style", weight: 3 },
  { pattern: /\.less$/, type: "style", weight: 3 },
  { pattern: /\.fmt$/, type: "style", weight: 2 },
  { pattern: /(^|[\\/])package\.json$/, type: "build", weight: 3 },
  { pattern: /(^|[\\/])package-lock\.json$/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])yarn\.lock$/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])pnpm-lock\.yaml$/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])tsconfig/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])webpack/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])vite\.config/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])Makefile/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])Cargo\.toml/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])go\.mod/, type: "build", weight: 2 },
  { pattern: /(^|[\\/])Gemfile$/, type: "build", weight: 2 },
  { pattern: /\.ya?ml$/, type: "ci", weight: 1 },
  { pattern: /(^|[\\/])\.github[\\/]workflows[\\/]/, type: "ci", weight: 4 },
  { pattern: /(^|[\\/])\.gitlab-ci/, type: "ci", weight: 4 },
  { pattern: /(^|[\\/])Jenkinsfile/, type: "ci", weight: 4 },
  { pattern: /(^|[\\/])\.travis/, type: "ci", weight: 4 },
  { pattern: /(^|[\\/])Dockerfile/, type: "ci", weight: 2 },
  { pattern: /(^|[\\/])docker-compose/, type: "ci", weight: 2 },
  { pattern: /(^|[\\/])\.eslintrc/, type: "chore", weight: 2 },
  { pattern: /(^|[\\/])\.prettierrc/, type: "chore", weight: 2 },
  { pattern: /(^|[\\/])\.editorconfig/, type: "chore", weight: 2 },
  { pattern: /(^|[\\/])\.gitignore/, type: "chore", weight: 2 },
  { pattern: /(^|[\\/])\.env/, type: "chore", weight: 1 },
  { pattern: /(^|[\\/])src[\\/]/, type: "feat", weight: 1 },
  { pattern: /(^|[\\/])lib[\\/]/, type: "feat", weight: 1 },
  { pattern: /(^|[\\/])app[\\/]/, type: "feat", weight: 1 },
];

function detectTypeFromFile(files: FileChange[]): TypeSignal[] {
  const signals: TypeSignal[] = [];

  for (const file of files) {
    for (const { pattern, type, weight } of FILE_TYPE_PATTERNS) {
      if (pattern.test(file.path)) {
        signals.push({ type, weight });
      }
    }
  }

  return signals;
}

function detectTypeFromStats(files: FileChange[]): TypeSignal[] {
  const signals: TypeSignal[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  if (totalDeletions > totalAdditions * 3 && totalDeletions > 10) {
    signals.push({ type: "refactor", weight: 2 });
  }

  let allRenamed = true;
  for (const file of files) {
    if (file.status !== "renamed") {
      allRenamed = false;
      break;
    }
  }
  if (allRenamed && files.length > 0) {
    signals.push({ type: "refactor", weight: 4 });
  }

  let allAdded = true;
  for (const file of files) {
    if (file.status !== "added") {
      allAdded = false;
      break;
    }
  }
  if (allAdded && files.length > 0) {
    signals.push({ type: "feat", weight: 2 });
  }

  return signals;
}

function detectTypeFromContent(files: FileChange[]): TypeSignal[] {
  const signals: TypeSignal[] = [];

  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === "add") {
          if (line.content.includes("BREAKING CHANGE:")) {
            signals.push({ type: "feat", weight: 5 });
          }
          if (/^(import|export|require)\s/.test(line.content.trim())) {
            signals.push({ type: "refactor", weight: 1 });
          }
        }
      }
    }
  }

  return signals;
}

function aggregateType(signals: TypeSignal[]): CommitType {
  if (signals.length === 0) return "chore";

  const scores: Record<string, number> = {};
  for (const signal of signals) {
    const key = signal.type;
    scores[key] = (scores[key] || 0) + signal.weight;
  }

  let bestType: CommitType = "chore";
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as CommitType;
    }
  }

  return bestType;
}

const SCOPE_IGNORE_DIRS = new Set([
  "src",
  "lib",
  "app",
  "test",
  "tests",
  "spec",
  "docs",
  "build",
  "dist",
  "public",
  "static",
  "assets",
  "root",
  ".",
]);

function detectScope(files: FileChange[]): string {
  const dirCounts: Record<string, number> = {};

  for (const file of files) {
    const parts = file.path.split(sep);
    if (parts.length < 2) continue;

    const dir = parts.length >= 3 ? parts[1] : parts[0];

    if (!SCOPE_IGNORE_DIRS.has(dir) && !dir.startsWith(".")) {
      dirCounts[dir] = (dirCounts[dir] || 0) + 1;
    }
  }

  const entries = Object.entries(dirCounts).sort((a, b) => b[1] - a[1]);

  if (entries.length > 0 && entries[0][1] >= files.length * 0.5) {
    return entries[0][0];
  }

  return "";
}

function detectBreakingChange(files: FileChange[]): boolean {
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (
          line.type === "add" &&
          line.content.includes("BREAKING CHANGE:")
        ) {
          return true;
        }
      }
    }
  }

  for (const file of files) {
    if (file.status === "deleted" && file.path.includes("src/")) {
      return true;
    }
  }

  return false;
}

function humanize(str: string): string {
  return str
    .replace(/[-_.]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

function generateSubject(files: FileChange[], type: CommitType): string {
  if (files.length === 1) {
    const file = files[0];
    const name = basename(file.path, extname(file.path));
    const dir = dirname(file.path);
    const dirPart = dir && dir !== "." ? humanize(dir) + " " : "";

    switch (file.status) {
      case "added":
        return `add ${dirPart}${humanize(name)}`;
      case "deleted":
        return `remove ${dirPart}${humanize(name)}`;
      case "renamed":
        return `move ${dirPart}${humanize(name)}`;
      default:
        return `update ${dirPart}${humanize(name)}`;
    }
  }

  const grouped = new Map<string, number>();
  for (const file of files) {
    const dir = dirname(file.path);
    const topDir = dir.split(sep)[0];
    if (topDir && topDir !== ".") {
      grouped.set(topDir, (grouped.get(topDir) || 0) + 1);
    }
  }

  if (grouped.size === 1) {
    const [dir] = grouped.keys();
    return `update ${humanize(dir)} module`;
  }

  const statusCounts: Record<FileChange["status"], number> = {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
  };

  for (const file of files) {
    statusCounts[file.status]++;
  }

  if (statusCounts.added === files.length) {
    return `add ${files.length} new files`;
  }
  if (statusCounts.deleted === files.length) {
    return `remove ${files.length} files`;
  }
  if (statusCounts.renamed === files.length) {
    return `relocate ${files.length} files`;
  }

  if (type === "test") return `update ${files.length} test files`;
  if (type === "docs") return `update ${files.length} documentation files`;
  if (type === "style") return `apply formatting to ${files.length} files`;
  if (type === "ci") return `update CI configuration`;
  if (type === "build") return `update build configuration`;
  if (type === "chore") return `update ${files.length} configuration files`;

  return `update ${files.length} files across ${grouped.size} modules`;
}

function generateBody(files: FileChange[]): string[] {
  if (files.length <= 3) return [];

  const bullets: string[] = [];

  const sortedFiles = [...files].sort((a, b) => {
    const order: Record<FileChange["status"], number> = {
      added: 0,
      renamed: 1,
      modified: 2,
      deleted: 3,
      copied: 4,
    };
    return order[a.status] - order[b.status];
  });

  for (const file of sortedFiles) {
    const verb =
      file.status === "added"
        ? "Add"
        : file.status === "deleted"
          ? "Remove"
          : file.status === "renamed"
            ? "Rename"
            : "Update";

    const stats =
      file.additions > 0 && file.deletions > 0
        ? ` (+${file.additions}/-${file.deletions})`
        : file.additions > 0
          ? ` (+${file.additions})`
          : file.deletions > 0
            ? ` (-${file.deletions})`
            : "";

    bullets.push(`- ${verb} ${file.path}${stats}`);
  }

  return bullets;
}

export function analyzeDiff(
  files: FileChange[],
  overrides?: {
    type?: CommitType;
    scope?: string;
    breaking?: boolean;
  },
): DiffAnalysis {
  const allSignals = [
    ...detectTypeFromFile(files),
    ...detectTypeFromStats(files),
    ...detectTypeFromContent(files),
  ];

  const detectedType = overrides?.type || aggregateType(allSignals);
  const scope = overrides?.scope ?? detectScope(files);
  const isBreaking = overrides?.breaking ?? detectBreakingChange(files);
  const subject = generateSubject(files, detectedType);
  const body = generateBody(files);

  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  return {
    type: detectedType,
    scope,
    subject,
    body,
    isBreaking,
    files,
    totalAdditions,
    totalDeletions,
  };
}
