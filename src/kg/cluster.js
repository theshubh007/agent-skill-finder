import louvain from 'graphology-communities-louvain';

/**
 * Derive a human-readable label for a community from the most-common
 * capabilityType among its nodes.
 *
 * @param {import('graphology').DirectedGraph} G
 * @param {string[]} nodeIds
 * @returns {string|null}  null when no capabilityType data present
 */
function deriveLabel(G, nodeIds) {
  const freq = new Map();
  for (const id of nodeIds) {
    const cap = G.getNodeAttribute(id, 'capabilityType');
    if (cap && cap !== 'unknown') {
      freq.set(cap, (freq.get(cap) ?? 0) + 1);
    }
  }
  if (freq.size === 0) return null;
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Compute intra-community edge cohesion ratio.
 * @param {import('graphology').DirectedGraph} G
 * @param {string[]} nodeIds
 * @returns {number}  0.0 – 1.0
 */
function cohesionScore(G, nodeIds) {
  const n = nodeIds.length;
  if (n <= 1) return 1.0;
  const nodeSet = new Set(nodeIds);
  let intra = 0;
  for (const id of nodeIds) {
    G.forEachOutNeighbor(id, (neighbor) => {
      if (nodeSet.has(neighbor)) intra++;
    });
  }
  // For directed graphs, max possible = n*(n-1)
  const possible = n * (n - 1);
  return possible > 0 ? Math.round((intra / possible) * 100) / 100 : 0;
}

/**
 * Run Louvain community detection on a skill knowledge graph.
 *
 * @param {import('graphology').DirectedGraph} G
 * @returns {{
 *   communities: Map<number, {nodes: string[], label: string|null, cohesion: number}>,
 *   unnamedCount: number
 * }}
 */
export function clusterGraph(G) {
  if (G.order === 0) {
    return { communities: new Map(), unnamedCount: 0 };
  }

  // Louvain assigns 'community' attribute to each node in-place
  louvain.assign(G, { nodeCommunityAttribute: 'communityId', getEdgeWeight: null });

  // Group nodes by communityId
  const groups = new Map();
  G.forEachNode((id) => {
    const cid = G.getNodeAttribute(id, 'communityId') ?? 0;
    if (!groups.has(cid)) groups.set(cid, []);
    groups.get(cid).push(id);
  });

  // Build community descriptors and tag nodes with communityLabel
  const communities = new Map();
  let unnamedCount = 0;

  for (const [cid, nodes] of groups) {
    const label = deriveLabel(G, nodes);
    const cohesion = cohesionScore(G, nodes);

    if (label === null) unnamedCount++;

    // Write communityLabel back to each node
    for (const id of nodes) {
      G.setNodeAttribute(id, 'communityLabel', label ?? '');
    }

    communities.set(cid, { nodes, label, cohesion });
  }

  return { communities, unnamedCount };
}
