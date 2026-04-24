# AgentSkillFinder — Overview

## What Is It?

AgentSkillFinder (ASF) is an open-source npm library that solves the **skill routing problem** for AI agents and CLIs.

When an agent has access to hundreds or thousands of tools, it must decide which 3–5 tools are relevant to the current task. Injecting all tools into every prompt wastes tokens, degrades model performance, and causes routing failures at scale. ASF solves this with a 4-stage pipeline that runs in ≤65ms with zero LLM calls.

---

## The Problem in One Sentence

> Production AI CLIs that expose large skill registries fail at routing — not because retrieval is bad, but because the underlying skill graph has no structure.

Three distinct failure modes emerge from unstructured registries:

| Failure Mode | Definition | Symptom |
|---|---|---|
| **Tool Leak / Isolation** (TLIS) | Skills with no graph connections | Router can't surface orphaned tools |
| **Coupling Lock** (GNCI) | One god-node with 50× mean degree | All queries route through a single bottleneck |
| **Fragmentation Collapse** (CFI) | Hundreds of unnamed skill communities | No coherent routing domain exists |

ASF fixes all three by building an explicit Skill Knowledge Graph (SKG) and routing through it.

---

## Public API Surface

### `SkillIndex` — compile all registries once

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

### `JITRouter` — route at inference time

```typescript
import { JITRouter } from 'agentskillfinder/router';

const router = new JITRouter({ indexDir: './compiled_skills' });
const bundle = await router.find({
  task: 'fetch SSE stream and execute bash command',
  tokenBudget: 4000,
  maxSkills: 5,
});
```

### `SkillBundle` — emit to any platform

```typescript
bundle.toAnthropic()          // ToolParam[]         — Claude API
bundle.toOpenAI()             // ChatCompletionTool[] — OpenAI API
bundle.toGemini()             // Tool[]               — Gemini API
bundle.toMcp()                // MCP Tool[]           — any MCP host
bundle.toGeminiActivateTool() // ActivateSkillToolInput[]
await bundle.toSkillMdDir('./output') // write SKILL.md + scripts/
```

---

## Design Decisions

### Why no LLM in the router?

Latency and cost. An LLM call adds 400–2000ms and API cost per query. The 4-stage pipeline (BM25 + bi-encoder + cross-encoder + graph walk) achieves better precision at ≤65ms with no external dependencies.

### Why a knowledge graph instead of just vector search?

Vector search alone causes **Composition Deadlock**: skill A scores high, but its required dependency B scores below the retrieval cutoff and is never included. The SKG makes `depends_on` edges explicit so the planner always pulls in required dependencies regardless of their individual similarity score.

### Why zod for the manifest schema?

Runtime validation at ingest time catches malformed skill definitions before they corrupt the index. The schema is the contract between skill authors and the router.

### Why ESM + Node 20?

Native top-level await, built-in `node:test`, and compatibility with the ONNX runtime used by `@xenova/transformers`.

---

## Install Experience

```bash
# Option A: install and build your own index
npm install agentskillfinder
asf ingest ./my-registries

# Option B: pull pre-built canonical index (~40MB)
npx agentskillfinder pull

# Option C: wire as transparent hook into your AI CLI
asf claude install     # Claude Code
asf gemini install     # Gemini CLI
asf codex install      # OpenAI Codex
asf cursor install     # Cursor
```

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

## MCP Server Mode

ASF can run as a stdio MCP server, exposing three tools to any MCP-compatible host:

```bash
asf serve
```

Tools exposed:
- `list_tools` — all canonical skills
- `query_skills(task, tokenBudget)` — returns SkillBundle JSON
- `get_skill(skillId)` — single SkillManifest
