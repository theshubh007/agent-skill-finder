/**
 * End-to-end latency benchmark — verifies p50 ≤ 65ms on the 4-stage pipeline.
 *
 * Usage (standalone):
 *   node eval/perf/latency_p50_p95.js
 *
 * Usage (programmatic):
 *   import { runLatencyBenchmark, assertP50Target } from './eval/perf/latency_p50_p95.js';
 *   const result = await runLatencyBenchmark(rankFn, queries, { warmupRuns: 5, measureRuns: 100 });
 *   assertP50Target(result);  // throws if p50 > P50_TARGET_MS
 */

import { latencyPercentiles } from '../metrics.js';

export const P50_TARGET_MS = 65;
export const P95_TARGET_MS = 150;

const DEFAULT_WARMUP_RUNS  = 5;
const DEFAULT_MEASURE_RUNS = 100;

/**
 * Run a latency benchmark over a set of queries.
 *
 * @param {(query: string) => Promise<unknown>} rankFn  function under test
 * @param {string[]} queries  list of query strings to cycle through
 * @param {{ warmupRuns?: number, measureRuns?: number }} [opts]
 * @returns {Promise<{
 *   p50: number, p95: number,
 *   min: number, max: number, mean: number,
 *   samples: number[],
 *   p50PassTarget: boolean, p95PassTarget: boolean,
 * }>}
 */
export async function runLatencyBenchmark(rankFn, queries, opts = {}) {
  const warmupRuns  = opts.warmupRuns  ?? DEFAULT_WARMUP_RUNS;
  const measureRuns = opts.measureRuns ?? DEFAULT_MEASURE_RUNS;

  if (queries.length === 0) throw new Error('queries must be non-empty');

  // Warmup — prime caches without recording timings
  for (let i = 0; i < warmupRuns; i++) {
    await rankFn(queries[i % queries.length]);
  }

  // Measurement
  const samples = [];
  for (let i = 0; i < measureRuns; i++) {
    const t0 = performance.now();
    await rankFn(queries[i % queries.length]);
    samples.push(Math.round(performance.now() - t0));
  }

  const { p50, p95 } = latencyPercentiles(samples);
  const min  = Math.min(...samples);
  const max  = Math.max(...samples);
  const mean = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);

  return {
    p50, p95, min, max, mean, samples,
    p50PassTarget: p50 <= P50_TARGET_MS,
    p95PassTarget: p95 <= P95_TARGET_MS,
  };
}

/**
 * Assert that a benchmark result meets the p50 target.
 * Throws a descriptive error on failure.
 *
 * @param {{ p50: number, p50PassTarget: boolean }} result
 */
export function assertP50Target(result) {
  if (!result.p50PassTarget) {
    throw new Error(
      `p50 latency target exceeded: got ${result.p50}ms, target ≤ ${P50_TARGET_MS}ms`,
    );
  }
}

/**
 * Format a benchmark result as a human-readable summary string.
 *
 * @param {{ p50, p95, min, max, mean, p50PassTarget, p95PassTarget }} result
 * @returns {string}
 */
export function formatResult(result) {
  const p50Status = result.p50PassTarget ? '✓' : '✗';
  const p95Status = result.p95PassTarget ? '✓' : '✗';
  return [
    `Latency benchmark (${result.samples?.length ?? '?'} samples):`,
    `  p50: ${result.p50}ms  ${p50Status} (target ≤${P50_TARGET_MS}ms)`,
    `  p95: ${result.p95}ms  ${p95Status} (target ≤${P95_TARGET_MS}ms)`,
    `  min: ${result.min}ms  max: ${result.max}ms  mean: ${result.mean}ms`,
  ].join('\n');
}

// ── Standalone entrypoint ─────────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('latency_p50_p95.js');

if (isMain) {
  // Stub rank function simulating 4-stage pipeline timing distribution.
  // Replace with a real JITRouter.find() call against the production index.
  const stageTimings = { recall: 10, rerank: 44, graph: 3, hydrate: 1 }; // ms baseline (≈58ms)
  const jitter = () => Math.floor(Math.random() * 12) - 2; // -2..+9ms noise → p50 ≈ 61ms

  const stubRankFn = async (_query) => {
    const totalMs = Object.values(stageTimings).reduce((a, b) => a + b, 0) + jitter();
    await new Promise((r) => setTimeout(r, Math.max(1, totalMs)));
    return ['skill-a', 'skill-b', 'skill-c', 'skill-d'];
  };

  const SAMPLE_QUERIES = [
    'fetch SSE stream and execute bash command',
    'parse JSON and transform to CSV',
    'run SQL query against schema',
    'align genomic sequences and visualize',
    'sign manifest with ed25519 key',
  ];

  console.log('Running latency benchmark (stub pipeline)...\n');
  const result = await runLatencyBenchmark(stubRankFn, SAMPLE_QUERIES, {
    warmupRuns: 3,
    measureRuns: 30,
  });
  console.log(formatResult(result));
  process.exit(result.p50PassTarget ? 0 : 1);
}
