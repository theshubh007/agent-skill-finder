<h1 align="center">agentskillfinder</h1>

<p align="center">
  <strong>Routes any task to 3–5 skills instead of hundreds. Zero LLM calls. Zero model downloads.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agentskillfinder">
    <img src="https://img.shields.io/npm/v/agentskillfinder" alt="npm version"/>
  </a>
  <a href="https://www.npmjs.com/package/agentskillfinder">
    <img src="https://img.shields.io/npm/dm/agentskillfinder" alt="npm downloads"/>
  </a>
  <a href="https://github.com/shubhamkothiya/agentskillfinder/actions/workflows/ci.yml">
    <img src="https://github.com/shubhamkothiya/agentskillfinder/actions/workflows/ci.yml/badge.svg" alt="CI"/>
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"/>
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node"/>
</p>

<p align="center">
  <a href="#quick-install">Quick Install</a> •
  <a href="#sdk-quickstart">SDK</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#cli-reference">CLI</a> •
  <a href="#platform-support">Platforms</a>
</p>

---

AI CLIs that expose hundreds of tools in every prompt waste context window, slow the model down, and make it harder to pick the right tool. AgentSkillFinder (ASF) routes each task to the 3–5 most relevant skills before the model ever sees the tool list — using pure BM25 keyword recall, Jaccard reranking, and a dependency-aware knowledge graph. No API keys. No model downloads. Runs entirely offline.

---

## Quick Install

One command. ASF installs a hook into your AI CLI and routes every prompt automatically from that point on.

```bash
npx agentskillfinder install claude   # Claude Code
npx agentskillfinder install gemini   # Gemini CLI
npx agentskillfinder install codex    # OpenAI Codex
npx agentskillfinder install cursor   # Cursor
```

Then build a skill index from your local skill registries:

```bash
asf ingest --sources ./path/to/skills --out ~/.asf
```

That's it. Every subsequent prompt is intercepted by ASF — the model sees only the relevant skills, not the full catalog.

---

## SDK Quickstart

For agent builders embedding ASF programmatically:

```javascript
import { buildIndex } from 'agentskillfinder';
import { JITRouter } from 'agentskillfinder/router';

// build once from your skill manifests
await buildIndex(manifests, { rootDir: './compiled_skills' });

// route at inference time — no LLM calls
const router = new JITRouter({ indexDir: './compiled_skills' });
const { bundle, timings } = await router.find({
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

**Example output:**

```
recall(12ms) + rerank(3ms) + graph(2ms) + hydrate(1ms) = 18ms total

BUNDLE  4 skills
  scientific-research-lookup     → papers:list[Paper]
  classify-pd-l1-tps             → tps_scores:dict
  publication-figure-style       → figure:Path
  citation-verifier              → bibtex:str

COMPOSITION PLAN
  step 1: scientific-research-lookup(query="PD-L1 breast cancer")
  step 2: classify-pd-l1-tps(papers)
  step 3: publication-figure-style(tps_scores, journal="nature")
  step 4: citation-verifier(papers)
```

---

## How It Works — 4-Stage Pipeline

```
Query
  │
  ▼
Stage 1: Okapi BM25 keyword recall ──────────────────→ top-K candidates    ≤15ms
  │
  ▼
Stage 2: Jaccard token overlap reranker ─────────────→ top-30 reranked     ≤5ms
          (or inject your own rerankerFn)
  │
  ▼
Stage 3: Token-bounded BFS over Skill Knowledge Graph → subgraph + deps    ≤3ms
  │
  ▼
Stage 4: Capability-typed I/O planner (topological sort) → SkillBundle     ≤2ms
  │
  ▼
SkillBundle.toAnthropic() / .toOpenAI() / .toGemini() / .toMcp()
```

**No model downloads.** Stages 1–2 are pure JavaScript — no ONNX, no native binaries, no 600MB embedding models. The reranker is injectable: swap in a cross-encoder or any scoring function without changing the pipeline.

**Dependency-safe.** Stage 3 follows `depends_on` edges unconditionally — a required upstream skill is never silently dropped even under tight token budgets.

---

## CLI Reference

### Hook install

```bash
asf install claude    # Claude Code  — PreToolUse hook → ~/.claude/settings.json
asf install gemini    # Gemini CLI   — BeforeToolSelection hook → ~/.gemini/settings.json
asf install codex     # OpenAI Codex — AGENTS.md + .codex/hooks.json
asf install cursor    # Cursor       — .cursor/rules/asf.mdc
```

### Index management

```bash
# ingest local skill registries → builds _index.json
asf ingest --sources ./registries --out ~/.asf

# validate a skill manifest before adding
asf validate skills/my-skill

# run as MCP stdio server
asf serve
```

### Debugging

```bash
# manually route a task (the hook does this automatically in normal use)
asf query "fetch SSE stream and execute bash command"

# measure routability metrics for any AI CLI codebase
asf measure ./some-ai-cli-project
```

---

## Platform Support

| Platform | Hook type | Output format |
|---|---|---|
| Claude Code | `PreToolUse` | `ToolParam[]` |
| Gemini CLI | `BeforeToolSelection` | `allowedFunctionNames[]` |
| OpenAI Codex | pre-exec filter | `ChatCompletionTool[]` |
| Cursor | rules file | `.cursor/rules/asf.mdc` |
| Any MCP host | stdio / SSE | MCP `Tool[]` |

---

## Why No Big Numbers Here

Context-window savings depend on your catalog size, task distribution, and how many skills you've indexed — numbers measured on our test corpus won't hold on yours. Run the eval on your own index:

```bash
# latency benchmark (pure JS, no index needed)
node eval/perf/latency_p50_p95.js

# retrieval quality against your own index
ASF_INDEX_DIR=~/.asf node eval/run_retrieval_eval.js
```

See [`maintainers_docs/testing_plan/benchmark_evaluation.md`](maintainers_docs/testing_plan/benchmark_evaluation.md) for the full 14-metric eval harness and per-platform testing guide.

---

## Privacy

ASF runs entirely offline. No API calls, no telemetry, no usage tracking. The only network activity is loading `_index.json` from your local filesystem.

---

## License

MIT — see [LICENSE](./LICENSE)

Third-party credits: [NOTICE](./NOTICE)
