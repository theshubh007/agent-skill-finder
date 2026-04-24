---
id: gitleaks-secret-detector
name: Gitleaks Secret Detector
version: 1.0.0
description: >
  Scans a git repository or file path for hardcoded secrets, API keys, tokens,
  and credentials using Gitleaks SAST rules. Returns findings with file path,
  line number, secret type (AWS key, GitHub token, Slack webhook, etc.), and a
  redacted preview. Returns clean=true when no secrets are detected.
capability:
  type: code-execution
  inputs:
    - "repo_path:string"
    - "config_path:string"
    - "branch:string"
  outputs:
    - "findings:list"
    - "total_count:int"
    - "clean:boolean"
graph:
  depends_on: []
  complements: ["sarif-formatter", "semgrep-code-scanner"]
  co_used_with: ["trivy-container-scan", "sbom-generator"]
compatibility:
  claude_code: true
  gemini: true
  codex: true
  cursor: false
  mcp: true
risk: exec
---

## What this skill does

Runs `gitleaks detect` against a local git repository and parses the JSON output
into structured findings. Each finding reports the rule ID, the type of credential
detected, the file and line number, and a redacted match preview. Never returns
the full unredacted secret value.

## Inputs

- `repo_path` — absolute or relative path to the git repository root
- `config_path` — optional path to a custom `.gitleaks.toml` allowlist config
- `branch` — optional branch name or commit SHA to scan (default: current HEAD)

## Outputs

- `findings` — list of `{rule_id, file, line_number, secret_type, redacted_match, commit}` objects
- `total_count` — total number of secrets detected
- `clean` — `true` when `total_count == 0`

## Example

```bash
gitleaks detect --source . --report-format json --report-path findings.json
```

```json
{
  "findings": [
    {
      "rule_id": "aws-access-token",
      "file": "scripts/deploy.sh",
      "line_number": 14,
      "secret_type": "AWS Access Key ID",
      "redacted_match": "AKIA***XYZ",
      "commit": "a3f2c1d"
    }
  ],
  "total_count": 1,
  "clean": false
}
```

## Notes

- Requires `gitleaks` binary on PATH (`brew install gitleaks` or download from GitHub releases)
- Use `config_path` to add allowlist entries for test fixtures or known false positives
- Output never includes the full unredacted secret — only the redacted preview
