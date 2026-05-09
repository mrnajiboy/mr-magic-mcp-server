---
name: pre-push-release-automation
description: Executes a complete pre-push, GitHub CI, Release Please, and post-release verification loop. Use when the user asks to run final checks, push to GitHub, merge an auto-release PR, verify CI/CD, publish via Release Please, or perform an end-to-end release handoff.
---

# Pre-Push Release Automation

## Overview

Run the full release loop with minimal back-and-forth: local checks, scoped formatting, commit, push, CI monitoring, Release Please PR handling, post-merge verification, and final repository synchronization.

This skill is optimized for Roo Code sessions where the user explicitly asks to push and merge the auto-release PR if checks pass.

## When to Use

Use this skill when the user asks for any of these:

- “final pre-push check”
- “lint, prettify, pass, then push”
- “push to git”
- “merge the auto-release PR if CI/CD passes”
- “run release please and publish”
- “verify CI after merge”

## Preconditions

- Confirm the repository is a Git working tree.
- Confirm the intended branch and remote with `git status --short --branch` and `git remote -v`.
- Never include unrelated user changes unless explicitly requested.
- Do not manually edit release-generated files such as `CHANGELOG.md`, `.release-please-manifest.json`, `package.json`, or lockfiles unless the current task specifically requires release metadata changes. Let Release Please own release-note and version bumps.

## Standard Flow

### 1. Inspect repository state

Run:

```bash
git status --short --branch
git remote -v
```

If unexpected deleted or modified files appear, pause and determine whether they are related. Restore unrelated changes before committing unless the user explicitly wants them included.

### 2. Run local checks

Prefer the project’s native commands. For this Node/npm project pattern:

```bash
npm run format
npm run test
npm run lint
npm run format:check
```

If full `format` touches release-generated or unrelated files, restore those unrelated files and run targeted checks on the intended files instead:

```bash
git restore -- CHANGELOG.md
npm run test
npm run lint
npx prettier --check <changed-files>
```

### 3. Review the diff and scan for secrets

Run:

```bash
git status --short
git diff --stat
git diff -- . | grep -iE 'password|secret|api[_-]?key|token' || true
```

Treat matches as review prompts, not automatic failures. Test fixtures may include placeholder strings, but real credentials must not be committed.

### 4. Commit atomically

Stage only intended files:

```bash
git add <intended-files>
git diff --staged --stat
git diff --staged | grep -iE 'password|secret|api[_-]?key|token' || true
git commit -m "<type>: <clear description>"
```

Use conventional types: `feat`, `fix`, `ci`, `docs`, `test`, `chore`, `refactor`.

### 5. Push

For trunk-based flows on `main`:

```bash
git push origin main
```

For feature branches, push the current branch and open/update a PR instead.

### 6. Watch CI/CD

After pushing, inspect runs:

```bash
gh run list --branch main --limit 10
```

Watch relevant run IDs:

```bash
gh run watch <run-id> --exit-status
```

Wait for all relevant push checks to pass before merging any generated release PR.

### 7. Handle Release Please PR

List open PRs:

```bash
gh pr list --state open --json number,title,headRefName,baseRefName,author,isDraft,statusCheckRollup,url
```

Identify the Release Please PR by bot author and branch name like `release-please--branches--main--components--...`.

Check it:

```bash
gh pr view <number> --json number,title,headRefName,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,url
```

Wait for PR checks:

```bash
gh pr checks <number> --watch --fail-fast
```

Merge only if:

- PR is not draft.
- `mergeable` is `MERGEABLE`.
- `mergeStateStatus` is clean or otherwise acceptable.
- Required checks pass.

Merge:

```bash
gh pr merge <number> --merge --delete-branch
```

### 8. Verify post-merge release and publish jobs

After merging, fetch and inspect main runs:

```bash
git fetch origin main --prune
gh run list --branch main --limit 5
```

Watch post-merge CI, Release Please, Socket Security, and publish jobs as applicable:

```bash
gh run watch <run-id> --exit-status
```

If publishing is part of the workflow, verify the publish job succeeded before declaring the release complete.

### 9. Sync local repository

Fast-forward local main:

```bash
git pull --ff-only origin main
git status --short --branch
```

The final status should be clean and aligned with `origin/main`.

## GitHub Actions Node 24 Upgrade Pattern

When asked to remove Node 20 deprecation warnings:

- Replace `actions/setup-node@v4` with `actions/setup-node@v6` when available.
- Use explicit `node-version: '24'` instead of `latest` to make CI deterministic.
- Upgrade `googleapis/release-please-action@v4` to `@v5` when available to avoid Node 20 runtime annotations.
- Keep `actions/checkout@v6` if already present.
- Verify by watching CI output for `Set up Node.js 24` and absence of Node 20 deprecation annotations.

Example:

```yaml
- name: Set up Node.js
  uses: actions/setup-node@v6
  with:
    node-version: '24'
    cache: npm
```

## Failure Handling

- If local checks fail, fix locally before committing.
- If `npm run format:check` fails only because of Release Please files, do not silently commit those changes. Restore generated files and use targeted Prettier checks for intended files.
- If CI fails, inspect logs with `gh run view <run-id> --log-failed`, fix, commit, push, and watch again.
- If Socket or security checks fail, do not merge the release PR unless the user explicitly accepts the risk.
- If Release Please does not open a PR for non-releaseable commits such as `ci:`, report that no auto-release PR was generated and stop after CI verification.

## Final Response Checklist

Include:

- Local commands run and pass/fail status.
- Commit SHA and message.
- Push target branch/remote.
- CI run status.
- Release PR number and URL if merged.
- Merge commit SHA if applicable.
- Publish job status if applicable.
- Local sync status.
- Any non-blocking annotations or warnings.
