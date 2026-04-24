---
id: git-diff-summarizer
name: Git Diff Summarizer
version: 1.0.0
description: >
  Parses a git diff or patch file and produces a structured summary of changes:
  files modified, lines added and removed per file, a plain-English description
  of what changed, and a suggested conventional commit message following the
  feat/fix/chore/refactor/docs prefix convention.
capability:
  type: data-transform
  inputs:
    - "diff_text:string"
    - "context:string"
  outputs:
    - "files_changed:list"
    - "lines_added:int"
    - "lines_removed:int"
    - "summary:string"
    - "commit_message:string"
graph:
  depends_on: []
  complements: ["github-pr-reviewer", "code-review-commenter"]
  co_used_with: ["semantic-version-bumper"]
compatibility:
  claude_code: true
  gemini: true
  codex: true
  cursor: true
  mcp: true
risk: safe
---

## What this skill does

Reads a raw `git diff` or unified diff text and returns a structured breakdown of
what changed. Identifies the affected files, counts added and removed lines per file,
writes a human-readable English summary of the change intent, and suggests a
conventional commit message (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`) based
on the change type detected.

## Inputs

- `diff_text` — raw output of `git diff`, `git diff HEAD`, or a `.patch` file content
- `context` — optional string describing the purpose of the change (improves commit message quality)

## Outputs

- `files_changed` — list of `{path, additions, deletions, change_type}` objects
- `lines_added` — total lines added across all files
- `lines_removed` — total lines removed across all files
- `summary` — 2–3 sentence plain-English description of what the diff does
- `commit_message` — suggested conventional commit message, e.g. `fix: correct token expiry check in auth middleware`

## Example

```bash
git diff HEAD | asf query "summarize this diff and suggest a commit message"
```

Output:
```json
{
  "files_changed": [
    {"path": "src/auth.js", "additions": 4, "deletions": 2, "change_type": "modified"}
  ],
  "lines_added": 4,
  "lines_removed": 2,
  "summary": "Fixed token expiry comparison using strict inequality. Updated unit test to cover the edge case.",
  "commit_message": "fix: use strict inequality for token expiry check in auth middleware"
}
```
