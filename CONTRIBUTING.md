# Contributing to AgentSkillFinder

## Skill Authoring

Full authoring reference → [`docs/SKILL-AUTHORING.md`](docs/SKILL-AUTHORING.md)

Quick summary: a skill is a directory with `SKILL.md` + `scripts/`. The slop gate rejects low-quality submissions automatically.

---

## PR Checklist

Before opening a pull request:

- [ ] `npm test` passes locally
- [ ] `npm run lint` passes with no errors
- [ ] New skills pass `asf validate skills/my-skill`
- [ ] At least one graph edge declared (`depends_on`, `complements`, or `co_used_with`)
- [ ] Description is specific and unique — not a paraphrase of an existing skill (`slop_score >= 0.4`)
- [ ] `scripts/` directory exists with at least one executable file
- [ ] Risk tier accurately reflects the skill's runtime behavior
- [ ] New `src/` code is covered by at least one test in `test/`
- [ ] No new ESLint errors introduced

For security-related changes (sandbox, signing, trigger analysis):

- [ ] Adversarial fixture added to `test/fixtures/` if the change adds a new attack surface
- [ ] `src/security/` changes are accompanied by `test/security/` tests

---

## Slop Gate Rules

The slop gate runs automatically on `asf validate` and during `asf ingest`. It rejects skills below quality thresholds before they corrupt the index.

### Quarantine (`slop_score < 0.4`)

A quarantined skill:
- Does not appear in routing bundles
- Is preserved in `skills/` for audit and rehabilitation
- Can be rehabilitated by improving description uniqueness or adding graph edges

### Tombstone (`slop_score < 0.2`)

A tombstoned skill:
- Is added to `skills/_slop_blocklist.json` (append-only audit trail)
- Will never be admitted to any routing bundle
- Requires a maintainer review and explicit removal from the blocklist to rehabilitate

### Slop Score Signals

| Signal | Weight | What causes failure |
|---|---|---|
| `description_uniqueness` | 0.30 | Cosine similarity ≥ 0.85 with an existing canonical skill |
| `graph_isolation` | 0.25 | Zero graph edges declared |
| `description_template_match` | 0.20 | Matches LLM boilerplate patterns (e.g. "This tool helps you…") |
| `name_collision` | 0.15 | Levenshtein distance < 2 from an existing canonical ID |
| `ast_duplicate` | 0.05 | Script AST hash matches an existing skill |
| `empty_content` | 0.05 | Missing `scripts/` or zero executable lines |

---

## How CI Works

### On push to `main` or any PR branch

1. **Lint** — ESLint runs over `src/`, `bin/`, `eval/`, `test/`
2. **Test** — `node --test` runs all `test/**/*.js` files

### On PR (additional checks)

3. **Validate skills** — `asf validate` runs on every skill in `skills/` that was added or modified in the PR diff

### On git tag push (`v*`)

4. **Publish** — `npm publish --provenance` pushes to the npm registry

---

## Security Model

### Manifest signing

All skills in official registries are signed with an ed25519 keypair. The `verifyBundle` function in `src/security/signing.js` validates signatures at ingest time. Skills with invalid or missing signatures from trusted registries are rejected.

To sign a skill manifest during development:

```javascript
import { generateKeyPair, signManifest } from 'agentskillfinder/src/security/signing.js';
const { privateKey, publicKey } = generateKeyPair();
const signed = signManifest(manifest, privateKey);
```

### ToolFlood detection

Bulk-injection of skills sharing a dominant trigger pattern (e.g. > 10 skills all matching `shell` patterns) is flagged by `src/security/toolFloodDetector.js`. Flagged batches are held for manual review via `rateLimitSkills`.

### Sandbox tiers

Every skill runs in the tier declared by its `risk` field. The runtime enforces this in `src/runtime/sandbox.js` — a skill that declares `safe` cannot access the network at runtime.

---

## Telemetry and Learning

### Success signals

When ASF is installed as a Claude Code hook, `src/hooks/postToolUse.js` logs whether each skill invocation succeeded or failed to the injectable telemetry store.

### LTR retrain

A weekly scheduler (`src/learning/retrain.js`) retrains skill scores based on accumulated success rates. Skills with ≥ 10 queries get a score delta of `(successRate − 0.5) × 0.2`.

### Auto-rewrite candidates

Skills with `successRate < 0.3` over ≥ 50 queries are flagged as `auto_rewrite_candidate: true`. These skills are surfaced in `asf eval` output and are candidates for description improvement or deprecation.

---

## Local Development

```bash
# install deps
npm install

# run tests
npm test

# run linter
npm run lint

# ingest registries
node bin/asf.js ingest ./registries

# incremental rebuild (uses SHA-256 cache)
node bin/asf.js reindex

# query
node bin/asf.js query "your task here"

# validate a skill
node bin/asf.js validate skills/my-skill

# smoke-eval routing quality for a skill
node bin/asf.js eval my-skill-id

# run latency benchmark
node eval/perf/latency_p50_p95.js
```
