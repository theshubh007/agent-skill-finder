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
  .action(async (task, opts) => {
    // Implemented in Commit 39
    console.log(`[query] "${task}" — (available from v0.5.0)`);
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
