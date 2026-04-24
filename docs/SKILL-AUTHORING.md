# SKILL.md Authoring Reference

## Directory Layout

Every skill is a directory. Minimum required structure:

```
my-skill/
├── SKILL.md          ← manifest (required)
└── scripts/
    └── run.js        ← at least one executable file (required)
```

Optional files that improve routability:

```
my-skill/
├── SKILL.md
├── scripts/
│   ├── run.js
│   └── helpers.js
├── test/
│   └── smoke.js      ← passed to `asf eval`
└── README.md         ← human-readable usage notes
```

---

## SKILL.md Frontmatter Spec

All fields are parsed by `src/manifest.js` (zod schema). Required fields are marked *.

```yaml
---
# ── Identity ──────────────────────────────────────────────────────────────────
id: my-skill                    # * unique slug, kebab-case, ≤ 64 chars
name: My Skill                  # * human-readable name
version: 1.0.0                  # semver; defaults to 0.1.0 if omitted
description: >                  # * one-to-three sentences; be specific.
  Fetches PubMed abstracts for a query, returns a ranked list of papers
  with DOIs, titles, and citation counts.

# ── Capability ────────────────────────────────────────────────────────────────
capability:
  type: retrieval               # * see capability type list below
  inputs:
    - "query:string"            # name:type pairs; type is any string
    - "max_results:int"
  outputs:
    - "papers:list[Paper]"

# ── Graph edges ───────────────────────────────────────────────────────────────
graph:
  depends_on: []                # skill IDs required at runtime (hard dependency)
  complements: []               # skill IDs that naturally follow this one
  co_used_with: []              # skill IDs often bundled together with this one

# ── Platform compatibility ────────────────────────────────────────────────────
compatibility:
  claude_code: true             # can run as a Claude Code tool
  gemini: false
  codex: false
  cursor: false
  mcp: true                     # can run as an MCP tool

# ── Security ──────────────────────────────────────────────────────────────────
risk: network                   # * safe | network | exec | critical | unsafe
---

# My Skill

Extended description, usage examples, edge cases. Markdown.
```

---

## Capability Types

| Type | Description | Example |
|---|---|---|
| `retrieval` | Search or lookup — returns a ranked list | PubMed search, web search |
| `code-execution` | Run code in a sandbox | Python REPL, bash runner |
| `file-io` | Read or write files on disk | CSV reader, file watcher |
| `web-search` | Query a public search engine | Google, DuckDuckGo |
| `data-transform` | Parse, convert, or reshape data | JSON→CSV, XML parse |
| `visualization` | Produce a chart, plot, or figure | matplotlib, vega-lite |
| `bioinformatics` | Genomics, proteomics, molecular ops | BLAST align, PDB fetch |
| `report-writing` | Format structured output as a document | LaTeX, Markdown, HTML |
| `communication` | Send a message to an external system | email, Slack, webhook |
| `database` | Query or mutate a database | SQL SELECT, schema migration |
| `security` | Cryptographic or access-control ops | sign, verify, encrypt |
| `devops` | Infrastructure or deployment ops | Docker run, k8s deploy |
| `ml-inference` | Call a model for prediction or embedding | GPT, BERT, CLIP |
| `planning` | Decompose a task into steps | goal planner, scheduler |

---

## Risk Tiers

| Tier | Runtime environment | Sandbox | When to use |
|---|---|---|---|
| `safe` | In-process | None | Pure computation, no I/O |
| `network` | In-process | Domain allow-list | HTTP to known APIs |
| `exec` | Docker microVM | Read-only FS | Shell commands, file writes |
| `critical` | Firecracker microVM | Isolated | Arbitrary code, privileged ops |
| `unsafe` | Rejected at gate | — | Never use; triggers ToolFlood block |

Set `risk` to the **highest tier** the skill may reach at runtime. If a skill fetches data over HTTP and also writes a file, use `exec` (not `network`).

---

## Graph Edge Semantics

| Field | Meaning | Effect on routing |
|---|---|---|
| `depends_on` | Skill B is required for skill A to produce correct output | BFS pulls B in regardless of its similarity score (prevents Composition Deadlock) |
| `complements` | Skill B naturally follows skill A in a pipeline | Planner suggests B after A |
| `co_used_with` | Skill B is often bundled alongside skill A | BFS expands to B when token budget allows |

At least one graph edge is required to pass the slop gate. A skill with no edges is isolated and will not appear in routing bundles.

---

## Validation Rules

`asf validate skills/my-skill` checks four things:

### 1. Schema — required fields

| Field | Requirement |
|---|---|
| `id` | Present, kebab-case string |
| `name` | Present, non-empty string |
| `description` | Present, at least 20 characters |
| `risk` | One of: `safe network exec critical unsafe` |

### 2. Slop gate — quality signals

A skill is **quarantined** (`slop_score < 0.4`) if it scores too low on these signals:

| Signal | Weight | Fail condition |
|---|---|---|
| `description_uniqueness` | 0.30 | Description too similar to existing skills |
| `graph_isolation` | 0.25 | No graph edges (`depends_on`, `complements`, `co_used_with` all empty) |
| `description_template_match` | 0.20 | Matches LLM boilerplate patterns (e.g. "This tool helps you…") |
| `name_collision` | 0.15 | Name too close to an existing canonical skill |
| `ast_duplicate` | 0.05 | Script body structurally identical to an existing skill |
| `empty_content` | 0.05 | `scripts/` directory missing or has zero executable lines |

A quarantined skill is preserved in `skills/` but excluded from all routing bundles. Rehabilitate by improving description uniqueness or adding graph edges.

A **tombstoned** skill (`slop_score < 0.2`) is added to `skills/_slop_blocklist.json` as an append-only audit record and will never appear in routing.

### 3. Capability type

`capability.type` must be one of the 14 recognized types listed above.

### 4. Duplicate check

If `skills/_index.json` exists, `asf validate` checks that `id` does not collide with any existing canonical skill from a different source path.

---

## Examples

### Minimal skill (safe tier)

```yaml
---
id: json-flatten
name: JSON Flatten
description: Flattens a nested JSON object to a single-level dict with dot-notation keys.
capability:
  type: data-transform
  inputs:
    - "nested:object"
  outputs:
    - "flat:object"
graph:
  co_used_with: ["csv-writer"]
compatibility:
  claude_code: true
  mcp: true
risk: safe
---
```

### Network skill with dependency

```yaml
---
id: pubmed-search
name: PubMed Search
description: >
  Queries the NCBI PubMed API for papers matching a keyword or MeSH term.
  Returns a ranked list of papers with title, abstract, DOI, and citation count.
capability:
  type: retrieval
  inputs:
    - "query:string"
    - "max_results:int"
  outputs:
    - "papers:list[Paper]"
graph:
  depends_on: []
  complements: ["citation-verifier", "publication-figure-style"]
  co_used_with: ["classify-pd-l1-tps"]
compatibility:
  claude_code: true
  gemini: true
  mcp: true
risk: network
---
```
