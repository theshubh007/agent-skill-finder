import { DirectedGraph } from 'graphology';

const CONFIDENCE_RANK = { EXTRACTED: 3, INFERRED: 2, AMBIGUOUS: 1 };

function normalizeId(s) {
  return String(s).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

/**
 * Build a graphology DirectedGraph from skill manifests + extraction dicts.
 *
 * @param {import('../manifest.js').SkillManifest[]} manifests
 * @param {Array<{nodes: object[], edges: object[]}>} extractions
 * @returns {DirectedGraph}
 */
export function buildGraph(manifests, extractions = []) {
  const G = new DirectedGraph();

  // ── Add manifest nodes ───────────────────────────────────────────────────
  for (const m of manifests) {
    G.mergeNode(m.id, {
      manifestText: `${m.name}: ${m.description}`,
      capabilityType: m.capability?.type ?? 'unknown',
      riskTier: m.risk ?? 'safe',
      slopScore: m.quality?.slop_score ?? 1,
      canonicalId: m.id,
      label: m.name,
      source_file: m.source?.path ?? '',
    });
  }

  // ── Add extraction nodes (fill gaps not covered by manifests) ────────────
  for (const ext of extractions) {
    for (const node of (ext.nodes ?? [])) {
      if (!G.hasNode(node.id)) {
        G.addNode(node.id, {
          label: node.label ?? node.id,
          file_type: node.file_type ?? 'skill',
          source_file: node.source_file ?? '',
          capabilityType: 'unknown',
          riskTier: 'safe',
          slopScore: 1,
          canonicalId: node.id,
          manifestText: node.label ?? node.id,
        });
      }
    }
  }

  // Build normalized ID → real ID map for edge remapping
  const normMap = new Map();
  for (const nodeId of G.nodes()) {
    normMap.set(normalizeId(nodeId), nodeId);
  }

  // ── Merge edges — keep highest-confidence per (src, tgt, relation) triple ─
  // candidateEdges: key → best edge object so far
  const candidates = new Map();

  for (const ext of extractions) {
    for (const edge of (ext.edges ?? [])) {
      let src = edge.source;
      let tgt = edge.target;

      // Remap via normalization if exact ID not found
      if (!G.hasNode(src)) src = normMap.get(normalizeId(src)) ?? src;
      if (!G.hasNode(tgt)) tgt = normMap.get(normalizeId(tgt)) ?? tgt;
      if (!G.hasNode(src) || !G.hasNode(tgt)) continue;

      const key = `${src}→${tgt}:${edge.relation}`;
      const rank = CONFIDENCE_RANK[edge.confidence] ?? 0;
      const existing = candidates.get(key);
      if (!existing || rank > (CONFIDENCE_RANK[existing.confidence] ?? 0)) {
        candidates.set(key, { ...edge, source: src, target: tgt });
      }
    }
  }

  // Also add manifest-declared graph edges (depends_on, complements, co_used_with)
  for (const m of manifests) {
    for (const dep of (m.graph?.depends_on ?? [])) {
      const key = `${m.id}→${dep}:depends_on`;
      if (!candidates.has(key) && G.hasNode(dep)) {
        candidates.set(key, {
          source: m.id, target: dep,
          relation: 'depends_on',
          confidence: 'EXTRACTED',
          confidence_score: 1.0,
          source_file: m.source?.path ?? '',
          source_location: 'manifest',
          weight: 1.0,
        });
      }
    }
    for (const comp of (m.graph?.complements ?? [])) {
      const key = `${m.id}→${comp}:complements`;
      if (!candidates.has(key) && G.hasNode(comp)) {
        candidates.set(key, {
          source: m.id, target: comp,
          relation: 'complements',
          confidence: 'EXTRACTED',
          confidence_score: 1.0,
          source_file: m.source?.path ?? '',
          source_location: 'manifest',
          weight: 1.0,
        });
      }
    }
    for (const co of (m.graph?.co_used_with ?? [])) {
      const key = `${m.id}→${co}:co_used_with`;
      if (!candidates.has(key) && G.hasNode(co)) {
        candidates.set(key, {
          source: m.id, target: co,
          relation: 'co_used_with',
          confidence: 'EXTRACTED',
          confidence_score: 1.0,
          source_file: m.source?.path ?? '',
          source_location: 'manifest',
          weight: 1.0,
        });
      }
    }
  }

  for (const edge of candidates.values()) {
    const { source: src, target: tgt, ...attrs } = edge;
    if (!G.hasEdge(src, tgt)) {
      G.addEdge(src, tgt, attrs);
    }
  }

  return G;
}
