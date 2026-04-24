/**
 * Learning-to-Rank retrain from telemetry success signals.
 *
 * Reads per-skill success rates from a TelemetryStore and produces
 * score delta adjustments. The deltas are additive corrections
 * applied on top of the base retrieval score during reranking:
 *
 *   adjusted_score = base_score + delta
 *
 * Delta formula:
 *   delta = (successRate - BASELINE) * SCALE_FACTOR
 *
 * where BASELINE = 0.5 (neutral) and SCALE_FACTOR = 0.2.
 * Skills with ≥ MIN_QUERIES observations are adjusted; others get delta = 0.
 */

const BASELINE     = 0.5;
const SCALE_FACTOR = 0.2;
const MIN_QUERIES  = 10;

/**
 * Compute score deltas from a success-rate map.
 *
 * @param {Map<string, { successRate: number, queryCount: number }>} rateMap
 * @returns {Map<string, number>}  skillId → delta (negative = demote, positive = promote)
 */
export function computeDeltas(rateMap) {
  const deltas = new Map();
  for (const [id, stats] of rateMap) {
    if (stats.queryCount < MIN_QUERIES) { deltas.set(id, 0); continue; }
    const delta = Math.round((stats.successRate - BASELINE) * SCALE_FACTOR * 10000) / 10000;
    deltas.set(id, delta);
  }
  return deltas;
}

/**
 * Apply delta adjustments to a list of scored skills.
 *
 * @param {Array<{ id: string, score: number }>} skills
 * @param {Map<string, number>} deltas
 * @returns {Array<{ id: string, score: number, adjustedScore: number, delta: number }>}
 */
export function applyDeltas(skills, deltas) {
  return skills
    .map((s) => {
      const delta = deltas.get(s.id) ?? 0;
      return { ...s, delta, adjustedScore: Math.round((s.score + delta) * 10000) / 10000 };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);
}

/**
 * Full LTR retrain: pull rates from store, compute deltas, return adjustment map.
 *
 * @param {import('../telemetry.js').TelemetryStore} store
 * @returns {Promise<Map<string, number>>}  skillId → delta
 */
export async function retrain(store) {
  const rateMap = await store.allSuccessRates();
  return computeDeltas(rateMap);
}
