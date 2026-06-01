import type { DiffAnalysis, StyleProfile } from "./templates.js";
import {
  SUBJECT_MAX_LENGTH,
  BODY_WRAP_LENGTH,
  DEFAULT_STYLE_PROFILE,
} from "./templates.js";

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function enforceImperative(subject: string): string {
  const mappings: Array<[RegExp, string]> = [
    [/^adds\s/i, "add "],
    [/^added\s/i, "add "],
    [/^adding\s/i, "add "],
    [/^removes\s/i, "remove "],
    [/^removed\s/i, "remove "],
    [/^removing\s/i, "remove "],
    [/^updates\s/i, "update "],
    [/^updated\s/i, "update "],
    [/^updating\s/i, "update "],
    [/^fixes\s/i, "fix "],
    [/^fixed\s/i, "fix "],
    [/^fixing\s/i, "fix "],
    [/^creates\s/i, "create "],
    [/^created\s/i, "create "],
    [/^creating\s/i, "create "],
    [/^moves\s/i, "move "],
    [/^moved\s/i, "move "],
    [/^moving\s/i, "move "],
    [/^renames\s/i, "rename "],
    [/^renamed\s/i, "rename "],
    [/^renaming\s/i, "rename "],
    [/^deletes\s/i, "delete "],
    [/^deleted\s/i, "delete "],
    [/^deleting\s/i, "delete "],
    [/^implements\s/i, "implement "],
    [/^implemented\s/i, "implement "],
    [/^implementing\s/i, "implement "],
    [/^refactors\s/i, "refactor "],
    [/^refactored\s/i, "refactor "],
    [/^refactoring\s/i, "refactor "],
  ];

  for (const [pattern, replacement] of mappings) {
    if (pattern.test(subject)) {
      return subject.replace(pattern, replacement);
    }
  }

  return subject;
}

function truncateSubject(subject: string, maxLength: number): string {
  if (subject.length <= maxLength) return subject;

  const truncated = subject.slice(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line];

  const words = line.split(" ");
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    if (current && current.length + 1 + word.length > width) {
      wrapped.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }

  if (current) {
    wrapped.push(current);
  }

  return wrapped;
}

export function generateCommitMessage(
  analysis: DiffAnalysis,
  profile: StyleProfile = DEFAULT_STYLE_PROFILE,
  options?: {
    includeBody?: boolean;
  },
): string {
  const parts: string[] = [];

  let subject = capitalizeFirst(enforceImperative(analysis.subject));
  subject = truncateSubject(subject, SUBJECT_MAX_LENGTH);

  const breakingMarker = analysis.isBreaking ? "!" : "";
  const scopePart = analysis.scope ? `(${analysis.scope})` : "";

  const header = `${analysis.type}${scopePart}${breakingMarker}: ${subject}`;
  parts.push(header);

  const shouldIncludeBody =
    options?.includeBody ||
    (analysis.body.length > 0 && profile.bodiesCommon);

  if (shouldIncludeBody && analysis.body.length > 0) {
    parts.push("");
    for (const line of analysis.body) {
      const wrapped = wrapLine(line, BODY_WRAP_LENGTH);
      parts.push(...wrapped);
    }
  }

  if (analysis.isBreaking) {
    let breakingDescription = "this change is not backwards compatible";
    for (const file of analysis.files) {
      for (const hunk of file.hunks) {
        for (const hline of hunk.lines) {
          if (hline.type === "add" && hline.content.includes("BREAKING CHANGE:")) {
            const idx = hline.content.indexOf("BREAKING CHANGE:");
            breakingDescription = hline.content.slice(idx + 16).trim();
            break;
          }
        }
      }
    }

    parts.push("");
    parts.push(`BREAKING CHANGE: ${breakingDescription}`);
  }

  return parts.join("\n");
}
