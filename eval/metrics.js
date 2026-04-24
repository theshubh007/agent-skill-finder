/**
 * 14-metric eval harness for AgentSkillFinder.
 *
 * Retrieval:   Hit@1, Hit@5, Hit@20, MRR
 * Composition: Composition Success Rate (CSR), Composition Deadlock Rate (CDR)
 * Graph:       TLIS, GNCI, CFI, RScore (imported from src/metrics.js)
 * Efficiency:  Token Reduction, Latency p50, Latency p95
 * Quality:     Slop Gate Precision
 */

/**
 * Returns 1 if any relevant skill appears in the top-K ranked results, else 0.
 * @param {string[]} rankedIds  skill IDs in descending relevance order
 * @param {Set<string>} relevantIds  ground-truth relevant skill IDs
 * @param {number} k  cutoff
 * @returns {0|1}
 */
export function hitAtK(rankedIds, relevantIds, k) {
  const topK = rankedIds.slice(0, k);
  return topK.some((id) => relevantIds.has(id)) ? 1 : 0;
}

/**
 * Mean Reciprocal Rank — average of 1/rank of first relevant hit (0 if none in topN).
 * @param {string[]} rankedIds
 * @param {Set<string>} relevantIds
 * @param {number} [maxRank=20]
 * @returns {number}
 */
export function reciprocalRank(rankedIds, relevantIds, maxRank = 20) {
  for (let i = 0; i < Math.min(rankedIds.length, maxRank); i++) {
    if (relevantIds.has(rankedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * Aggregate Hit@K and MRR over an eval set given pre-ranked result lists.
 *
 * @param {Array<{ query: string, relevant: string[] }>} evalSet
 * @param {(query: string) => string[]} rankFn  returns ranked skill ID list for a query
 * @param {{ ks?: number[], mrr?: boolean }} [opts]
 * @returns {{ [key: string]: number }}  e.g. { 'Hit@1': 0.72, 'Hit@5': 0.91, 'Hit@20': 0.96, MRR: 0.78 }
 */
export async function evaluate(evalSet, rankFn, { ks = [1, 5, 20], mrr = true } = {}) {
  const sums = Object.fromEntries(ks.map((k) => [`Hit@${k}`, 0]));
  if (mrr) sums.MRR = 0;
  let n = 0;

  for (const entry of evalSet) {
    const rankedIds = await rankFn(entry.query);
    const relevantIds = new Set(entry.relevant);
    for (const k of ks) sums[`Hit@${k}`] += hitAtK(rankedIds, relevantIds, k);
    if (mrr) sums.MRR += reciprocalRank(rankedIds, relevantIds);
    n++;
  }

  return Object.fromEntries(
    Object.entries(sums).map(([k, v]) => [k, n > 0 ? Math.round((v / n) * 10000) / 10000 : 0]),
  );
}

// ── Composition metrics ───────────────────────────────────────────────────────

/**
 * Composition Success Rate — fraction of bundles where all required skills are
 * present and the composition plan has no deadlocks.
 *
 * @param {Array<{ plan: { deadlocks: any[] }, manifests: object[] }>} bundles
 * @param {Array<string[]>} requiredPerBundle  required skill IDs for each bundle
 * @returns {number}  0–1
 */
export function compositionSuccessRate(bundles, requiredPerBundle) {
  if (bundles.length === 0) return 0;
  let success = 0;
  for (let i = 0; i < bundles.length; i++) {
    const b = bundles[i];
    const required = requiredPerBundle[i] ?? [];
    const ids = new Set((b.manifests ?? []).map((m) => m.id));
    const allPresent = required.every((r) => ids.has(r));
    const noDeadlocks = (b.plan?.deadlocks ?? []).length === 0;
    if (allPresent && noDeadlocks) success++;
  }
  return success / bundles.length;
}

/**
 * Composition Deadlock Rate — fraction of bundles that contain at least one deadlock.
 *
 * @param {Array<{ plan: { deadlocks: any[] } }>} bundles
 * @returns {number}  0–1
 */
export function compositionDeadlockRate(bundles) {
  if (bundles.length === 0) return 0;
  const withDeadlocks = bundles.filter((b) => (b.plan?.deadlocks ?? []).length > 0).length;
  return withDeadlocks / bundles.length;
}

// ── Efficiency metrics ────────────────────────────────────────────────────────

/**
 * Token Reduction — fraction of total available tokens saved by routing vs. injecting all skills.
 *
 * @param {number} totalTokens    tokens in the full skill catalog
 * @param {number} bundleTokens   tokens in the routed bundle
 * @returns {number}  0–1
 */
export function tokenReduction(totalTokens, bundleTokens) {
  if (totalTokens <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - bundleTokens / totalTokens));
}

/**
 * Compute p50 and p95 latency from an array of timing samples (ms).
 *
 * @param {number[]} samples  array of latency values in milliseconds
 * @returns {{ p50: number, p95: number }}
 */
export function latencyPercentiles(samples) {
  if (samples.length === 0) return { p50: 0, p95: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { p50, p95 };
}

// ── Quality metrics ───────────────────────────────────────────────────────────

/**
 * Slop Gate Precision — fraction of skills flagged by the slop gate that are
 * true positives (i.e., confirmed low-quality or duplicate).
 *
 * @param {object[]} flagged           skills the gate flagged (slop_score ≥ threshold)
 * @param {Set<string>} confirmedBad   skill IDs confirmed as low-quality
 * @returns {number}  0–1
 */
export function slopGatePrecision(flagged, confirmedBad) {
  if (flagged.length === 0) return 0;
  const truePositives = flagged.filter((s) => confirmedBad.has(s.id)).length;
  return truePositives / flagged.length;
}

// ── Full 14-metric report ─────────────────────────────────────────────────────

/**
 * Run all 14 metrics over an eval result set.
 *
 * @param {{
 *   evalSet:          Array<{ query: string, relevant: string[] }>,
 *   rankFn:           (query: string) => Promise<string[]>,
 *   bundles:          Array<{ plan: object, manifests: object[] }>,
 *   requiredPerBundle: Array<string[]>,
 *   totalTokens:      number,
 *   bundleTokenSamples: number[],
 *   latencySamples:   number[],
 *   flaggedSkills:    object[],
 *   confirmedBadIds:  Set<string>,
 *   graphMetrics:     { tlis: number, gnci: number, cfi: number, rscore: number }
 * }} opts
 * @returns {Promise<object>}  all 14 metric values
 */
export async function fullReport({
  evalSet = [],
  rankFn = async () => [],
  bundles = [],
  requiredPerBundle = [],
  totalTokens = 0,
  bundleTokenSamples = [],
  latencySamples = [],
  flaggedSkills = [],
  confirmedBadIds = new Set(),
  graphMetrics = { tlis: 0, gnci: 0, cfi: 0, rscore: 0 },
} = {}) {
  const retrieval = await evaluate(evalSet, rankFn, { ks: [1, 5, 20], mrr: true });
  const avgBundleTokens = bundleTokenSamples.length > 0
    ? bundleTokenSamples.reduce((a, b) => a + b, 0) / bundleTokenSamples.length
    : 0;
  const { p50, p95 } = latencyPercentiles(latencySamples);

  return {
    // Retrieval
    'Hit@1':  retrieval['Hit@1'],
    'Hit@5':  retrieval['Hit@5'],
    'Hit@20': retrieval['Hit@20'],
    'MRR':    retrieval['MRR'],
    // Composition
    'CSR':    compositionSuccessRate(bundles, requiredPerBundle),
    'CDR':    compositionDeadlockRate(bundles),
    // Graph
    'TLIS':   graphMetrics.tlis,
    'GNCI':   graphMetrics.gnci,
    'CFI':    graphMetrics.cfi,
    'RScore': graphMetrics.rscore,
    // Efficiency
    'TokenReduction': tokenReduction(totalTokens, avgBundleTokens),
    'Latency_p50':    p50,
    'Latency_p95':    p95,
    // Quality
    'SlopPrecision': slopGatePrecision(flaggedSkills, confirmedBadIds),
  };
}
