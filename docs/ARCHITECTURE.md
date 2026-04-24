# AgentSkillFinder — Architecture

## §1. System Overview

ASF is a 4-stage pipeline that routes an arbitrary natural-language task to a small, typed, composition-ready skill bundle. All stages run in-process with no LLM calls.

```
Query string
    │
    ▼
┌─────────────────────────────────────────────────┐
│ Stage 1 — Hybrid Recall                         │
│  BM25 + BGE-small-en-v1.5 bi-encoder            │
│  LanceDB HNSW + BM25 hybrid                     │
│  Output: top-100 candidates          ≤10ms       │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ Stage 2 — Cross-Encoder Rerank                  │
│  BGE-reranker-v2-m3 ONNX                        │
│  Input: (query, manifest_text) × 100            │
│  Output: top-30 reranked             ≤50ms       │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ Stage 3 — SKG Subgraph Walk                     │
│  Token-bounded BFS over depends_on +            │
│  complements + co_used_with edges               │
│  Adds dependency nodes below sim threshold      │
│  Output: subgraph                    ≤3ms        │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ Stage 4 — Composition Planner                   │
│  Topological sort over subgraph                 │
│  Validates capability I/O type chains           │
│  Output: SkillBundle + ordered plan  ≤2ms        │
└─────────────────────────────────────────────────┘
```

Total end-to-end p50: **≤65ms**

---

## §2. SkillManifest Schema

Every skill in the index is validated against the following schema (implemented with zod):

```typescript
{
  id: string,                    // canonical slug, e.g. "scientific-research-lookup"
  name: string,
  version: string,
  description: string,

  capability: {
    type: CapabilityType,        // e.g. "bioinformatics" | "visualization" | "retrieval"
    inputs: IOType[],            // e.g. ["query:string"]
    outputs: IOType[],           // e.g. ["papers:list[Paper]"]
  },

  graph: {
    depends_on: string[],        // skill IDs this skill requires
    complements: string[],       // skill IDs that commonly follow
    co_used_with: string[],      // skill IDs often used in same bundle
  },

  compatibility: {
    claude_code: boolean,
    gemini: boolean,
    codex: boolean,
    cursor: boolean,
    mcp: boolean,
  },

  risk: 'safe' | 'network' | 'exec' | 'critical' | 'unsafe',

  source: {
    registry: string,            // e.g. "antigravity-awesome-skills"
    path: string,                // relative path within registry
  },

  quality: {
    slop_score: number,          // 0.0–1.0; < 0.4 → quarantine
    description_uniqueness: number,
    is_duplicate: boolean,
  }
}
```

---

## §3. Skill Knowledge Graph (SKG)

### §3.1 Node Types

Every canonical skill becomes a node in a `graphology.DirectedGraph`. Node attributes:

| Attribute | Type | Description |
|---|---|---|
| `manifestText` | string | Concatenated description + capability fields for embedding |
| `capabilityType` | string | Louvain community label basis |
| `riskTier` | string | One of the 5 risk tiers |
| `slopScore` | number | Quality gate output |
| `canonicalId` | string | Deduplicated canonical skill ID |
| `communityId` | number | Louvain cluster assignment |

### §3.2 Edge Types

| Edge | Confidence Source | Description |
|---|---|---|
| `depends_on` | EXTRACTED | Hard dependency — skill A requires skill B |
| `required_sub_skills` | EXTRACTED | Sub-skill decomposition |
| `complements` | EXTRACTED / INFERRED | Skills that chain naturally |
| `duplicate_of` | EXTRACTED | Cross-registry dedup edge |
| `co_used_with` | INFERRED | Co-occurrence in known bundles |
| `tested_by` | EXTRACTED | Test skill references |
| `conflicts_with` | INFERRED | Mutually exclusive skills |
| `version_of` | EXTRACTED | Semver lineage |
| `extends` | EXTRACTED | Capability inheritance |

### §3.3 Edge Confidence

Every edge carries:
- `confidence: 0.0–1.0`
- `source: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'`

When multiple extractors produce edges between the same pair, the highest-confidence edge wins.

---

## §4. Extraction Pipeline

Two extractors build the initial edge set before graph construction:

**JS/TS AST Extractor (`kg/extractJs.js`)**
- Parses skill scripts with tree-sitter
- `import` / `require` → `depends_on` edges (EXTRACTED, confidence 1.0)
- Function call patterns → INFERRED `depends_on` edges (confidence 0.6)

**Markdown Extractor (`kg/extractMd.js`)**
- Parses `SKILL.md` frontmatter YAML
- `depends_on:` / `complements:` fields → EXTRACTED edges (confidence 1.0)
- `## Required` prose sections → INFERRED edges (confidence 0.7)
- `## References` sections → `references` node type

---

## §5. Canonicalization

Cross-registry deduplication runs in two passes:

1. **Semantic dedup** — SBERT cosine similarity ≥ 0.97 on description embeddings → `duplicate_of` edge
2. **Structural dedup** — AST hash match on script files → confirmed structural duplicate

The highest-quality variant (by `slop_score` rank) becomes the canonical node. Others are demoted to aliases.

Result on the full 6-registry corpus: **2,645 raw → 2,058 canonical (−22.2%)**

---

## §6. Anti-Slop Gate

Six signals feed a logistic regression scorer to compute `slop_score ∈ [0, 1]`:

| Signal | Description |
|---|---|
| `description_uniqueness` | SBERT pairwise similarity vs registry mean |
| `graph_isolation` | Degree ≤ 1 in SKG |
| `description_template_match` | Regex against known LLM boilerplate n-grams |
| `name_collision` | Name edit-distance ≤ 2 from existing canonical |
| `ast_duplicate` | AST hash collision with any canonical |
| `empty_content` | Missing `scripts/` or zero executable lines |

Score < 0.4 → quarantine (demotion, not deletion). Skills in quarantine are excluded from routing but preserved in the index for audit.

---

## §7. Routability Metrics

Three metrics measure structural routing health of any skill registry or AI CLI codebase:

### TLIS — Tool Leak / Isolation Score
```
TLIS = isolated_tool_nodes / total_tool_nodes
```
Threshold: < 0.5 for healthy routing. Measures fraction of tools with zero graph edges — tools the router can never surface through graph traversal.

### GNCI — God-Node Coupling Index
```
GNCI = max_node_degree / mean_node_degree
```
Threshold: < 20 for healthy routing. High GNCI means a single node acts as a routing bottleneck. All queries converge to it regardless of task relevance.

### CFI — Community Fragmentation Index
```
CFI = total_communities / named_communities
```
Threshold: < 10 for healthy routing. High CFI means the skill graph has fragmented into many unnamed clusters. No coherent routing domain can be inferred.

### RScore — Composite Routability Score
```
RScore = 1 - ((TLIS + normalize(GNCI) + normalize(CFI)) / 3)
```
RScore ∈ [0, 1]. Higher is better. RScore < 0.4 → ROUTING RISK: HIGH.

---

## §8. Three Failure Mode Taxonomy

| Failure Mode | Metric | Threshold | Structural Cause |
|---|---|---|---|
| **Tool Leak / Isolation** | TLIS > 0.5 | 50%+ tools unreachable | Skills added without graph edges |
| **Coupling Lock** | GNCI > 20 | God-node bottleneck | One skill collects all dependencies |
| **Fragmentation Collapse** | CFI > 10 | 10× more communities than named | Skills grouped without semantic labels |

All three failure modes are independent and can co-occur. An RScore < 0.4 with all three failing simultaneously is a **structural collapse** — routing improvements at the retrieval layer cannot fix it.

---

## §9. Composition Deadlock

**Definition:** Planner selects skill A (high similarity score) but skill A's `depends_on` dependency B scores below the Stage 2 retrieval cutoff and is absent from the subgraph. Execution fails at runtime.

**Fix:** Stage 3 SKG walk adds dependency nodes even when their individual similarity score falls below the retrieval threshold. A `depends_on` edge from a selected node is sufficient to include the dependency.

**Pseudocode:**
```javascript
function expandSubgraph(G, seeds, { tokenBudget, edgeTypes }) {
  const queue = [...seeds];
  const included = new Set(seeds);
  let usedTokens = 0;

  while (queue.length && usedTokens < tokenBudget) {
    const node = queue.shift();
    const neighbors = G.outNeighbors(node).filter(n =>
      edgeTypes.includes(G.getEdgeAttribute(node, n, 'relation'))
    );
    for (const neighbor of neighbors) {
      if (!included.has(neighbor)) {
        included.add(neighbor);
        queue.push(neighbor);
        usedTokens += estimateTokens(G.getNodeAttribute(neighbor, 'manifestText'));
      }
    }
  }
  return G.subgraph([...included]);
}
```

---

## §10. Capability-Typed I/O Composition

The Stage 4 planner validates that output types of step N are compatible with input types of step N+1. This catches type-level composition errors before execution.

**Example — PD-L1 query:**
```
step 1: scientific-research-lookup(query: string) → papers: list[Paper]
step 2: classify-pd-l1-tps(papers: list[Paper])   → tps_scores: dict
step 3: publication-figure-style(tps_scores: dict) → figure: Path
step 4: citation-verifier(papers: list[Paper])     → bibtex: string
```

Type compatibility is checked via exact match on the `IOType` enum defined in `src/manifest.js`. Incompatible chains are rejected at plan time with a descriptive error.

---

## §11. Multi-Platform Output Adapters

| Method | Output Type | Target |
|---|---|---|
| `bundle.toAnthropic()` | `ToolParam[]` | Claude API (`tools` parameter) |
| `bundle.toOpenAI()` | `ChatCompletionTool[]` | OpenAI Chat Completions API |
| `bundle.toGemini()` | `Tool[]` | Gemini API |
| `bundle.toGeminiActivateTool()` | `ActivateSkillToolInput[]` | gemini-cli pre-filter layer |
| `bundle.toMcp()` | `MCP Tool[]` | Any MCP-compatible host |
| `bundle.toSkillMdDir(path)` | Files on disk | `SKILL.md` + `scripts/` + `references/` |

---

## §12. Token Savings Math

Given a registry of N skills with mean manifest token length T:

- **Naive injection:** N × T tokens per prompt
- **ASF bundle (k skills):** k × T tokens per prompt
- **Savings ratio:** (N − k) / N

For the canonical 2,058-skill index (T ≈ 600 tokens, k = 4):
```
Naive:  2,058 × 600 = 1,234,800 tokens
ASF:    4     × 600 =     2,400 tokens
Savings: 99.8%
```

At 1,000 agent calls/day with Claude claude-sonnet-4-6 input pricing:
```
Naive: 1,234,800,000 tokens/day
ASF:       2,400,000 tokens/day
Delta: 1,232,400,000 tokens/day saved
```

---

## §13. Routability Metrics — Measured Values

Measured against real AI CLI codebases using `asf measure`:

| System | TLIS | GNCI | CFI | RScore | Primary Failure |
|---|---|---|---|---|---|
| gemini-cli | 0.71 | 51.1 | 3.2 | 0.31 | Coupling Lock |
| opencode | 0.83 | 8.4 | 41.5 | 0.26 | Tool Isolation + Fragmentation |
| **ASF canonical index** | **0.04** | **3.1** | **1.8** | **0.97** | None |

---

## §14. Three Failure Modes — Detailed Analysis

### Coupling Lock (gemini-cli, GNCI = 51.1)

A single internal configuration node accumulates dependencies from 51× more skills than the mean. Every query that touches configuration routes through this node. The bottleneck cannot be eliminated at the retrieval layer — it is a graph structural problem.

**Fix:** Decompose the god-node into typed sub-skills with explicit capability boundaries. ASF detects this pattern via `detectGodNodes()` in `src/kg/analyze.js`.

### Fragmentation Collapse (opencode, CFI = 41.5)

788 skill communities exist in the graph. 769 of them have no semantic label — they are isolated clusters of tools that were never connected to the broader graph. The planner has no basis for multi-hop routing across unnamed clusters.

**Fix:** Add `complements` and `co_used_with` edges between skills that share capability domains. ASF detects unnamed communities via Louvain clustering in `src/kg/cluster.js`.

### Tool Leak / Isolation (both systems, TLIS > 0.7)

Over 70% of tools in both codebases have zero graph edges. These tools are invisible to the graph-walk stage regardless of retrieval score. They can only be surfaced if they rank in the top-30 of Stage 2 reranking — which is unreliable for long-tail tools.

**Fix:** Add at minimum one `complements` or `co_used_with` edge per tool during registry authoring. ASF enforces this via the anti-slop gate signal `graph_isolation`.
