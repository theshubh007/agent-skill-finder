#!/usr/bin/env node
import { Command } from 'commander';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { SkillIndex } from '../src/skillIndex.js';
import { buildGraph } from '../src/kg/build.js';
import { clusterGraph } from '../src/kg/cluster.js';
import { extractJs } from '../src/kg/extractJs.js';
import { extractMd } from '../src/kg/extractMd.js';
import { computeTLIS, computeGNCI, computeCFI, computeRScore, routingRisk, failureModes } from '../src/metrics.js';

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
program
  .command('validate <skill-path>')
  .description('Validate a skill directory against SkillManifest schema')
  .action(async (skillPath) => {
    // Implemented in Commit 26
    console.log(`[validate] ${skillPath} — (available from v0.3.0)`);
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
