---
id: github-pr-reviewer
name: GitHub PR Reviewer
version: 1.0.0
description: >
  Fetches a GitHub pull request diff via the GitHub REST API and returns
  structured review feedback — per-file annotations, severity-tagged issues
  (error/warning/suggestion), and an overall summary with a LGTM score.
capability:
  type: code-execution
  inputs:
    - "repo:string"
    - "pr_number:int"
    - "focus:string"
  outputs:
    - "review:object"
    - "lgtm_score:float"
    - "annotations:list[Annotation]"
graph:
  depends_on: []
  complements: ["github-issue-classifier", "code-diff-summarizer"]
  co_used_with: ["json-schema-validator", "openapi-spec-validator"]
compatibility:
  claude_code: true
  gemini: true
  codex: true
  cursor: true
  mcp: true
risk: network
---

# GitHub PR Reviewer

Fetches a pull request diff from the GitHub REST API and produces structured
review output suitable for direct injection into an AI agent's context.

## Inputs

| Name | Type | Required | Description |
|---|---|---|---|
| `repo` | string | yes | Owner/repo slug e.g. `"octocat/hello-world"` |
| `pr_number` | int | yes | Pull request number |
| `focus` | string | no | Review focus: `"security"`, `"performance"`, `"style"`, `"all"` (default: `"all"`) |

## Outputs

| Name | Type | Description |
|---|---|---|
| `review` | object | `{ summary, lgtm_score, file_count, annotation_count }` |
| `lgtm_score` | float | 0.0–1.0; 1.0 = no issues found |
| `annotations` | list[Annotation] | `{ file, line, severity, message, suggestion }` per issue |

## Severity levels

- `error` — must fix before merge (logic bugs, security issues, broken API contracts)
- `warning` — should fix (performance, style inconsistencies, deprecated APIs)
- `suggestion` — optional improvement (naming, readability, test coverage)

## Auth

Set `GITHUB_TOKEN` in environment for private repos and higher rate limits.
Without a token, GitHub API rate-limits to 60 requests/hour per IP.

## Example

```javascript
import { reviewPR } from './scripts/run.js';

const result = await reviewPR({
  repo: 'myorg/myrepo',
  pr_number: 42,
  focus: 'security',
});

console.log(result.review.summary);
// → "3 errors, 1 warning — authentication middleware exposes token in logs"

result.annotations.forEach(a =>
  console.log(`${a.severity.toUpperCase()} ${a.file}:${a.line} — ${a.message}`)
);
```
