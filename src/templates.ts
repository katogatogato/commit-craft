export const COMMIT_TYPES = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "style",
  "test",
  "chore",
  "perf",
  "build",
  "ci",
  "revert",
] as const;

export type CommitType = (typeof COMMIT_TYPES)[number];

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied";
  additions: number;
  deletions: number;
  hunks: Hunk[];
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
}

export interface DiffAnalysis {
  type: CommitType;
  scope: string;
  subject: string;
  body: string[];
  isBreaking: boolean;
  files: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface StyleProfile {
  version: number;
  commonTypes: Record<CommitType, number>;
  averageSubjectLength: number;
  usesScopes: boolean;
  scopesUsed: number;
  bodiesCommon: boolean;
  scopeFilePatterns: Record<string, string[]>;
  sampledAt: string;
}

export const DEFAULT_STYLE_PROFILE: StyleProfile = {
  version: 1,
  commonTypes: {
    feat: 1,
    fix: 1,
    refactor: 0,
    docs: 0,
    style: 0,
    test: 0,
    chore: 0,
    perf: 0,
    build: 0,
    ci: 0,
    revert: 0,
  },
  averageSubjectLength: 50,
  usesScopes: true,
  scopesUsed: 50,
  bodiesCommon: false,
  scopeFilePatterns: {},
  sampledAt: new Date().toISOString(),
};

export const TYPE_DESCRIPTIONS: Record<CommitType, string> = {
  feat: "A new feature",
  fix: "A bug fix",
  refactor: "A code change that neither fixes a bug nor adds a feature",
  docs: "Documentation only changes",
  style: "Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.)",
  test: "Adding missing tests or correcting existing tests",
  chore: "Changes to the build process or auxiliary tools and libraries such as documentation generation",
  perf: "A code change that improves performance",
  build: "Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)",
  ci: "Changes to your CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)",
  revert: "Reverts a previous commit",
};

export const SUBJECT_MAX_LENGTH = 72;
export const BODY_WRAP_LENGTH = 100;
export const CONFIG_FILENAME = ".commit-craft.json";
export const HOOK_NAME = "prepare-commit-msg";

export function isValidCommitType(value: string): value is CommitType {
  return COMMIT_TYPES.includes(value as CommitType);
}
