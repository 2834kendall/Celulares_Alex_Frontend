# Git & Jira Workflow Standard — SGRH

**Project:** Sistema de Gestión de Recursos Humanos (SGRH) — Celulares Alex
**Jira Project Key:** `SGRH`
**Status:** Active
**Last updated:** 2026-06-23

## Purpose

This document defines the branching, commit, and pull request conventions for the SGRH project. The goal is to keep Git history traceable to Jira issues automatically, so that every branch, commit, and PR shows up in the corresponding Jira ticket's **Development** panel without any manual linking.

All technical content (branch names, commit messages, PR titles/descriptions) is written in **English**, following common industry convention, regardless of the spoken language used in code comments, documentation prose, or team communication.

---

## 1. Branch Naming Convention

### Pattern

```
<type>/<JIRA-KEY>-<short-kebab-case-description>
```

### Branch Types

| Type | Use case |
|---|---|
| `feature/` | New functionality |
| `fix/` | Bug fix |
| `hotfix/` | Urgent production fix |
| `chore/` | Tooling, dependencies, config, maintenance |
| `docs/` | Documentation only |
| `refactor/` | Code restructuring without behavior change |
| `test/` | Adding or fixing tests only |

### Examples

```
feature/SGRH-57-frontend-base-inicial
fix/SGRH-63-login-token-expiration
chore/SGRH-70-update-dependencies
docs/SGRH-81-api-readme
```

### Rules

- The Jira key **must** appear exactly as issued (e.g. `SGRH-57`), so Jira's Git integration can detect and link it automatically.
- Description is short (3–5 words), in English, lowercase, kebab-case.
- One branch per Jira issue. If a task grows beyond its original scope, split it into a new Jira sub-task/issue rather than overloading the branch.

---

## 2. Branching Model

```
main          → production-ready code, tagged releases only
  └── develop → integration branch, always deployable to staging
        └── feature/SGRH-57-frontend-base-inicial
        └── fix/SGRH-63-login-token-expiration
```

- Feature/fix/chore branches are created **from** `develop` and merged **back into** `develop` via Pull Request.
- `main` only receives merges from `develop` (release) or from `hotfix/` branches (urgent prod fixes), tagged with a version (see §6).
- Never commit directly to `main` or `develop`.

---

## 3. Commit Message Convention

Based on **[Conventional Commits](https://www.conventionalcommits.org/)**, prefixed with the Jira key.

### Pattern

```
<JIRA-KEY>: <type>(<optional-scope>): <short summary in imperative mood>

<optional body explaining what and why>

<optional footer: breaking changes, references>
```

### Commit Types

| Type | Description |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `style` | Formatting, whitespace, no logic change |
| `chore` | Build process, dependencies, tooling |
| `docs` | Documentation only |
| `test` | Adding or correcting tests |
| `perf` | Performance improvement |

### Examples

```
SGRH-57: feat(frontend): scaffold base folder structure and routing

Set up Vite + React project structure with components, pages,
hooks, and services folders. Added base router configuration
and environment variable handling.
```

```
SGRH-63: fix(auth): refresh token before expiration window

Token was expiring mid-session due to missing refresh logic
in the Supabase auth hook.
```

```
SGRH-70: chore(deps): bump next from 14.1.0 to 14.2.3
```

### Rules

- Subject line ≤ 72 characters.
- Imperative mood ("add", not "added" or "adds").
- One logical change per commit — avoid bundling unrelated changes.
- Body is optional but encouraged for non-trivial changes: explain **why**, not just what (the diff already shows what).

---

## 4. Pull Request Convention

### PR Title

Same pattern as commits, but using the Jira issue title for clarity:

```
SGRH-57: Frontend - Base Inicial
```

### PR Description Template

```markdown
## Jira
[SGRH-57](https://your-domain.atlassian.net/browse/SGRH-57)

## Summary
Brief explanation of what this PR does and why.

## Changes
- [ ] Change 1
- [ ] Change 2
- [ ] Change 3

## How to test
1. Step one
2. Step two

## Checklist
- [ ] Code tested locally
- [ ] No lint errors
- [ ] Tests added/updated (if applicable)
- [ ] Documentation updated (if applicable)
```

### Merge Strategy

- **Squash and merge** into `develop`. The squash commit message should follow the same `<JIRA-KEY>: <type>: <summary>` convention, keeping `develop`'s history clean (one commit per completed issue).
- Require at least **1 approval** before merging (adjust per team size).
- Delete the branch after merge.

---

## 5. Jira Integration Notes

- Connect your Git provider (GitHub/GitLab/Bitbucket) to Jira via **Jira Settings → Apps → Git integrations**, or the equivalent marketplace app for your provider.
- Once connected, any branch, commit, or PR containing a valid issue key (`SGRH-XX`) automatically appears in that issue's **Development** panel — no manual linking needed.
- Smart commits (optional): you can transition issues directly from commit messages, e.g.:
  ```
  SGRH-57: feat(frontend): scaffold base structure #done
  ```
  Common smart commit suffixes: `#comment`, `#time`, `#<status>` (e.g. `#in-review`, `#done`). Enable smart commits in Jira settings if you want this.

---

## 6. Release Versioning (suggested)

Use **Semantic Versioning** (`MAJOR.MINOR.PATCH`) for tags on `main`:

```
v1.0.0   → initial production release
v1.1.0   → new backward-compatible feature
v1.1.1   → backward-compatible bug fix
v2.0.0   → breaking change
```

Tag format: `git tag -a v1.1.0 -m "SGRH Sprint 1: Architecture & Security baseline"`

---

## Quick Reference

```
Branch:  feature/SGRH-57-frontend-base-inicial
Commit:  SGRH-57: feat(frontend): scaffold base folder structure
PR:      SGRH-57: Frontend - Base Inicial
Merge:   Squash and merge → develop
Tag:     v1.1.0 (on release to main)
```
