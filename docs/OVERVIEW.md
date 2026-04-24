# AgentSkillFinder — Overview

## What Is It?

AgentSkillFinder (ASF) is an open-source npm library that solves the **skill routing problem** for AI agents and CLIs.

When an agent has access to hundreds or thousands of tools, it must decide which 3–5 tools are relevant to the current task. Injecting all tools into every prompt wastes tokens, degrades model performance, and causes routing failures at scale. ASF solves this with a 4-stage pipeline that runs in ≤65ms with zero LLM calls.

---

## The Problem in One Sentence

> Production AI CLIs that expose large skill registries fail at routing — not because retrieval is bad, but because the underlying skill graph has no structure.

Three distinct failure modes emerge from unstructured registries:

| Failure Mode | Metric | Symptom |
|---|---|---|
| **Tool Leak / Isolation** (TLIS) | Isolated nodes / total nodes | Router can't surface orphaned skills |
| **Coupling Lock** (GNCI) | Max degree / mean degree | All queries route through a single bottleneck |
| **Fragmentation Collapse** (CFI) | Communities / named communities | No coherent routing domain exists |

ASF fixes all three by building an explicit Skill Knowledge Graph (SKG) and routing through it.

---

## Public API Surface

### `SkillIndex.build()` — compile all registries once

```typescript
import { SkillIndex } from 'agentskillfinder/skill-index';

const result = await SkillIndex.build({
  sources: [
    './registries/antigravity',
    './registries/claude-skills',
    'mcp://localhost:9000',
  ],
  outputDir: './compiled_skills',
});
// → { skillCount: 2645, canonicalCount: 2058, communityCount: 47, buildTimeMs: 4200 }
```

### `JITRouter.find()` — route at inference time

```typescript
import { JITRouter } from 'agentskillfinder/router';

const router = new JITRouter({ indexDir: './compiled_skills' });
const { bundle, timings } = await router.find({
  task: 'fetch SSE stream and execute bash command',
  tokenBudget: 4000,
  maxSkills: 5,
});
// timings → { recall: 12, rerank: 47, graph: 3, hydrate: 1, total: 63 }
```

### `SkillBundle` — emit to any platform

```typescript
bundle.toAnthropic()              // ToolParam[]              — Claude API
bundle.toOpenAI()                 // ChatCompletionTool[]     — OpenAI API
bundle.toGemini()                 // Tool[]                   — Gemini API
bundle.toGeminiActivateTool()     // ActivateSkillToolInput[] — gemini-cli
bundle.toMcp()                    // MCP Tool[]               — any MCP host
await bundle.toSkillMdDir('./out')// write SKILL.md files to disk
```

---

## Design Decisions

### Why no LLM in the router?

Latency and cost. An LLM call adds 400–2000ms and API cost per query. The 4-stage pipeline (BM25 + bi-encoder + cross-encoder + graph walk) achieves better precision at ≤65ms with no external dependencies.

### Why a knowledge graph instead of just vector search?

Vector search alone causes **Composition Deadlock**: skill A scores high, but its required dependency B scores below the retrieval cutoff and is never included. The SKG makes `depends_on` edges explicit so the BFS planner always pulls in required dependencies regardless of their individual similarity score.

### Why zod for the manifest schema?

Runtime validation at ingest time catches malformed skill definitions before they corrupt the index. The schema is the contract between skill authors and the router.

### Why ESM + Node 20?

Native top-level await, built-in `node:test`, and compatibility with the ONNX runtime used by `@xenova/transformers`. No transpilation required.

---

## Install Experience

```bash
# Option A (recommended for end users): transparent hook — runs once, routes every prompt automatically
npx agentskillfinder install claude   # Claude Code
npx agentskillfinder install gemini   # Gemini CLI
npx agentskillfinder install codex    # OpenAI Codex
npx agentskillfinder install cursor   # Cursor

# Option B: pull pre-built canonical index (~40MB, 2,058 skills) for standalone use
npx agentskillfinder pull

# Option C: build your own index from local registries
npm install agentskillfinder
asf ingest ./my-registries

# Option D: incremental rebuild after registry changes
asf reindex
```

After `asf install <target>`, every tool call is intercepted by `src/hooks/preToolUse.js` and routed through the 4-stage pipeline before the model sees it. No user action is required per-prompt.

---

## Registries Supported

| Registry | Format | Skills |
|---|---|---|
| antigravity-awesome-skills | `skills_index.json` + `SKILL.md` per entry | 1,431 |
| claude-skills | `marketplace.json` | 235 |
| scientific-agent-skills | scan_skills output | 133 |
| awesome-claude-skills | Composio template schema | 832 |
| Any MCP server | `list_tools` over `mcp://` | dynamic |

After cross-registry deduplication: **2,058 canonical skills** (−22.2%).

---

## Security Model

### Manifest signing

Official registries ship skills signed with an ed25519 keypair. `verifyBundle` validates signatures at ingest time; unsigned skills from trusted registries are rejected.

### 5-Tier runtime sandbox

Every skill runs in the environment declared by its `risk` field:

| Tier | Environment |
|---|---|
| `safe` | In-process, no I/O |
| `network` | In-process, HTTP domain allow-list |
| `exec` | Docker microVM, read-only FS |
| `critical` | Firecracker microVM, fully isolated |
| `unsafe` | Rejected — never executed |

### ToolFlood detection

Bulk injection of skills sharing a dominant trigger pattern (> 10 skills, ≥ 70% matching a single category) is flagged and held for manual review before admission to the index.

### Slop gate + tombstoning

Skills below `slop_score < 0.4` are quarantined. Skills below `0.2` are tombstoned and added to `skills/_slop_blocklist.json`, an append-only public audit trail.

---

## Telemetry and Learning

All telemetry is **opt-in** and stored locally. No data leaves your machine.

### Success logging

`src/hooks/postToolUse.js` logs per-invocation success/failure to an injectable store (in-memory by default, DuckDB for production).

### Learning-to-Rank retrain

A weekly scheduler adjusts skill scores based on accumulated success rates:

```
delta = (successRate − 0.5) × 0.2   [for skills with ≥ 10 queries]
```

Skills that consistently underperform (`successRate < 0.3` over ≥ 50 queries) are flagged as `auto_rewrite_candidate: true`.

---

## MCP Server Mode

ASF exposes three tools over stdio MCP:

```bash
asf serve
```

| Tool | Description |
|---|---|
| `list_tools` | Return all canonical skills as MCP `Tool[]` |
| `query_skills(task, tokenBudget)` | Route and return `SkillBundle` JSON |
| `get_skill(skillId)` | Return a single `SkillManifest` |

---

## Routability Metrics

`asf measure <path>` computes graph health metrics for any AI CLI codebase:

| Metric | Formula | Healthy | Failure mode |
|---|---|---|---|
| TLIS | isolated_nodes / total_nodes | < 0.5 | Tool Leak |
| GNCI | max_degree / mean_degree | < 20 | Coupling Lock |
| CFI | total_communities / named_communities | < 10 | Fragmentation Collapse |
| RScore | 1 − (TLIS + GNCI_norm + CFI_norm) / 3 | > 0.5 | — |

Measured baselines: gemini-cli GNCI = 51.1 (Coupling Lock), opencode CFI = 41.5 (Fragmentation Collapse).
