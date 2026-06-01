import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function getEditor(): string {
  const envEditor =
    process.env.VISUAL ||
    process.env.EDITOR;

  if (envEditor) return envEditor;

  return "vi";
}

function createTempFile(content: string): string {
  const filename = `commit-craft-${randomUUID()}.msg`;
  const filepath = join(tmpdir(), filename);
  writeFileSync(filepath, content, "utf-8");
  return filepath;
}

function stripCommentLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();
}

export function openInEditor(message: string): string | null {
  const filepath = createTempFile(message + "\n\n# --- Edit the commit message above. Lines starting with # are ignored. ---");

  try {
    const editor = getEditor();
    const editorParts = parseEditorCommand(editor);

    execFileSync(editorParts[0], [...editorParts.slice(1), filepath], {
      stdio: "inherit",
    });

    const edited = readFileSync(filepath, "utf-8");
    const cleaned = stripCommentLines(edited);

    if (!cleaned) {
      return null;
    }

    return cleaned;
  } finally {
    if (existsSync(filepath)) {
      unlinkSync(filepath);
    }
  }
}

function parseEditorCommand(editor: string): string[] {
  if (editor.includes(" ") && !editor.startsWith('"')) {
    const parts = editor.split(" ");
    return parts;
  }

  if (editor.startsWith('"') && editor.endsWith('"')) {
    return [editor.slice(1, -1)];
  }

  return [editor];
}

export function commitWithMessage(message: string, cwd: string): boolean {
  const filepath = createTempFile(message);

  try {
    execFileSync("git", ["commit", "-F", filepath], {
      cwd,
      stdio: "inherit",
    });
    return true;
  } catch {
    return false;
  } finally {
    if (existsSync(filepath)) {
      unlinkSync(filepath);
    }
  }
}
