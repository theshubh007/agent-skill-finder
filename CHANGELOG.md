# Changelog

All notable changes to agentskillfinder are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.5.0] — 2026-04-23

### Added
- `src/router.js` — `JITRouter` class: `.find({ task, tokenBudget, maxSkills })` wires all 4 stages; returns `{ bundle: SkillBundle, timings: { recall, rerank, graph, hydrate, total } }`
- `src/runtime/adapters/claude.js` — standalone `toAnthropic(manifests)` → Claude API `ToolParam[]`
- `test/test_e2e_query.js` — end-to-end PD-L1 bundle test with injectable fns; validates 4-skill composition order

### Updated
- `src/skillIndex.js` — `SkillIndex.build()` now runs `buildGraph` → `clusterGraph` → LanceDB `buildIndex` in one pass; accepts `embedFn`; returns `communityCount`
- `bin/asf.js` — `asf query "<task>"` wired to `JITRouter`; prints per-stage timings, BUNDLE table, COMPOSITION PLAN, deadlock/I/O warnings


---

## [0.4.0] — 2026-04-23

### Added
- `src/index.js` — `buildIndex(manifests)` → LanceDB `skills.lance`; BGE-small-en-v1.5 ONNX embeddings via @xenova/transformers; hybrid BM25+ANN with RRF fusion; HNSW index (m=16, efConstruction=100); warm-start table cache
- `src/rerank.js` — `rerank(query, candidates[100], topK=30)` → top-30 scored by BGE-reranker-v2-m3 cross-encoder; batched ONNX inference; singleton session reuse
- `eval/metrics.js` — `hitAtK`, `reciprocalRank`, `evaluate` — pure Hit@K + MRR computation
- `eval/data/retrieval_eval_150.json` — 150-query annotated eval set across 20 skill categories
- `eval/run_retrieval_eval.js` — CLI runner: prints Hit@1 / Hit@5 / Hit@20 / MRR + per-category Hit@5 breakdown

### Perf
- Stage 1 ANN: HNSW `hnswSq` index replaces flat scan; open table handle reused across `recall()` calls
- Stage 2 cross-encoder: single batched ONNX forward pass for all candidate pairs; int8-quantized weights

---

## [0.3.0] — 2026-04-23

### Added
- `src/slopGate.js` — 6-signal anti-slop quality gate; QUARANTINE_THRESHOLD=0.4; logistic regression weights summing to 1.0; exports `computeSlopScore`, all 5 signal scorers, `BOILERPLATE_PATTERNS`
- `bin/asf.js validate` — wired to real schema + slop_score + capability type + _index.json duplicate checks; `parseSkillManifest()` tries YAML frontmatter then ```yaml code block
- `test/fixtures/known-duplicates.json` — 12 confirmed cross-registry duplicate pairs (11 AST-hash + 1 cosine) with expected canonical and slop scores
- `test/test.canonicalize.fixtures.js` — 24 fixture-based dedup tests covering all pairs + canonical selection logic

---

## [0.2.0] — 2026-04-23

### Added
- `src/kg/schema.js` — confidence-tagged edge schema (EXTRACTED / INFERRED / AMBIGUOUS) with zod
- `src/kg/extractJs.js` — tree-sitter JS/TS AST extractor; ESM import + require() → EXTRACTED depends_on; call-graph → INFERRED 0.6
- `src/kg/extractMd.js` — SKILL.md frontmatter + Required/References section extractor
- `src/kg/build.js` — graphology DirectedGraph builder; merges extraction dicts; highest-confidence edge wins per (src, tgt, relation)
- `src/kg/cluster.js` — Louvain community detection; derives community label from most-common capabilityType; CFI numerator (unnamedCount)
- `src/kg/analyze.js` — god-node detection (degree > mean × 3.0), bridge-node betweenness centrality, isolated tool nodes (TLIS numerator)
- `src/kg/walk.js` — token-bounded BFS subgraph expansion; traverses depends_on / complements / co_used_with; dedup by canonicalId; slop filter
- `src/kg/cache.js` — SHA256 incremental cache; frontmatter-stripped for .md; stores `{ skillId → hash }` in `skills/.cache.json`
- `src/metrics.js` — TLIS / GNCI / CFI / RScore formulas; routingRisk(); failureModes()
- `bin/asf.js measure` — wired to full KG pipeline; prints TLIS / GNCI / CFI / RScore + failure modes
- `docs/ARCHITECTURE.md §13–14` — measured values for gemini-cli (GNCI=51.1) and opencode (CFI=41.5); three failure mode taxonomy

---

## [0.1.0] — 2026-04-23

### Added
- `package.json` scaffold — bin entries (`asf` + `agentskillfinder`), all runtime deps
- `.gitignore` / `.npmignore` — excludes internal research docs, `.lance` artifacts, `paper/`
- `LICENSE` (MIT), `NOTICE` crediting LanceDB / graphology / @xenova/transformers
- `.nvmrc` pinned to Node 20
- `README.md` with headline, token comparison table, quickstart TS snippet, CLI usage, 4-stage pipeline diagram
- `docs/OVERVIEW.md` — public API surface, design decisions, install experience
- `docs/ARCHITECTURE.md` — 4-stage pipeline, manifest schema, SKG edge types, all 14 sections
- `.github/workflows/ci.yml` — lint + test + skill validate on PR
- `.github/workflows/publish.yml` — npm publish on git tag
- `.github/ISSUE_TEMPLATE/bug_report.md` and `skill_submission.md`
- `CONTRIBUTING.md` — skill authoring guide, slop gate rules, PR checklist
- `src/manifest.js` — `SkillManifest` zod schema with `parseManifest` / `safeParseManifest`
- `src/adapters/antigravity.js` — 1,431 skills from antigravity-awesome-skills; reads `plugin-compatibility.json` for real platform targets
- `src/adapters/claude_skills.js` — 235 skills from claude-skills; depth-2+ SKILL.md walk; `agents:` frontmatter → compatibility flags
- `src/adapters/scientific.js` — 133 skills from scientific-agent-skills; keyword-based capability inference
- `src/adapters/awesome_claude.js` — 832 Composio skills + regular skills; collision risk flagged via `description_uniqueness=0.28`
- `src/adapters/mcp_server.js` — connect to any `mcp://` URL via Streamable HTTP; `list_tools` → `SkillManifest[]`
- `src/skillIndex.js` — `SkillIndex.build()` — ingests all registries, deduplicates, writes `skills/_index.json`
- `bin/asf.js` — commander CLI with `ingest`, `validate`, `measure`, `query`, `serve` subcommands

### Stats (as-ingested)
- antigravity-awesome-skills: 1,431 skills
- claude-skills: ~235 skills
- scientific-agent-skills: 133 skills
- awesome-claude-skills: ~832 skills
- Post-dedupe canonical estimate: ~2,058 skills (−22.2%)
