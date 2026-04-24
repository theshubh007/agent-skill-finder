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
        // depends_on edges are mandatory — always follow them regardless of slop score
        // to prevent Composition Deadlock (a required dependency silently dropped)
        if (attrs.relation !== 'depends_on' && slopScore < slopFilter) return;

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

/**
 * Stage 3 pipeline entry point: expand the SKG from Stage 2 top-K candidates.
 * Seeds = candidate .id values that exist in the graph.
 * Follows only depends_on + complements (co_used_with excluded at this stage).
 *
 * @param {import('graphology').DirectedGraph} G
 * @param {Array<{id: string}>} candidates  manifests from Stage 2 reranker output
 * @param {{ tokenBudget?: number, slopFilter?: number, dedupeBy?: string|null }} opts
 */
export function walkFromCandidates(G, candidates, {
  tokenBudget = 4000,
  slopFilter = 0,
  dedupeBy = 'canonicalId',
} = {}) {
  const seeds = candidates.map((m) => m.id).filter((id) => G.hasNode(id));
  return expandSubgraph(G, seeds, {
    edgeTypes: ['depends_on', 'complements'],
    tokenBudget,
    slopFilter,
    dedupeBy,
  });
}
