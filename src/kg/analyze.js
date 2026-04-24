import betweennessCentrality from 'graphology-metrics/centrality/betweenness.js';

const GOD_NODE_THRESHOLD = 3.0;
const BRIDGE_TOP_N = 10;

/**
 * Return nodes with degree > mean_degree × threshold (GNCI component).
 *
 * @param {import('graphology').DirectedGraph} G
 * @param {{ threshold?: number, topN?: number }} opts
 * @returns {Array<{id: string, label: string, degree: number, ratio: number}>}
 */
export function detectGodNodes(G, { threshold = GOD_NODE_THRESHOLD, topN = 20 } = {}) {
  if (G.order === 0) return [];

  const degrees = [];
  G.forEachNode((id) => degrees.push(G.degree(id)));
  const mean = degrees.reduce((a, b) => a + b, 0) / degrees.length;
  const cutoff = mean * threshold;

  const gods = [];
  G.forEachNode((id) => {
    const deg = G.degree(id);
    if (deg > cutoff) {
      gods.push({
        id,
        label: G.getNodeAttribute(id, 'label') ?? id,
        degree: deg,
        ratio: mean > 0 ? Math.round((deg / mean) * 10) / 10 : 0,
      });
    }
  });

  gods.sort((a, b) => b.degree - a.degree);
  return gods.slice(0, topN);
}

/**
 * Return nodes with betweenness centrality outliers (top bridge nodes).
 * Uses graphology-metrics betweenness centrality.
 *
 * @param {import('graphology').DirectedGraph} G
 * @param {{ topN?: number }} opts
 * @returns {Array<{id: string, label: string, betweenness: number}>}
 */
export function detectBridgeNodes(G, { topN = BRIDGE_TOP_N } = {}) {
  if (G.order === 0) return [];

  // Assign betweennessCentrality attribute to each node
  betweennessCentrality.assign(G, {
    nodeCentralityAttribute: 'betweennessCentrality',
    normalized: true,
  });

  const scored = [];
  G.forEachNode((id) => {
    const bc = G.getNodeAttribute(id, 'betweennessCentrality') ?? 0;
    scored.push({
      id,
      label: G.getNodeAttribute(id, 'label') ?? id,
      betweenness: Math.round(bc * 1000) / 1000,
    });
  });

  scored.sort((a, b) => b.betweenness - a.betweenness);
  // Only return nodes with non-zero betweenness
  return scored.filter(n => n.betweenness > 0).slice(0, topN);
}

/**
 * Return tool nodes with zero edges (TLIS numerator).
 *
 * @param {import('graphology').DirectedGraph} G
 * @returns {Array<{id: string, label: string}>}
 */
export function detectIsolatedTools(G) {
  const isolated = [];
  G.forEachNode((id) => {
    if (G.degree(id) === 0) {
      isolated.push({
        id,
        label: G.getNodeAttribute(id, 'label') ?? id,
      });
    }
  });
  return isolated;
}

/**
 * Full analysis report for a skill knowledge graph.
 *
 * @param {import('graphology').DirectedGraph} G
 * @returns {{
 *   godNodes: object[],
 *   bridgeNodes: object[],
 *   isolatedToolNodes: object[],
 *   stats: {
 *     nodeCount: number,
 *     edgeCount: number,
 *     meanDegree: number,
 *     maxDegree: number,
 *     isolatedCount: number,
 *     godNodeCount: number,
 *     bridgeNodeCount: number,
 *   }
 * }}
 */
export function analyzeGraph(G) {
  const godNodes = detectGodNodes(G);
  const bridgeNodes = detectBridgeNodes(G);
  const isolatedToolNodes = detectIsolatedTools(G);

  const degrees = [];
  G.forEachNode((id) => degrees.push(G.degree(id)));
  const meanDegree = degrees.length > 0
    ? Math.round((degrees.reduce((a, b) => a + b, 0) / degrees.length) * 100) / 100
    : 0;
  const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;

  return {
    godNodes,
    bridgeNodes,
    isolatedToolNodes,
    stats: {
      nodeCount: G.order,
      edgeCount: G.size,
      meanDegree,
      maxDegree,
      isolatedCount: isolatedToolNodes.length,
      godNodeCount: godNodes.length,
      bridgeNodeCount: bridgeNodes.length,
    },
  };
}
