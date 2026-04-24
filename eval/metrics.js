/**
 * Hit@K retrieval evaluation metrics.
 * Pure computation — no I/O, no model calls.
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
