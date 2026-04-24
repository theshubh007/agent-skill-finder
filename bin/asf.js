#!/usr/bin/env node
import { Command } from 'commander';
import { SkillIndex } from '../src/skillIndex.js';

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
program
  .command('measure [path]')
  .description('Compute TLIS / GNCI / CFI routability metrics')
  .action(async (pathArg) => {
    // Implemented in Commit 21
    console.log(`[measure] ${pathArg ?? '.'} — (available from v0.2.0)`);
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
