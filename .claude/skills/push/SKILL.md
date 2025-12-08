---
name: push
description: Push code to develop, rebase onto main, and merge to main. Use when the user wants to "push", "merge to main", "update main", "sync main", or "push and merge".
---

# Push Skill - Git Workflow Automation

Use this skill to push code from develop to main following the two-branch workflow.

## Workflow Overview

```
develop → push → CI passes → rebase onto main → PR → merge to main
```

## Step-by-Step Process

### Step 1: Check Current Status

```bash
# Verify on develop branch
git branch --show-current

# Check for uncommitted changes
git status

# Check if ahead of remote
git log origin/develop..HEAD --oneline
```

### Step 2: Commit Pending Changes (if any)

```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "$(cat <<'EOF'
type: Brief description

- Detailed change 1
- Detailed change 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

**Commit types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

### Step 3: Push to Develop

```bash
git push origin develop
```

### Step 4: Wait for CI to Pass

```bash
# Check CI status (5 automated checks)
gh run list --branch develop --limit 1

# Watch specific run if needed
gh run view <run-id>

# Wait for completion (poll every 30s)
gh run watch
```

**CI Checks** (all must pass):
- Secret Scanning (Gitleaks)
- ESLint
- TypeScript Build
- Jest Tests (307)
- NPM Security Audit

### Step 5: Rebase onto Main

```bash
# Fetch latest main
git fetch origin main

# Rebase develop onto main
git rebase origin/main

# Force push rebased develop
git push origin develop --force-with-lease
```

**If rebase conflicts occur**:
```bash
# Fix conflicts in files, then:
git add <fixed-files>
git rebase --continue

# Or abort and investigate:
git rebase --abort
```

### Step 6: Create PR and Merge

```bash
# Create PR
gh pr create --base main --head develop \
  --title "type: Brief description" \
  --body "$(cat <<'EOF'
## Summary
- Change 1
- Change 2

## Test plan
- [x] Tests pass
- [x] Manual verification

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# Wait for PR checks to pass
gh pr checks

# Merge PR (after checks pass)
gh pr merge --merge --delete-branch=false
```

### Step 7: Sync Local Main (Optional)

```bash
# Update local main branch
git checkout main
git pull origin main
git checkout develop
```

## Quick Reference

| Step | Command |
|------|---------|
| Check branch | `git branch --show-current` |
| Check status | `git status` |
| Push develop | `git push origin develop` |
| CI status | `gh run list --branch develop --limit 1` |
| Fetch main | `git fetch origin main` |
| Rebase | `git rebase origin/main` |
| Force push | `git push origin develop --force-with-lease` |
| Create PR | `gh pr create --base main --head develop --title "..." --body "..."` |
| Merge PR | `gh pr merge --merge` |

## One-Liner (After Changes Committed)

```bash
git push origin develop && \
gh run watch && \
git fetch origin main && \
git rebase origin/main && \
git push origin develop --force-with-lease && \
gh pr create --base main --head develop --title "Release" --body "Merged from develop" && \
gh pr merge --merge
```

## Troubleshooting

### CI Fails
```bash
# View failed run details
gh run view <run-id> --log-failed

# Fix issues, commit, and push again
git add . && git commit -m "fix: Address CI failures" && git push origin develop
```

### Rebase Conflicts
```bash
# See conflicting files
git status

# After fixing conflicts
git add <files>
git rebase --continue
```

### PR Already Exists
```bash
# List open PRs
gh pr list

# View existing PR
gh pr view

# Close and recreate if needed
gh pr close <number>
```

### Force Push Rejected
```bash
# Someone else pushed to develop - fetch and retry
git fetch origin develop
git rebase origin/develop
git push origin develop --force-with-lease
```

## Branch Protection Notes

- `main` branch has protection rules
- Direct pushes to `main` are blocked
- PRs require CI checks to pass
- Always go through PR workflow
