---
id: graphify
name: Graphify — Codebase Knowledge Graph Builder
version: 0.5.4
description: >
  Builds an interactive knowledge graph from any mix of code, docs, papers,
  images, and video/audio files. Extracts concepts, relationships, call graphs,
  and design rationale via AST (code) and Claude subagents (docs/media). Outputs
  interactive HTML, queryable JSON, and a plain-language audit report. Supports
  incremental updates, cross-repo merging, MCP server mode, and always-on
  assistant hooks for Claude Code, Cursor, Gemini CLI, Codex, and others.
capability:
  type: agentic-pipeline
  inputs:
    - "target_path:string"
    - "mode:enum[default,deep,directed,cluster-only,no-viz,update,watch,wiki]"
    - "flags:list[string]"
    - "url:string"
    - "query:string"
    - "node_label:string"
  outputs:
    - "graph_html:file"
    - "graph_json:file"
    - "graph_report_md:file"
    - "cache_dir:directory"
    - "query_result:string"
    - "path_result:string"
    - "explanation:string"
graph:
  depends_on: []
  complements: ["rag-chunk-retriever", "openapi-spec-validator"]
  co_used_with: ["git-diff-summarizer"]
compatibility:
  claude_code: true
  gemini: true
  codex: true
  cursor: true
  opencode: true
  aider: true
  kiro: true
  trae: true
  copilot: true
  mcp: true
risk: safe
---

## What this skill does

Graphify turns any corpus — code, docs, PDFs, images, video, audio — into a
structured knowledge graph. Three passes:

1. **AST pass** — deterministic extraction of classes, functions, imports, call
   graphs, docstrings, and `# WHY:`/`# NOTE:` rationale comments. No LLM needed.
2. **Transcription pass** — video/audio files transcribed locally with
   faster-whisper using domain-aware prompts from corpus god nodes.
3. **Semantic pass** — Claude subagents run in parallel over docs, papers,
   images, and transcripts to extract concepts, relationships, and design rationale.

Results merge into a NetworkX graph, clustered with Leiden community detection
(topology-based — no embeddings, no vector DB), and exported as:

- `graphify-out/graph.html` — interactive browser visualization (click nodes, search, filter by community)
- `graphify-out/graph.json` — persistent queryable graph
- `graphify-out/GRAPH_REPORT.md` — god nodes, surprising connections, suggested questions
- `graphify-out/cache/` — SHA256 cache; re-runs only process changed files

Every relationship is tagged:
- `EXTRACTED` — found directly in source (confidence 1.0)
- `INFERRED` — reasonable inference with `confidence_score` (0.0–1.0)
- `AMBIGUOUS` — flagged for review

## Supported file types

| Type | Extensions | Extraction method |
|------|-----------|------------------|
| Code | `.py .ts .js .jsx .tsx .mjs .go .rs .java .c .cpp .rb .cs .kt .scala .php .swift .lua .zig .ps1 .ex .exs .m .mm .jl .vue .svelte` | AST via tree-sitter + cross-file call graph + rationale comments |
| Docs | `.md .mdx .html .txt .rst` | Claude subagents |
| Office | `.docx .xlsx` | Converted to markdown → Claude (`pip install graphifyy[office]`) |
| Papers | `.pdf` | Citation mining + concept extraction |
| Images | `.png .jpg .webp .gif` | Claude vision |
| Video/Audio | `.mp4 .mov .mkv .webm .avi .m4v .mp3 .wav .m4a .ogg` | faster-whisper local transcription → Claude (`pip install graphifyy[video]`) |
| YouTube/URLs | any video URL | yt-dlp audio download → faster-whisper → Claude |

## Install

```bash
# Recommended
uv tool install graphifyy && graphify install

# or pipx
pipx install graphifyy && graphify install

# or pip
pip install graphifyy && graphify install
```

> **Note:** PyPI package is `graphifyy` (double-y). `graphify` on PyPI is unrelated.

## Core commands

```bash
# Build graph
/graphify .                        # current directory
/graphify ./src                    # specific folder
/graphify ./src --mode deep        # aggressive INFERRED edge extraction
/graphify ./src --directed         # preserve edge direction (source→target)
/graphify ./src --update           # incremental — only changed files, merge into existing graph
/graphify ./src --cluster-only     # rerun Leiden clustering only, no re-extraction
/graphify ./src --no-viz           # skip HTML, produce report + JSON only
/graphify ./src --watch            # auto-sync as files change (code: instant, docs: notifies)

# Export formats
/graphify ./src --obsidian                             # generate Obsidian vault
/graphify ./src --obsidian --obsidian-dir ~/vaults/p  # vault to specific directory
/graphify ./src --svg                                  # export graph.svg
/graphify ./src --graphml                              # export for Gephi/yEd
/graphify ./src --neo4j                                # generate cypher.txt
/graphify ./src --neo4j-push bolt://localhost:7687     # push to running Neo4j
/graphify ./src --wiki                                 # agent-crawlable wiki (index.md + articles)
/graphify ./src --mcp                                  # start MCP stdio server

# Query and navigate
/graphify query "what connects attention to the optimizer?"
/graphify query "show the auth flow" --dfs             # trace specific path
/graphify query "..." --budget 1500                    # cap at N tokens
/graphify query "..." --graph path/to/graph.json       # use specific graph file
/graphify path "DigestAuth" "Response"                 # shortest path between nodes
/graphify explain "SwinTransformer"                    # plain-language node explanation

# Add content
/graphify add https://arxiv.org/abs/1706.03762         # fetch paper, update graph
/graphify add https://x.com/karpathy/status/...        # fetch tweet
/graphify add <video-url>                              # download, transcribe, add
/graphify add https://... --author "Name" --contributor "Name"

# Clone GitHub repo and graph it
graphify clone https://github.com/karpathy/nanoGPT    # clones to ~/.graphify/repos/
graphify clone https://... --branch dev --out ./out

# Cross-repo merge
graphify merge-graphs r1/graphify-out/graph.json r2/graphify-out/graph.json
graphify merge-graphs g1.json g2.json g3.json --out cross-repo.json

# Git hooks (platform-agnostic)
graphify hook install       # post-commit + post-checkout auto-rebuild
graphify hook uninstall
graphify hook status
```

## Always-on assistant integration

After building a graph, install always-on hooks so the assistant reads
`GRAPH_REPORT.md` before searching files:

```bash
graphify claude install     # CLAUDE.md section + PreToolUse hook (Claude Code)
graphify cursor install     # .cursor/rules/graphify.mdc (alwaysApply: true)
graphify gemini install     # GEMINI.md + BeforeTool hook
graphify codex install      # AGENTS.md + .codex/hooks.json PreToolUse hook
graphify opencode install   # AGENTS.md + tool.execute.before plugin
graphify kiro install       # .kiro/skills/ + .kiro/steering/graphify.md (always-on)
graphify aider install      # AGENTS.md
graphify copilot install    # ~/.copilot/skills/graphify/SKILL.md
graphify vscode install     # .github/copilot-instructions.md (VS Code Copilot Chat)
graphify trae install       # AGENTS.md (no hook support — AGENTS.md is always-on)
graphify droid install      # AGENTS.md (Factory Droid)
graphify claw install       # AGENTS.md (OpenClaw)
graphify hermes install     # AGENTS.md + ~/.hermes/skills/
graphify antigravity install  # .agents/rules + .agents/workflows

# Uninstall any platform
graphify <platform> uninstall
```

**What the hook does for Claude Code:** fires before every Glob/Grep call. If
`graphify-out/graph.json` exists, Claude sees: *"graphify: Knowledge graph exists.
Read GRAPH_REPORT.md for god nodes and community structure before searching raw files."*

**Always-on vs explicit `/graphify` commands:**
- Hook/always-on = navigates by graph map (fast, coarse)
- `/graphify query`, `/graphify path`, `/graphify explain` = hop-by-hop graph traversal,
  exact paths, edge-level detail (relation type, confidence, source location)

## Excluding paths

Create `.graphifyignore` in project root (same syntax as `.gitignore`):

```
# .graphifyignore
vendor/
node_modules/
dist/
*.generated.py
AGENTS.md
CLAUDE.md
```

Works correctly when graphify runs on a subfolder.

## MCP server mode

```bash
python -m graphify.serve graphify-out/graph.json
```

Exposes: `query_graph`, `get_node`, `get_neighbors`, `shortest_path`.

WSL/Linux — use a venv to avoid PEP 668 conflicts:

```bash
python3 -m venv .venv && .venv/bin/pip install "graphifyy[mcp]"
```

```json
{
  "mcpServers": {
    "graphify": {
      "type": "stdio",
      "command": ".venv/bin/python3",
      "args": ["-m", "graphify.serve", "graphify-out/graph.json"]
    }
  }
}
```

## Team workflows

Commit `graphify-out/` (skip heavy/local-only files):

```gitignore
# commit graph outputs, skip local-only
graphify-out/cache/        # optional: skip to keep repo small
graphify-out/manifest.json # mtime-based, invalid after git clone — always ignore
graphify-out/cost.json     # local token tracking
```

Workflow:
1. One person runs `/graphify .`, commits `graphify-out/`.
2. Teammates pull — assistant reads `GRAPH_REPORT.md` immediately, no extra steps.
3. `graphify hook install` — graph rebuilds automatically after every commit/branch switch.
4. For doc/paper changes: whoever edits runs `/graphify --update`.

## What the report surfaces

- **God nodes** — highest-degree concepts (what everything connects through)
- **Surprising connections** — ranked by composite score; code-paper edges rank
  higher than code-code; includes plain-English *why*
- **Suggested questions** — 4–5 questions the graph is uniquely positioned to answer
- **Design rationale** — `# NOTE:`, `# IMPORTANT:`, `# HACK:`, `# WHY:` comments
  and docstrings extracted as `rationale_for` nodes
- **Confidence scores** — every `INFERRED` edge has `confidence_score` (0.0–1.0);
  `EXTRACTED` edges are always 1.0
- **Semantic similarity edges** — cross-file conceptual links with no structural
  connection (same algorithm in code + paper, two functions solving the same problem)
- **Hyperedges** — group relationships connecting 3+ nodes (all classes implementing
  a shared protocol, all functions in an auth flow)
- **Token benchmark** — printed after every run; typical savings ~71.5x fewer tokens
  per query vs reading raw files

## Querying graph.json with an LLM

Don't paste the full `graph.json` into a prompt. Use the focused workflow:

```bash
# 1. High-level orientation
cat graphify-out/GRAPH_REPORT.md

# 2. Focused subgraph for a specific question
graphify query "show the auth flow" --graph graphify-out/graph.json

# 3. Give that focused output to your assistant
```

Prompt template:
```
Use this graph query output to answer the question.
Prefer the graph structure over guessing, and cite source files when possible.

<graph output here>
```

## Version history (recent)

| Version | Key fix |
|---------|---------|
| 0.5.4 | SSRF DNS rebinding fix in `safe_fetch`; yt-dlp SSRF bypass fix via `validate_url` |
| 0.5.3 | Cache namespace fix — AST cache in `cache/ast/`, semantic in `cache/semantic/` (previously collided) |
| 0.5.2 | PreToolUse hook matches `Bash` (not `Glob\|Grep`) for Claude Code v2.1.117+ |
| 0.5.1 | Node ID collision fix for same-named files in different dirs; portable `source_file` paths; desync guard; TypeScript `@/` path alias resolution; Show All/Hide All in HTML |
| 0.5.0 | `graphify clone`, `graphify merge-graphs`, `CLAUDE_CONFIG_DIR` support, shrink guard, `build_merge()`, duplicate node deduplication |

## Example usage

```bash
# Build graph on current project
/graphify .

# Answer architecture questions via graph (faster than grep)
/graphify query "what calls the token refresh endpoint?"
/graphify path "UserModel" "AuthMiddleware"
/graphify explain "RateLimiter"

# Keep graph fresh during development
graphify hook install
/graphify . --watch

# Cross-repo analysis
graphify merge-graphs frontend/graphify-out/graph.json backend/graphify-out/graph.json --out cross.json
/graphify query "what data flows from frontend to backend?" --graph cross.json
```
