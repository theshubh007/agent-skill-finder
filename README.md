<h1 align="center">agentskillfinder</h1>

<p align="center">
  <strong>Routes any task to 3–5 skills instead of hundreds. Zero LLM calls. Zero model downloads.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agentskillfinder">
    <img src="https://img.shields.io/npm/v/agentskillfinder" alt="npm version"/>
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
  <a href="#using-with-ai-clis">AI CLIs</a> •
  <a href="#building-agents">Agent SDK</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#cli-reference">CLI</a> •
  <a href="#platform-support">Platforms</a>
</p>

---

AI CLIs that expose hundreds of tools in every prompt waste context window, slow the model down, and make it harder to pick the right tool. AgentSkillFinder (ASF) routes each task to the 3–5 most relevant skills before the model ever sees the tool list — using pure BM25 keyword recall, Jaccard reranking, and a dependency-aware knowledge graph. No API keys. No model downloads. Runs entirely offline.

---

## Performance

Benchmarked on a 120-skill mixed catalog (legal brief analysis pipeline + general dev skills) across 20 queries:

| Metric | Without ASF | With ASF |
|--------|------------|----------|
| Tools in context | 120 every request | ~5 per request |
| Tokens per request | ~6,544 | ~274 |
| **Token reduction** | — | **95.8%** |
| **Routing latency** | — | **≤2ms** |

No LLM calls in the router. Stages: BM25 recall (≤2ms) + Jaccard rerank (≤1ms) + graph walk (≤1ms) + planner (≤1ms).

Full 20-query benchmark with per-query breakdowns: [performance_testing_result.md](./performance_testing_result.md)

---

## Using with AI CLIs

ASF installs a hook into your AI CLI that intercepts every prompt and narrows the tool list before the model sees it. Two steps: install the hook, then build a skill index from your registries.

```bash
# build a skill index once (point at your local skill directories)
npx agentskillfinder ingest --sources ./skills --out ~/.asf
```

### Claude Code

```bash
npx agentskillfinder install claude
```

ASF writes a `PreToolUse` hook into `~/.claude/settings.json`. Every subsequent Claude Code prompt is intercepted — the model receives only the 3–5 tools that match the task.

```bash
claude "scan this repo for hardcoded secrets and generate a SARIF report"
# → Claude receives: secret-scanner, sarif-formatter, file-walker, git-log-reader
# → not: all 200 tools in your registry
```

Verify the hook is active:

```bash
asf query "scan this repo for hardcoded secrets"
# prints the bundle ASF would inject for that task
```

---

### Gemini CLI

```bash
npx agentskillfinder install gemini
```

ASF writes a `BeforeToolSelection` hook into `~/.gemini/settings.json`. Gemini calls ASF before the LLM picks a tool — ASF returns `allowedFunctionNames` to narrow the selection space.

```bash
gemini -p "fetch a GitHub PR diff and review it for security issues"
# → Gemini receives: github-pr-fetcher, security-auditor, diff-parser
# → allowedFunctionNames injected by ASF before model picks
```

The hook merges into any existing `BeforeToolSelection` entries (e.g. claude-mem) — existing hooks are preserved.

---

### OpenAI Codex

```bash
npx agentskillfinder install codex
```

ASF writes a pre-exec filter into `.codex/hooks.json` and adds a routing directive to `AGENTS.md`. Codex applies the filter before tool execution.

```bash
codex "refactor this Python module to use async/await"
# → Codex receives: python-ast-refactor, async-converter, test-runner
```

---

### Cursor

```bash
npx agentskillfinder install cursor
```

ASF writes a rules file to `.cursor/rules/asf.mdc`. Cursor includes this rule on every request, directing the model to request only relevant tools.

```bash
# open Cursor in your project — ASF rule is active automatically
# use Cursor chat/composer normally
```

---

## Building Agents

For programmatic use: build an index from skill manifests once, then call `JITRouter.find()` at inference time. No LLM calls. No model downloads. The router returns a `SkillBundle` that emits the right tool format for your platform.

### Index + Router Setup

```javascript
import { buildIndex } from 'agentskillfinder';
import { JITRouter } from 'agentskillfinder/router';

// build once — reads manifest files, writes _index.json to rootDir
await buildIndex(manifests, { rootDir: './compiled_skills' });

// instantiate once per process
const router = new JITRouter({ indexDir: './compiled_skills' });
```

### Skill Manifest Format

```json
{
  "id": "github-pr-reviewer",
  "name": "GitHub PR Reviewer",
  "description": "Fetch a GitHub pull request diff and review it for issues",
  "capability": {
    "inputs": ["repo:string", "pr_number:integer"],
    "outputs": ["review:ReviewComment[]"]
  },
  "graph": {
    "depends_on": ["github-auth"],
    "complements": ["security-scanner"]
  }
}
```

`depends_on` edges are unconditional — ASF always pulls in a required upstream skill even under tight token budgets.

---

### Anthropic SDK

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { JITRouter } from 'agentskillfinder/router';

const client = new Anthropic();
const router = new JITRouter({ indexDir: '~/.asf' });

async function run(task) {
  const { bundle, timings } = await router.find({ task, tokenBudget: 4000, maxSkills: 5 });

  console.log(`routed in ${timings.total}ms → ${bundle.manifests.length} skills`);

  return client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    tools: bundle.toAnthropic(),   // ToolParam[] — only relevant tools
    messages: [{ role: 'user', content: task }],
  });
}
```

### OpenAI SDK

```javascript
import OpenAI from 'openai';
import { JITRouter } from 'agentskillfinder/router';

const client = new OpenAI();
const router = new JITRouter({ indexDir: '~/.asf' });

async function run(task) {
  const { bundle } = await router.find({ task, tokenBudget: 4000, maxSkills: 5 });

  return client.chat.completions.create({
    model: 'gpt-4o',
    tools: bundle.toOpenAI(),      // ChatCompletionTool[]
    messages: [{ role: 'user', content: task }],
  });
}
```

### Google Gemini SDK

```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { JITRouter } from 'agentskillfinder/router';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const router = new JITRouter({ indexDir: '~/.asf' });

async function run(task) {
  const { bundle } = await router.find({ task, tokenBudget: 4000, maxSkills: 5 });

  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: bundle.toGemini(),      // Tool[]
  });

  return model.generateContent(task);
}
```

### MCP Server

ASF exposes itself as an MCP stdio server. Any MCP host (Claude Desktop, VS Code, custom agents) can connect and query the router over the standard protocol.

```bash
asf serve
```

Add to your MCP host config:

```json
{
  "mcpServers": {
    "agentskillfinder": {
      "command": "asf",
      "args": ["serve"]
    }
  }
}
```

Tools returned as `MCP Tool[]` via `bundle.toMcp()`.

---

### Custom Reranker (Stage 2 injection)

The default reranker is Jaccard token overlap — fast, zero-dependency, good for most catalogs. Swap in a cross-encoder, embedding model, or any scoring function without touching the rest of the pipeline.

```javascript
import { JITRouter } from 'agentskillfinder/router';

const myReranker = async (query, texts) => {
  // return float[] — one score per text, same order as input
  return texts.map(text => myModel.score(query, text));
};

const router = new JITRouter({
  indexDir: '~/.asf',
  rerankerFn: myReranker,
});
```

Stages 1, 3, and 4 are unaffected. The injected reranker replaces only Stage 2.

---

### Example Bundle Output

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

---

## Privacy

ASF runs entirely offline. No API calls, no telemetry, no usage tracking. The only network activity is loading `_index.json` from your local filesystem.

---

## License

MIT — see [LICENSE](./LICENSE)

Third-party credits: [NOTICE](./NOTICE)
