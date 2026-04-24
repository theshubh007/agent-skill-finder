#!/usr/bin/env node
/**
 * Retrieval evaluation harness — Hit@1 / Hit@5 / Hit@20 + MRR
 * against the 150-skill annotated eval set.
 *
 * Usage:
 *   node eval/run_retrieval_eval.js [--index-dir <path>] [--top-k <n>]
 *
 * Requires a pre-built skills.lance index. Run `asf ingest` first.
 * Set ASF_ALLOW_REMOTE=1 to allow BGE-small model download on first run.
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recall } from '../src/index.js';
import { evaluate } from './metrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { indexDir: resolve('.'), topK: 100 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--index-dir' && argv[i + 1]) args.indexDir = resolve(argv[++i]);
    if (argv[i] === '--top-k' && argv[i + 1])    args.topK = parseInt(argv[++i], 10);
  }
  return args;
}

async function main() {
  const { indexDir, topK } = parseArgs(process.argv);

  const evalSet = JSON.parse(
    readFileSync(join(__dirname, 'data', 'retrieval_eval_150.json'), 'utf8'),
  );

  console.log(`Eval: ${evalSet.length} queries | index: ${indexDir} | topK: ${topK}`);
  console.log('Running...\n');

  const rankFn = async (query) => {
    const results = await recall(query, topK, { rootDir: indexDir });
    return results.map((r) => r.id);
  };

  const metrics = await evaluate(evalSet, rankFn, { ks: [1, 5, 20], mrr: true });

  const colW = 10;
  const header = Object.keys(metrics).map((k) => k.padEnd(colW)).join('');
  const values = Object.values(metrics).map((v) => v.toFixed(4).padEnd(colW)).join('');
  console.log(header);
  console.log(values);

  // Category breakdown
  const byCategory = {};
  for (const entry of evalSet) {
    const cat = entry.category ?? 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(entry);
  }

  console.log('\nCategory breakdown (Hit@5):');
  for (const [cat, entries] of Object.entries(byCategory).sort()) {
    const catMetrics = await evaluate(entries, rankFn, { ks: [5], mrr: false });
    const score = catMetrics['Hit@5'].toFixed(4);
    console.log(`  ${cat.padEnd(16)} ${score}  (n=${entries.length})`);
  }
}

main().catch((e) => {
  console.error('[error]', e.message);
  process.exit(1);
});
