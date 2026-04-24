# Contributing to AgentSkillFinder

## Skill Authoring Guide

A skill is a directory with at minimum:

```
my-skill/
├── SKILL.md        # frontmatter + description
└── scripts/
    └── run.js      # at least one executable file
```

### SKILL.md frontmatter

```yaml
---
id: my-skill
name: My Skill
version: 1.0.0
description: One sentence. What this skill does. Be specific.
capability:
  type: retrieval          # see capability type list below
  inputs:
    - "query:string"
  outputs:
    - "results:list[Result]"
graph:
  depends_on: []           # skill IDs required at runtime
  complements: []          # skill IDs that naturally follow
  co_used_with: []         # skill IDs often in the same bundle
compatibility:
  claude_code: true
  gemini: false
  codex: false
  cursor: false
  mcp: true
risk: safe                 # safe | network | exec | critical | unsafe
---

Longer description here. Explain inputs, outputs, and when to use this skill.
```

### Capability types

`retrieval` | `code-execution` | `file-io` | `web-search` | `data-transform` |
`visualization` | `bioinformatics` | `report-writing` | `communication` |
`database` | `security` | `devops` | `ml-inference` | `planning`

### Risk tiers

| Tier | Meaning | Examples |
|---|---|---|
| `safe` | In-process only, no I/O | JSON parse, text transform |
| `network` | HTTP to known domains | API fetch, web search |
| `exec` | Shell commands, file writes | bash execution, file creation |
| `critical` | Arbitrary code, privileged ops | Docker run, sudo commands |
| `unsafe` | Rejected at gate | ToolFlood signatures |

---

## PR Checklist

Before opening a PR:

- [ ] `npm test` passes locally
- [ ] `npm run lint` passes with no errors
- [ ] New skills pass `asf validate skills/my-skill`
- [ ] At least one graph edge declared (`depends_on`, `complements`, or `co_used_with`)
- [ ] Description is not a paraphrase of an existing skill (`slop_score >= 0.4`)
- [ ] `scripts/` directory exists with at least one executable file
- [ ] Risk tier accurately reflects the skill's runtime behavior

---

## Slop Gate Rules

Skills that fail the slop gate are quarantined (not deleted). A quarantined skill:
- Does not appear in routing bundles
- Is preserved in `skills/` for audit
- Can be rehabilitated by improving description uniqueness or adding graph edges

A skill is quarantined if `slop_score < 0.4`. The score is computed from 6 signals:

1. `description_uniqueness` — too similar to existing skills
2. `graph_isolation` — no graph edges declared
3. `description_template_match` — matches known LLM boilerplate patterns
4. `name_collision` — name too close to an existing canonical skill
5. `ast_duplicate` — script is structurally identical to an existing skill
6. `empty_content` — missing `scripts/` or zero executable lines

---

## How CI Works

On every push to `main` and every PR:

1. **Lint** — ESLint runs over `src/`, `bin/`, `eval/`, `test/`
2. **Test** — `node --test` runs all test files
3. **Validate skills** (PRs only) — `asf validate` runs on every skill in `skills/`

On git tag push (`v*`):

4. **Publish** — `npm publish` with provenance to npm registry

---

## Local Development

```bash
# install deps
npm install

# run tests
npm test

# run linter
npm run lint

# ingest registries
node bin/asf.js ingest ./registries

# query
node bin/asf.js query "your task here"

# validate a skill
node bin/asf.js validate skills/my-skill
```
