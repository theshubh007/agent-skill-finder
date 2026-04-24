# Changelog

All notable changes to agentskillfinder are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
