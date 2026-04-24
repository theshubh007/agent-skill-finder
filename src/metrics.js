/**
 * Routability metrics for Skill Knowledge Graphs.
 *
 * TLIS = Tool-Link Isolation Score     — isolated nodes / total nodes
 * GNCI = Graph Node Centrality Index   — max degree / mean degree
 * CFI  = Community Fragmentation Index — total communities / named communities
 * RScore = combined routing health score (0–1, higher = healthier)
 *
 * Healthy thresholds: TLIS < 0.5, GNCI < 20, CFI < 10
 */

/**
 * @param {import('graphology').DirectedGraph} G
 * @returns {number} 0–1
 */
export function computeTLIS(G) {
  if (G.order === 0) return 0;
  let isolated = 0;
  G.forEachNode((id) => { if (G.degree(id) === 0) isolated++; });
  return isolated / G.order;
}

/**
 * @param {import('graphology').DirectedGraph} G
 * @returns {number} ≥ 0
 */
export function computeGNCI(G) {
  if (G.order === 0) return 0;
  const degrees = [];
  G.forEachNode((id) => degrees.push(G.degree(id)));
  const mean = degrees.reduce((a, b) => a + b, 0) / degrees.length;
  if (mean === 0) return 0;
  return Math.max(...degrees) / mean;
}

/**
 * @param {{ communities: Map<number, {nodes: string[], label: string|null, cohesion: number}> }} clusterResult
 * @returns {number} ≥ 1 (or 0 for empty graph)
 */
export function computeCFI(clusterResult) {
  const { communities } = clusterResult;
  const total = communities.size;
  if (total === 0) return 0;
  const named = [...communities.values()].filter((c) => c.label !== null).length;
  if (named === 0) return total;
  return total / named;
}

/**
 * Combined routing health score.
 * normalize(GNCI) = min(GNCI / 40, 1)  — 2× the healthy threshold
 * normalize(CFI)  = min(CFI  / 20, 1)  — 2× the healthy threshold
 *
 * @param {number} tlis
 * @param {number} gnci
 * @param {number} cfi
 * @returns {number} 0–1
 */
export function computeRScore(tlis, gnci, cfi) {
  const normGNCI = Math.min(gnci / 40, 1);
  const normCFI = Math.min(cfi / 20, 1);
  return Math.max(0, Math.round((1 - (tlis + normGNCI + normCFI) / 3) * 100) / 100);
}

/**
 * @param {number} rscore
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
export function routingRisk(rscore) {
  if (rscore >= 0.7) return 'LOW';
  if (rscore >= 0.4) return 'MEDIUM';
  return 'HIGH';
}

/**
 * @param {number} tlis
 * @param {number} gnci
 * @param {number} cfi
 * @returns {string[]}
 */
export function failureModes(tlis, gnci, cfi) {
  const modes = [];
  if (tlis >= 0.5) modes.push('Isolation Deadlock (TLIS >= 0.5)');
  if (gnci >= 20) modes.push('Coupling Lock (GNCI >= 20)');
  if (cfi >= 10) modes.push('Fragmentation Collapse (CFI >= 10)');
  return modes;
}
