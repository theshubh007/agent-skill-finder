/**
 * Auto-rewrite trigger for persistently low-scoring skills.
 *
 * A skill is flagged as an auto-rewrite candidate when:
 *   successRate < SUCCESS_THRESHOLD  (default 0.3)
 *   queryCount  ≥ MIN_QUERIES        (default 50)
 *
 * Candidates are surfaced by `asf eval --skill <id>` for human review
 * rather than being automatically rewritten, ensuring a human stays
 * in the loop before any manifest changes are applied.
 */

const SUCCESS_THRESHOLD = 0.3;
const MIN_QUERIES       = 50;

/**
 * Identify auto-rewrite candidates from a success-rate map.
 *
 * @param {Map<string, { successRate: number, queryCount: number }>} rateMap
 * @param {{ successThreshold?: number, minQueries?: number }} [opts]
 * @returns {Array<{ skillId: string, successRate: number, queryCount: number, auto_rewrite_candidate: true }>}
 */
export function findCandidates(rateMap, opts = {}) {
  const threshold  = opts.successThreshold ?? SUCCESS_THRESHOLD;
  const minQueries = opts.minQueries        ?? MIN_QUERIES;

  const candidates = [];
  for (const [skillId, stats] of rateMap) {
    if (stats.queryCount >= minQueries && stats.successRate < threshold) {
      candidates.push({
        skillId,
        successRate:             stats.successRate,
        queryCount:              stats.queryCount,
        auto_rewrite_candidate:  true,
      });
    }
  }

  // Worst performers first
  return candidates.sort((a, b) => a.successRate - b.successRate);
}

/**
 * Annotate a list of manifest objects with auto_rewrite_candidate where applicable.
 *
 * @param {object[]} manifests  each must have an `id` field
 * @param {Array<{ skillId: string }>} candidates  output of findCandidates()
 * @returns {object[]}  manifests with auto_rewrite_candidate: true added where flagged
 */
export function annotateManifests(manifests, candidates) {
  const flaggedIds = new Set(candidates.map((c) => c.skillId));
  return manifests.map((m) =>
    flaggedIds.has(m.id) ? { ...m, auto_rewrite_candidate: true } : m,
  );
}

/**
 * Full pipeline: pull rates from store, find candidates, return sorted list.
 *
 * @param {import('../telemetry.js').TelemetryStore} store
 * @param {{ successThreshold?: number, minQueries?: number }} [opts]
 * @returns {Promise<ReturnType<findCandidates>>}
 */
export async function detectRewriteCandidates(store, opts = {}) {
  const rateMap = await store.allSuccessRates();
  return findCandidates(rateMap, opts);
}
