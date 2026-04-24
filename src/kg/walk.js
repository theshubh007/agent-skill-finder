const DEFAULT_EDGE_TYPES = ['depends_on', 'complements', 'co_used_with'];
const CHARS_PER_TOKEN = 3;

function _nodeTextLen(G, id) {
  const label = G.getNodeAttribute(id, 'label') ?? id;
  return `NODE ${label}\n`.length;
}

/**
 * Token-bounded BFS subgraph expansion (Stage 3 core hot path).
 *
 * @param {import('graphology').DirectedGraph} G
 * @param {string[]} seeds  starting node IDs
 * @param {{
 *   edgeTypes?: string[],
 *   tokenBudget?: number,
 *   dedupeBy?: string|null,
 *   slopFilter?: number,
 * }} opts
 * @returns {{ nodes: string[], edges: Array<{source: string, target: string, relation: string}> }}
 */
export function expandSubgraph(G, seeds, {
  edgeTypes = DEFAULT_EDGE_TYPES,
  tokenBudget = 4000,
  dedupeBy = 'canonicalId',
  slopFilter = 0,
} = {}) {
  if (G.order === 0 || seeds.length === 0) return { nodes: [], edges: [] };

  const edgeTypeSet = new Set(edgeTypes);
  const visited = new Set();
  const seenCanonical = new Set();
  const resultNodes = [];
  const resultEdges = [];
  let charBudget = tokenBudget * CHARS_PER_TOKEN;

  for (const seed of seeds) {
    if (!G.hasNode(seed) || visited.has(seed)) continue;
    if (dedupeBy) {
      const cid = G.getNodeAttribute(seed, dedupeBy) ?? null;
      if (cid && seenCanonical.has(cid)) continue;
      if (cid) seenCanonical.add(cid);
    }
    visited.add(seed);
    resultNodes.push(seed);
    charBudget -= _nodeTextLen(G, seed);
  }

  let frontier = resultNodes.slice();

  while (frontier.length > 0 && charBudget > 0) {
    const next = [];
    for (const node of frontier) {
      G.forEachOutEdge(node, (edge, attrs, source, target) => {
        if (!edgeTypeSet.has(attrs.relation)) return;
        if (visited.has(target)) return;

        const slopScore = G.getNodeAttribute(target, 'slopScore') ?? 1;
        if (slopScore < slopFilter) return;

        if (dedupeBy) {
          const cid = G.getNodeAttribute(target, dedupeBy) ?? null;
          if (cid && seenCanonical.has(cid)) return;
          if (cid) seenCanonical.add(cid);
        }

        const textLen = _nodeTextLen(G, target);
        if (charBudget - textLen < 0) return;

        charBudget -= textLen;
        visited.add(target);
        next.push(target);
        resultNodes.push(target);
        resultEdges.push({ source: node, target, relation: attrs.relation });
      });
    }
    frontier = next;
  }

  return { nodes: resultNodes, edges: resultEdges };
}
