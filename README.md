# CommitCraft

<p align="center">
  <strong>Generate conventional commit messages from your staged diff — learns your repo's style</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/commit-craft?color=blue" alt="npm version" />
  <img src="https://img.shields.io/npm/l/commit-craft?color=green" alt="license" />
  <img src="https://img.shields.io/node/v/commit-craft?color=teal" alt="node version" />
</p>

---

## Features

- **Diff-driven generation** — Reads `git diff --cached` and produces a Conventional Commits message
- **Smart type detection** — Infers `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `perf`, or `revert` from file paths, change patterns, and diff content
- **Automatic scope** — Detects scope from directory structure (e.g., changes in `src/auth/` → scope `auth`)
- **Style learning** — Analyzes your last 50 commits to match your existing conventions (subject length, scope usage, body frequency)
- **Editor integration** — Opens `$EDITOR` so you can review and tweak before committing
- **Git hook** — Auto-populates commit messages via `prepare-commit-msg` hook
- **Breaking change detection** — Spots `BREAKING CHANGE:` comments and removed source files
- **Zero AI dependencies** — All analysis is local, fast, and offline

## Installation

```bash
# npm
npm install -g commit-craft

# or use directly with npx
npx commit-craft generate
```

Requires Node.js 18+.

## Quick Start

```bash
# Stage your changes
git add .

# Generate a commit message
commit-craft generate

# Generate and commit in one step (opens editor)
commit-craft commit

# Commit directly without editing
commit-craft commit --no-edit
```

## Commands

### `commit-craft generate [path]`

Generate a commit message from staged changes without committing.

```bash
# Generate for current directory
commit-craft generate

# Generate for a specific repo
commit-craft generate ../other-project

# Force a specific type
commit-craft generate --type feat

# Force a specific scope
commit-craft generate --scope auth

# Mark as breaking change
commit-craft generate --breaking

# Include body with file details
commit-craft generate --body
```

**Options:**

| Flag | Description |
|------|-------------|
| `-t, --type <type>` | Force commit type (`feat`, `fix`, `refactor`, etc.) |
| `-s, --scope <scope>` | Force commit scope |
| `-b, --breaking` | Mark as breaking change |
| `--body` | Include body listing changed files |

### `commit-craft commit [path]`

Generate a commit message, open it in your editor for review, then commit.

```bash
# Generate, edit in $EDITOR, then commit
commit-craft commit

# Commit directly without opening editor
commit-craft commit --no-edit

# Force type and scope
commit-craft commit --type fix --scope api
```

**Options:** Same as `generate`, plus:

| Flag | Description |
|------|-------------|
| `--no-edit` | Skip the editor and commit directly with the generated message |

### `commit-craft hook install [path]`

Install a `prepare-commit-msg` git hook that auto-populates commit messages.

```bash
commit-craft hook install
```

The hook runs `commit-craft generate` automatically when you run `git commit`. It only activates for normal commits (not merge or squash commits).

If an existing `prepare-commit-msg` hook is found, it's backed up to `prepare-commit-msg.commit-craft-backup`.

### `commit-craft hook uninstall [path]`

Remove the installed hook and restore any backup.

```bash
commit-craft hook uninstall
```

### `commit-craft learn [path]`

Analyze your commit history and build a style profile.

```bash
# Analyze last 50 commits (default)
commit-craft learn

# Analyze last 100 commits
commit-craft learn --count 100
```

**Options:**

| Flag | Description |
|------|-------------|
| `-n, --count <number>` | Number of commits to analyze (default: 50) |

The profile is saved to `.commit-craft.json` in the repo root. The `generate` command reads this profile to match your existing conventions. If no profile exists, one is built on the fly from the last 50 commits.

## Commit Message Format

CommitCraft follows [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope)!: subject

body

footer
```

**Rules:**

- **Subject**: lowercase, imperative mood, max 72 characters
- **Body**: wrapped at 100 characters, bullet points for multiple files
- **Footer**: `BREAKING CHANGE: description` or issue references
- **Scope**: auto-detected from directory structure
- **Type**: inferred from file paths and change patterns

### Type Detection Heuristics

| Pattern | Type |
|---------|------|
| New files in `src/`, `lib/`, `app/` | `feat` |
| Test files (`*.test.*`, `*.spec.*`, `__tests__/`) | `test` |
| Markdown and docs (`*.md`, `docs/`) | `docs` |
| `package.json`, lock files, build configs | `build` |
| CSS/style-only changes | `style` |
| CI configs (`.github/workflows/`, `Dockerfile`) | `ci` |
| Linting/formatting configs | `chore` |
| Renamed/moved files | `refactor` |
| Dominant deletions | `refactor` |

## Hook Integration

CommitCraft can integrate with your git workflow via the `prepare-commit-msg` hook:

```bash
# Install the hook
commit-craft hook install

# Now every `git commit` auto-populates the message
git add .
git commit
# Editor opens with a generated message — edit if needed, save, done

# Uninstall when you no longer need it
commit-craft hook uninstall
```

The hook only activates for normal commits. It won't interfere with merge commits, squashes, or amend operations.

## Learning Mode

CommitCraft adapts to your repo's style. Run `commit-craft learn` to build a profile:

```bash
commit-craft learn
# ✓ Style profile saved to .commit-craft.json
#
# Profile summary:
#   Average subject length: 48 chars
#   Uses scopes: yes
#   Bodies common: no
#   Top types: feat, fix, refactor
#   Known scopes: api, auth, core, ui
```

The profile tracks:
- **Common types** — which commit types you use most
- **Subject length** — average character count
- **Scope usage** — whether scopes are used and how often
- **Body frequency** — whether commit bodies are common
- **Scope-to-file mappings** — which directories map to which scopes

## Example Output

```bash
$ git add src/auth/login.ts src/auth/session.ts
$ commit-craft generate
```

Output:
```
feat(auth): add login and session handling
```

```bash
$ git add src/
$ commit-craft generate --body
```

Output:
```
feat: update core module

- Add src/api/handler.ts (+45)
- Modify src/auth/login.ts (+12/-8)
- Remove src/auth/legacy.ts (-120)
```

```bash
$ git add package.json yarn.lock
$ commit-craft generate
```

Output:
```
build: update dependencies
```

## How It Works

1. **Read staged diff** — Runs `git diff --cached` to get the staged changes
2. **Parse diff** — Splits by file, extracts hunks, counts additions/deletions
3. **Analyze** — Applies heuristic rules to determine type, scope, and subject
4. **Learn** — Loads or builds a style profile from commit history
5. **Generate** — Formats a Conventional Commits message matching your style
6. **Commit** — Optionally opens your editor and runs `git commit`

## Project Structure

```
src/
├── index.ts       # CLI entry point with commander
├── diff.ts        # Git diff reading and parsing
├── analyzer.ts    # Diff analysis — type, scope, subject detection
├── generator.ts   # Commit message formatting and generation
├── learner.ts     # Style learning from git history
├── hook.ts        # Git hook install/uninstall management
├── editor.ts      # Open $EDITOR for message review
└── templates.ts   # Type definitions, constants, and templates
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`commit-craft commit`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## License

MIT © [katogatogato](https://github.com/katogatogato)
