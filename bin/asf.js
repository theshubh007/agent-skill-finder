#!/usr/bin/env node
import { Command } from 'commander';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import yaml from 'js-yaml';
import { SkillIndex } from '../src/skillIndex.js';
import { buildGraph } from '../src/kg/build.js';
import { clusterGraph } from '../src/kg/cluster.js';
import { extractJs } from '../src/kg/extractJs.js';
import { extractMd } from '../src/kg/extractMd.js';
import { computeTLIS, computeGNCI, computeCFI, computeRScore, routingRisk, failureModes } from '../src/metrics.js';
import { computeSlopScore } from '../src/slopGate.js';
import { CapabilityType } from '../src/manifest.js';
import { JITRouter } from '../src/router.js';
import { install } from '../src/installer.js';
import { pull } from '../src/pull.js';

const program = new Command();

program
  .name('asf')
  .description('AgentSkillFinder — JIT skill router for AI agents')
  .version('0.1.0');

// ── ingest ────────────────────────────────────────────────────────────────────
program
  .command('ingest [path]')
  .description('Walk all registry sources and produce skills/_index.json')
  .option('--sources <urls...>', 'explicit registry dirs or mcp:// URLs')
  .option('--out <dir>', 'output directory for _index.json')
  .action(async (pathArg, opts) => {
    const sourcesRoot = pathArg ?? process.cwd();
    try {
      const result = await SkillIndex.build({
        sourcesRoot,
        sources: opts.sources,
        outputDir: opts.out,
        log: (msg) => console.log(msg),
      });
      console.log(`\nDone in ${result.buildTimeMs}ms — ${result.canonicalCount} canonical skills`);
    } catch (err) {
      console.error(`[error] ${err.message}`);
      process.exit(1);
    }
  });

// ── validate ──────────────────────────────────────────────────────────────────
function parseSkillManifest(skillDir) {
  const skillMdPath = join(resolve(skillDir), 'SKILL.md');
  if (!existsSync(skillMdPath)) return null;
  const src = readFileSync(skillMdPath, 'utf8');

  // Try standard YAML frontmatter first
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    try { return yaml.load(fm[1]); } catch { /* fall through */ }
  }

  // Fall back to first ```yaml ... ``` code block
  const block = src.match(/```ya?ml\r?\n([\s\S]*?)```/);
  if (block) {
    try { return yaml.load(block[1]); } catch { /* fall through */ }
  }

  return null;
}

program
  .command('validate <skill-path>')
  .description('Validate a skill directory against SkillManifest schema')
  .action(async (skillPath) => {
    const skillDir = resolve(skillPath);
    const manifest = parseSkillManifest(skillDir);
    let ok = true;

    // [schema] — required fields
    const missing = [];
    if (!manifest) {
      console.log('[schema]     ✗ SKILL.md not found or unparseable');
      process.exit(1);
    }
    if (!manifest.id) missing.push('id');
    if (!manifest.name) missing.push('name');
    if (!manifest.description) missing.push('description');
    if (!manifest.risk && !manifest.risk?.tier) missing.push('risk');
    if (missing.length > 0) {
      console.log(`[schema]     ✗ missing required fields: ${missing.join(', ')}`);
      ok = false;
    } else {
      console.log('[schema]     ✓ valid');
    }

    // [slop] — quality gate
    const graphEdges =
      (manifest.graph?.depends_on?.length ?? 0) +
      (manifest.graph?.complements?.length ?? 0) +
      (manifest.graph?.co_used_with?.length ?? 0);
    const hasScripts = existsSync(join(skillDir, 'scripts'));
    const { slopScore, quarantined } = computeSlopScore({
      description: manifest.description ?? '',
      name: manifest.id ?? manifest.name ?? '',
      graphDegree: graphEdges,
      hasScripts,
    });
    const slopStatus = quarantined ? `✗ below threshold (quarantine)` : `✓ above threshold`;
    console.log(`[slop]       score=${slopScore.toFixed(2)}  ${slopStatus}`);
    if (quarantined) ok = false;

    // [capability] — type recognized
    const capType = manifest.capability?.type;
    const validTypes = CapabilityType.options;
    if (!capType) {
      console.log('[capability] type=unknown  ✗ not specified');
      ok = false;
    } else if (!validTypes.includes(capType)) {
      console.log(`[capability] type=${capType}  ✗ unrecognized (valid: ${validTypes.slice(0, 4).join(', ')}…)`);
      ok = false;
    } else {
      console.log(`[capability] type=${capType}  ✓ recognized`);
    }

    // [duplicate] — basic id uniqueness check against _index.json
    const indexPath = join(resolve('.'), 'skills', '_index.json');
    if (existsSync(indexPath)) {
      try {
        const index = JSON.parse(readFileSync(indexPath, 'utf8'));
        const skills = Array.isArray(index) ? index : (index.skills ?? []);
        const dup = skills.find((s) => s.id === manifest.id && s.source?.path !== skillDir);
        if (dup) {
          console.log(`[duplicate]  id=${manifest.id}  ✗ collision in _index.json`);
          ok = false;
        } else {
          console.log('[duplicate]  no match  ✓');
        }
      } catch {
        console.log('[duplicate]  no match  ✓  (index unreadable — skipped)');
      }
    } else {
      console.log('[duplicate]  no match  ✓  (no index — skipped)');
    }

    if (!ok) process.exit(1);
  });

// ── measure ───────────────────────────────────────────────────────────────────
function walkDir(dir, exts) {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...walkDir(full, exts));
      else if (exts.includes(extname(entry.name).toLowerCase())) results.push(full);
    }
  } catch { /* skip inaccessible */ }
  return results;
}

program
  .command('measure [path]')
  .description('Compute TLIS / GNCI / CFI routability metrics')
  .action(async (pathArg) => {
    const targetDir = resolve(pathArg ?? '.');
    const jsFiles = walkDir(targetDir, ['.js', '.ts', '.mjs', '.cjs']);
    const mdFiles = walkDir(targetDir, ['.md']);

    const extractions = [];
    for (const f of jsFiles) {
      try { extractions.push(await extractJs(f)); } catch { /* skip */ }
    }
    for (const f of mdFiles) {
      try { extractions.push(extractMd(f)); } catch { /* skip */ }
    }

    const G = buildGraph([], extractions);
    const clusterResult = clusterGraph(G);
    const tlis = computeTLIS(G);
    const gnci = computeGNCI(G);
    const cfi = computeCFI(clusterResult);
    const rscore = computeRScore(tlis, gnci, cfi);
    const risk = routingRisk(rscore);
    const modes = failureModes(tlis, gnci, cfi);

    console.log(`TLIS   = ${tlis.toFixed(2)}   (threshold: < 0.5 for healthy routing)`);
    console.log(`GNCI   = ${gnci.toFixed(1)}   (threshold: < 20 for healthy routing)`);
    console.log(`CFI    = ${cfi.toFixed(1)}   (threshold: < 10 for healthy routing)`);
    console.log(`RScore = ${rscore.toFixed(2)}  → ROUTING RISK: ${risk}`);
    if (modes.length > 0) console.log(`Failure mode: ${modes.join(' + ')}`);
  });

// ── query ─────────────────────────────────────────────────────────────────────
program
  .command('query <task>')
  .description('Route a task to a 3–5-skill bundle via the 4-stage pipeline')
  .option('--budget <tokens>', 'token budget', '4000')
  .option('--max-skills <n>', 'max skills in bundle', '5')
  .option('--index-dir <path>', 'directory containing skills.lance index')
  .action(async (task, opts) => {
    const tokenBudget = parseInt(opts.budget, 10);
    const maxSkills = parseInt(opts.maxSkills, 10);
    const indexDir = opts.indexDir ? resolve(opts.indexDir) : process.cwd();

    const router = new JITRouter({ indexDir });

    let result;
    try {
      result = await router.find({ task, tokenBudget, maxSkills });
    } catch (err) {
      console.error(`[error] ${err.message}`);
      console.error('Run `asf ingest` first to build the skill index.');
      process.exit(1);
    }

    const { bundle, timings } = result;

    console.log(
      `\nStages: recall(${timings.recall}ms) + rerank(${timings.rerank}ms) + ` +
      `graph(${timings.graph}ms) + hydrate(${timings.hydrate}ms) = ${timings.total}ms total`,
    );

    console.log(`\nBUNDLE (${bundle.manifests.length} skills)`);
    for (let i = 0; i < bundle.manifests.length; i++) {
      const m = bundle.manifests[i];
      const risk = m.risk?.tier ?? (typeof m.risk === 'string' ? m.risk : 'unknown');
      console.log(`  ${i + 1}. ${m.id.padEnd(40)} risk=${risk}`);
    }

    if (bundle.steps.length > 0) {
      console.log('\nCOMPOSITION PLAN');
      for (const s of bundle.steps) {
        const outs = s.outputs.map((o) => `${o.name}:${o.type}`).join(', ');
        const deps = s.dependsOn.length > 0 ? `  (depends: ${s.dependsOn.join(', ')})` : '';
        console.log(`  step ${s.step}: ${s.skill}${deps}${outs ? `  →  ${outs}` : ''}`);
      }
    }

    if (bundle.plan?.deadlocks?.length > 0) {
      console.log(`\n[warn] deadlocks: ${bundle.plan.deadlocks.join(', ')}`);
    }
    if (bundle.plan?.ioViolations?.length > 0) {
      const pairs = bundle.plan.ioViolations.map((v) => `${v.from}→${v.to}`).join(', ');
      console.log(`[warn] I/O type mismatches: ${pairs}`);
    }
  });

// ── reindex ───────────────────────────────────────────────────────────────────
program
  .command('reindex [path]')
  .description('Incrementally rebuild skill index (SHA-256 cache skips unchanged skills)')
  .option('--out <dir>', 'output directory for _index.json')
  .option('--force', 'ignore cache, rebuild everything')
  .action(async (pathArg, opts) => {
    const sourcesRoot = pathArg ?? process.cwd();
    try {
      const result = await SkillIndex.build({
        sourcesRoot,
        outputDir: opts.out,
        useCache: !opts.force,
        log: (msg) => console.log(msg),
      });
      const changed = result.changedCount ?? '?';
      console.log(
        `\nReindexed in ${result.buildTimeMs}ms — ${result.canonicalCount} canonical skills` +
        (opts.force ? '' : `  (${changed} changed)`),
      );
    } catch (err) {
      console.error(`[reindex] ${err.message}`);
      process.exit(1);
    }
  });

// ── eval ──────────────────────────────────────────────────────────────────────
program
  .command('eval [skill-id]')
  .description('Smoke-eval routing quality for a skill or the full index')
  .option('--index-dir <path>', 'directory containing skills.lance index')
  .option('--limit <n>', 'max skills to test when no skill-id given', '50')
  .action(async (skillId, opts) => {
    const indexDir = opts.indexDir ? resolve(opts.indexDir) : process.cwd();
    const indexPath = join(resolve(indexDir), 'skills', '_index.json');

    if (!existsSync(indexPath)) {
      console.error('[eval] No skill index found. Run `asf ingest` or `asf pull` first.');
      process.exit(1);
    }

    const raw = readFileSync(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    const allSkills = Array.isArray(parsed) ? parsed : (parsed.skills ?? []);

    const targets = skillId
      ? allSkills.filter((s) => s.id === skillId)
      : allSkills.slice(0, parseInt(opts.limit, 10));

    if (targets.length === 0) {
      console.error(`[eval] Skill '${skillId}' not found in index.`);
      process.exit(1);
    }

    let router;
    try {
      router = new JITRouter({ indexDir });
    } catch (err) {
      console.error(`[eval] Router init failed: ${err.message}`);
      console.error('Run `asf ingest` or `asf pull` first.');
      process.exit(1);
    }

    let passed = 0;
    let failed = 0;

    for (const skill of targets) {
      const query = skill.description ?? skill.name ?? skill.id;
      let hit = false;
      try {
        const result = await router.find({ task: query, tokenBudget: 8000, maxSkills: 5 });
        hit = result.bundle.manifests.some((m) => m.id === skill.id);
      } catch {
        // router failure counts as miss
      }

      if (hit) {
        console.log(`  ✓  ${skill.id}`);
        passed++;
      } else {
        console.log(`  ✗  ${skill.id.padEnd(42)} [not in top-5]`);
        failed++;
      }
    }

    const total = passed + failed;
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    console.log(`\nHit@5: ${passed}/${total}  (${pct}%)`);

    if (skillId && failed > 0) process.exit(1);
  });

// ── pull ──────────────────────────────────────────────────────────────────────
program
  .command('pull')
  .description('Download pre-built canonical skill index from CDN (~40MB)')
  .option('--out <dir>', 'destination directory (default: ./skills)')
  .option('--cdn <url>', 'override CDN base URL')
  .action(async (opts) => {
    try {
      const result = await pull({
        outputDir: opts.out,
        cdnBase: opts.cdn,
      });
      const mb = (result.lanceBytes / 1024 / 1024).toFixed(1);
      console.log(`\n✓ Index ready at ${result.outputDir}  (${mb} MB downloaded)`);
    } catch (err) {
      console.error(`[pull] ${err.message}`);
      process.exit(1);
    }
  });

// ── install ───────────────────────────────────────────────────────────────────
program
  .command('install <target>')
  .description('Install ASF routing hooks for a supported agent (claude, gemini, codex, cursor)')
  .option('--claude-md <path>', 'path to CLAUDE.md (default: ~/.claude/CLAUDE.md)')
  .option('--hook-script <path>', 'path to preToolUse.js (default: ~/.npm/_npx/asf/hooks/preToolUse.js)')
  .option('--settings <path>', 'path to agent settings file')
  .action(async (target, opts) => {
    try {
      const result = await install(target, {
        claudeMdPath: opts.claudeMd,
        hookScript: opts.hookScript,
        settingsPath: opts.settings,
      });
      if (result.alreadyInstalled) {
        console.log(`[install] ASF already installed for ${target} at ${result.path}`);
      } else {
        console.log(`✓ ASF routing active for ${target === 'claude' ? 'Claude Code' : target}`);
        console.log(`  Written: ${result.path}`);
      }
    } catch (err) {
      console.error(`[install] ${err.message}`);
      process.exit(1);
    }
  });

// ── serve ─────────────────────────────────────────────────────────────────────
program
  .command('serve')
  .description('Start ASF as an MCP stdio server')
  .action(async () => {
    // Implemented in Commit 47
    console.log('[serve] MCP stdio server — (available from v0.6.0)');
  });

program.parseAsync(process.argv);
