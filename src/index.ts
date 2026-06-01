#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { resolve } from "node:path";
import { isGitRepo, getStagedDiff, parseDiff, getStagedFiles } from "./diff.js";
import { analyzeDiff } from "./analyzer.js";
import { generateCommitMessage } from "./generator.js";
import { learnStyle, saveProfile, getOrLearnProfile } from "./learner.js";
import { installHook, uninstallHook } from "./hook.js";
import { openInEditor, commitWithMessage } from "./editor.js";
import { isValidCommitType, COMMIT_TYPES, CONFIG_FILENAME } from "./templates.js";

const program = new Command();

program
  .name("commit-craft")
  .description("Generate conventional commit messages from your staged diff")
  .version("1.0.0");

function resolveRepoPath(path?: string): string {
  return resolve(path || process.cwd());
}

function validateRepo(path: string): boolean {
  if (!isGitRepo(path)) {
    console.error(chalk.red("Error:") + " Not a git repository.");
    return false;
  }
  return true;
}

const generateOptions = {
  type: (cmd: Command) =>
    cmd.option(
      "-t, --type <type>",
      "Force commit type",
      (value: string) => {
        if (!isValidCommitType(value)) {
          console.error(
            chalk.red("Error:") +
              ` Invalid type "${value}". Must be one of: ${COMMIT_TYPES.join(", ")}`,
          );
          process.exit(1);
        }
        return value;
      },
    ),
  scope: (cmd: Command) =>
    cmd.option("-s, --scope <scope>", "Force commit scope"),
  breaking: (cmd: Command) =>
    cmd.option("-b, --breaking", "Mark as breaking change"),
  body: (cmd: Command) =>
    cmd.option("--body", "Include body in commit message"),
};

const generateCommand = program
  .command("generate")
  .description("Generate a commit message from staged changes")
  .argument("[path]", "Path to git repository", ".")
  .action(async (path: string, options: Record<string, unknown>) => {
    const repoPath = resolveRepoPath(path);

    if (!validateRepo(repoPath)) return;

    const diff = getStagedDiff(repoPath);
    if (!diff.trim()) {
      const files = getStagedFiles(repoPath);
      if (files.length === 0) {
        console.error(
          chalk.yellow("No staged changes found.") +
            " Stage files with " +
            chalk.cyan("git add") +
            " first.",
        );
      } else {
        console.error(
          chalk.yellow("Staged changes are empty.") +
            " Check your staged files with " +
            chalk.cyan("git diff --cached"),
        );
      }
      process.exit(1);
    }

    const files = parseDiff(diff);
    if (files.length === 0) {
      console.error(chalk.yellow("No parseable changes found in diff."));
      process.exit(1);
    }

    const profile = getOrLearnProfile(repoPath);

    const typeOverride = typeof options.type === "string" && isValidCommitType(options.type)
      ? options.type : undefined;
    const analysis = analyzeDiff(files, {
      type: typeOverride,
      scope: options.scope as string | undefined,
      breaking: options.breaking as boolean | undefined,
    });

    const message = generateCommitMessage(analysis, profile, {
      includeBody: options.body as boolean | undefined,
    });

    console.log(message);
  });

generateOptions.type(generateCommand);
generateOptions.scope(generateCommand);
generateOptions.breaking(generateCommand);
generateOptions.body(generateCommand);

const commitCommand = program
  .command("commit")
  .description("Generate, review, and commit with a conventional commit message")
  .argument("[path]", "Path to git repository", ".")
  .option("--no-edit", "Skip editor, commit directly with generated message")
  .action(async (path: string, options: Record<string, unknown> & { edit: boolean }) => {
    const repoPath = resolveRepoPath(path);

    if (!validateRepo(repoPath)) return;

    const diff = getStagedDiff(repoPath);
    if (!diff.trim()) {
      const files = getStagedFiles(repoPath);
      if (files.length === 0) {
        console.error(
          chalk.yellow("No staged changes found.") +
            " Stage files with " +
            chalk.cyan("git add") +
            " first.",
        );
      }
      process.exit(1);
    }

    const files = parseDiff(diff);
    if (files.length === 0) {
      console.error(chalk.yellow("No parseable changes found in diff."));
      process.exit(1);
    }

    const profile = getOrLearnProfile(repoPath);

    const typeOverride = typeof options.type === "string" && isValidCommitType(options.type)
      ? options.type : undefined;
    const analysis = analyzeDiff(files, {
      type: typeOverride,
      scope: options.scope as string | undefined,
      breaking: options.breaking as boolean | undefined,
    });

    const message = generateCommitMessage(analysis, profile, {
      includeBody: options.body as boolean | undefined,
    });

    console.log(chalk.dim("Generated commit message:"));
    console.log(chalk.green(message));
    console.log();

    let finalMessage: string | null = message;

    if (options.edit) {
      console.log(chalk.dim("Opening editor for review..."));
      finalMessage = openInEditor(message);

      if (!finalMessage) {
        console.error(chalk.yellow("Commit aborted: empty message."));
        process.exit(1);
      }

      if (finalMessage !== message) {
        console.log(chalk.dim("Edited message:"));
        console.log(chalk.green(finalMessage));
        console.log();
      }
    }

    const success = commitWithMessage(finalMessage, repoPath);

    if (success) {
      console.log(chalk.green("✓") + " Commit created successfully.");
    } else {
      console.error(chalk.red("✗") + " Commit failed.");
      process.exit(1);
    }
  });

generateOptions.type(commitCommand);
generateOptions.scope(commitCommand);
generateOptions.breaking(commitCommand);
generateOptions.body(commitCommand);

const hookCommand = program
  .command("hook")
  .description("Manage git hooks for commit-craft");

hookCommand
  .command("install")
  .description("Install the prepare-commit-msg hook")
  .argument("[path]", "Path to git repository", ".")
  .action((path: string) => {
    const repoPath = resolveRepoPath(path);

    if (!validateRepo(repoPath)) return;

    const result = installHook(repoPath);

    if (result.success) {
      console.log(chalk.green("✓") + " " + result.message);
    } else {
      console.error(chalk.yellow("!") + " " + result.message);
    }
  });

hookCommand
  .command("uninstall")
  .description("Uninstall the prepare-commit-msg hook")
  .argument("[path]", "Path to git repository", ".")
  .action((path: string) => {
    const repoPath = resolveRepoPath(path);

    if (!validateRepo(repoPath)) return;

    const result = uninstallHook(repoPath);

    if (result.success) {
      console.log(chalk.green("✓") + " " + result.message);
    } else {
      console.error(chalk.yellow("!") + " " + result.message);
    }
  });

program
  .command("learn")
  .description("Analyze commit history and save a style profile")
  .argument("[path]", "Path to git repository", ".")
  .option("-n, --count <number>", "Number of commits to analyze", "50")
  .action((path: string, options: { count: string }) => {
    const repoPath = resolveRepoPath(path);

    if (!validateRepo(repoPath)) return;

    const count = parseInt(options.count, 10);
    if (isNaN(count) || count < 1) {
      console.error(chalk.red("Error:") + " Count must be a positive number.");
      process.exit(1);
    }

    console.log(chalk.dim(`Analyzing last ${count} commits...`));

    const profile = learnStyle(repoPath, count);
    const configPath = saveProfile(repoPath, profile);

    console.log(chalk.green("✓") + ` Style profile saved to ${chalk.cyan(configPath)}`);
    console.log();
    console.log(chalk.dim("Profile summary:"));
    console.log(`  Average subject length: ${profile.averageSubjectLength} chars`);
    console.log(`  Uses scopes: ${profile.usesScopes ? "yes" : "no"}`);
    console.log(`  Bodies common: ${profile.bodiesCommon ? "yes" : "no"}`);

    const topTypes = Object.entries(profile.commonTypes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .filter(([, count]) => count > 0)
      .map(([type]) => type);

    if (topTypes.length > 0) {
      console.log(`  Top types: ${topTypes.join(", ")}`);
    }

    const scopeNames = Object.keys(profile.scopeFilePatterns);
    if (scopeNames.length > 0) {
      console.log(`  Known scopes: ${scopeNames.join(", ")}`);
    }

    console.log();
    console.log(
      chalk.dim(`The ${CONFIG_FILENAME} file is used by`) +
        " " +
        chalk.cyan("commit-craft generate") +
        " " +
        chalk.dim("to match your repo's style."),
    );
  });

program.parse();
