# agentskillfinder

**3–5 tools instead of 1,800. ≤65ms. Zero LLM calls in the router.**

[![npm version](https://img.shields.io/npm/v/agentskillfinder)](https://www.npmjs.com/package/agentskillfinder)
[![npm downloads](https://img.shields.io/npm/dm/agentskillfinder)](https://www.npmjs.com/package/agentskillfinder)
[![CI](https://github.com/shubhamkothiya/agentskillfinder/actions/workflows/ci.yml/badge.svg)](https://github.com/shubhamkothiya/agentskillfinder/actions/workflows/ci.yml)
---

## The Problem

Production AI CLIs that expose hundreds or thousands of tools hit three structural failure modes at scale:

- **Coupling Lock** — a single god-node (e.g. gemini-cli's `Config`) routes everything; GNCI = 51.1
- **Fragmentation Collapse** — 788 isolated skill communities with 769 unnamed; CFI = 41.5 (opencode)
- **Composition Deadlock** — planner picks skill A but its dependency B falls below the retrieval threshold

Neither failure can be fixed by better retrieval alone. They require structural changes — a knowledge graph that makes skill relationships explicit, and a router that traverses it.

AgentSkillFinder (ASF) solves this.

---

## Benchmark — GAP-TD-5 vs Baselines

Evaluated on `sample_100.jsonl` (100 tasks × 20 categories, deduplicated with SimHash).

| Baseline | Hit@1 | Hit@5 | Hit@20 | MRR | Latency p50 | Latency p95 |
|---|---|---|---|---|---|---|
| Static-100 | 0.04 | 0.21 | 0.41 | 0.08 | 1 ms | 2 ms |
| Keyword-0 | 0.51 | 0.72 | 0.83 | 0.58 | 4 ms | 8 ms |
| Semantic-5 | 0.71 | 0.89 | — | 0.74 | 47 ms | 71 ms |
| **GAP-TD-5 (ours)** | **0.78** | **0.94** | **0.97** | **0.81** | **63 ms ✓** | **94 ms ✓** |

GAP-TD-5 uses BM25 + BGE-small recall → cross-encoder rerank → graph BFS. No LLM calls.
p50 ≤65ms target **verified** against 2,058-skill production index (`eval/perf/latency_p50_p95.js`).

---

## Token Savings

| Strategy | Context tokens injected |
|---|---|
| Naive (inject all tools) | 22,000,000 |
| Anthropic progressive-disclosure | 460,000 |
| **ASF (this library)** | **35,000** |

---

## Zero-Touch Install (Recommended)

Run once. Never think about it again.

```bash
npx agentskillfinder install claude   # Claude Code
npx agentskillfinder install gemini   # Gemini CLI
npx agentskillfinder install codex    # OpenAI Codex
npx agentskillfinder install cursor   # Cursor
```

After install, **every prompt is automatically routed** — ASF intercepts tool calls before they reach the model and injects the 3–5 most relevant skills. You never run `asf query` manually. The hook runs in the background on every invocation.

---

## SDK Quickstart (library / agent builders)

> Building your own AI CLI or agent framework and want to embed ASF programmatically?
> Use the SDK below. For Claude Code / Gemini CLI / opencode end users,
> [Zero-Touch Install](#zero-touch-install-recommended) above is all you need.

```typescript
import { SkillIndex } from 'agentskillfinder/skill-index';
import { JITRouter } from 'agentskillfinder/router';

// build once (or pull pre-built index from CDN)
await SkillIndex.build({
  sources: ['./registries/antigravity', './registries/claude-skills'],
  outputDir: './compiled_skills',
});

// route at inference time — no LLM calls
const router = new JITRouter({ indexDir: './compiled_skills' });
const bundle = await router.find({
  task: 'find PD-L1 papers and produce a Nature-style figure',
  tokenBudget: 4000,
  maxSkills: 5,
});

// emit to your platform
const tools = bundle.toAnthropic();   // ToolParam[]
// bundle.toOpenAI()                  // ChatCompletionTool[]
// bundle.toGemini()                  // Tool[]
// bundle.toMcp()                     // MCP Tool[]
```

**Output:**
```
Stages: recall(12ms) + rerank(47ms) + graph(3ms) + hydrate(1ms) = 63ms total

BUNDLE (4 skills, 3,840 tokens)
  1. scientific-research-lookup    score=0.91  risk=network
  2. classify-pd-l1-tps            score=0.84  risk=safe
  3. publication-figure-style      score=0.82  risk=safe
  4. citation-verifier             score=0.71  risk=network

COMPOSITION PLAN
  step 1: scientific-research-lookup(query="PD-L1 breast cancer") → papers:list[Paper]
  step 2: classify-pd-l1-tps(papers) → tps_scores:dict
  step 3: publication-figure-style(tps_scores, journal="nature") → figure:Path
  step 4: citation-verifier(papers) → bibtex:str
```

---

## CLI Reference

### Hook install (normal user path)

```bash
asf install claude    # Claude Code — writes PreToolUse hook to ~/.claude/CLAUDE.md
asf install gemini    # Gemini CLI  — writes skillRouter config to .gemini/settings.json
asf install codex     # OpenAI Codex — appends to AGENTS.md + .codex/hooks.json
asf install cursor    # Cursor — writes .cursor/rules/asf.mdc
```

### Registry management

```bash
# pull pre-built canonical index from CDN (~40MB, 2,058 skills)
asf pull

# ingest local registries → canonical skill index
asf ingest ./registries

# incremental rebuild (SHA-256 cache, only changed skills re-extracted)
asf reindex
```

### Debugging / development tools

These commands are for testing and development — **not** the normal user flow.

```bash
# manually route a task (debug only — the hook does this automatically in normal use)
asf query "fetch SSE stream and execute bash command"

# validate a skill before submitting a PR
asf validate skills/my-skill

# smoke-eval routing quality for a specific skill
asf eval my-skill-id

# measure routability metrics for any AI CLI codebase
asf measure ./some-ai-cli-project

# run as MCP stdio server
asf serve
```

---

## How It Works — 4-Stage Pipeline

```
Query
  │
  ▼
Stage 1: BM25 + BGE-small bi-encoder (LanceDB hybrid) ──→ top-100 candidates   ≤10ms
  │
  ▼
Stage 2: BGE-reranker cross-encoder ──────────────────→ top-30 reranked         ≤50ms
  │
  ▼
Stage 3: Token-bounded BFS over Skill Knowledge Graph ─→ subgraph + deps        ≤3ms
  │
  ▼
Stage 4: Capability-typed I/O planner (topological sort) → SkillBundle          ≤2ms
  │
  ▼
SkillBundle.toAnthropic() / .toOpenAI() / .toGemini() / .toMcp()
```

All stages run offline. No API keys required. No LLM calls in the routing path.

---

## Supported Registries

| Registry | Skills |
|---|---|
| antigravity-awesome-skills | 1,431 |
| claude-skills | 235 |
| scientific-agent-skills | 133 |
| awesome-claude-skills | 832 |
| Any MCP server (`mcp://`) | dynamic |

After canonicalization (22% dedup): **2,058 canonical skills**

---

## Platform Support

| Platform | Install command | Output format |
|---|---|---|
| Claude Code | `asf install claude` | `ToolParam[]` |
| Gemini CLI | `asf install gemini` | `ActivateSkillToolInput[]` |
| OpenAI Codex | `asf install codex` | `ChatCompletionTool[]` |
| Cursor | `asf install cursor` | `.cursor/rules/asf.mdc` |
| Any MCP host | `asf serve` | MCP stdio server |

---

## License

MIT — see [LICENSE](./LICENSE)

Third-party credits: [NOTICE](./NOTICE)
