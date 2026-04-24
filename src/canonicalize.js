import { createHash } from 'node:crypto';

/**
 * Cosine similarity between two embedding vectors.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} -1 to 1
 */
export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * SHA256-based structural hash of script content.
 * Strips comments and normalises whitespace so formatting-only changes
 * produce the same hash (confirming structural identity).
 *
 * @param {string} content
 * @returns {string} 16-char hex prefix
 */
export function astHash(content) {
  const normalised = content
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

/**
 * Cross-registry deduplication: two passes (structural AST hash, then semantic cosine).
 *
 * For each duplicate pair the lower-quality variant (slop_score rank) receives a
 * `duplicate_of` edge pointing to the canonical node.  The canonical node's id is
 * written back into every manifest as `canonicalId`.
 *
 * @param {Array<{id: string, description: string, quality?: {slop_score?: number}}>} manifests
 * @param {{
 *   scriptContents?: Map<string, string>,
 *   embeddings?: Map<string, number[]>,
 *   cosineThreshold?: number,
 * }} [opts]
 * @returns {{
 *   duplicateEdges: object[],
 *   rawCount: number,
 *   canonicalCount: number,
 *   dedupePercent: number,
 * }}
 */
export function canonicalize(manifests, {
  scriptContents = null,
  embeddings = null,
  cosineThreshold = 0.97,
} = {}) {
  // Track all duplicate edges (source = alias, target = canonical)
  const duplicateEdges = [];
  // id → canonicalId (resolved lazily via chain)
  const canonicalMap = new Map(manifests.map((m) => [m.id, m.id]));

  function slopScore(m) {
    return m.quality?.slop_score ?? 1;
  }

  function pickCanonical(a, b) {
    return slopScore(a) >= slopScore(b) ? [a, b] : [b, a];
  }

  function markDuplicate(winner, loser, relation, confidence, score) {
    // Only add if not already a duplicate
    if (canonicalMap.get(loser.id) !== loser.id) return;
    canonicalMap.set(loser.id, winner.id);
    duplicateEdges.push({
      source: loser.id,
      target: winner.id,
      relation,
      confidence,
      confidence_score: Math.round(score * 1000) / 1000,
      source_file: loser.source?.path ?? '',
      source_location: '',
      weight: score,
    });
  }

  // Pass 1 — structural dedup via AST hash
  if (scriptContents) {
    const hashBuckets = new Map();
    for (const m of manifests) {
      const src = scriptContents.get(m.id);
      if (!src) continue;
      const h = astHash(src);
      if (!hashBuckets.has(h)) hashBuckets.set(h, []);
      hashBuckets.get(h).push(m);
    }
    for (const [, group] of hashBuckets) {
      if (group.length <= 1) continue;
      group.sort((a, b) => slopScore(b) - slopScore(a));
      const canonical = group[0];
      for (let i = 1; i < group.length; i++) {
        markDuplicate(canonical, group[i], 'duplicate_of', 'EXTRACTED', 1.0);
      }
    }
  }

  // Pass 2 — semantic dedup via cosine similarity
  if (embeddings) {
    const ids = manifests.map((m) => m.id).filter((id) => embeddings.has(id));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const idA = ids[i], idB = ids[j];
        if (canonicalMap.get(idA) !== idA || canonicalMap.get(idB) !== idB) continue;
        const sim = cosineSimilarity(embeddings.get(idA), embeddings.get(idB));
        if (sim < cosineThreshold) continue;
        const mA = manifests.find((m) => m.id === idA);
        const mB = manifests.find((m) => m.id === idB);
        const [winner, loser] = pickCanonical(mA, mB);
        markDuplicate(winner, loser, 'duplicate_of', 'INFERRED', sim);
      }
    }
  }

  // Resolve transitive chains: A → B → C becomes A → C
  for (const [id, cid] of canonicalMap) {
    let resolved = cid;
    const visited = new Set([id]);
    while (canonicalMap.get(resolved) !== resolved) {
      if (visited.has(resolved)) break;
      visited.add(resolved);
      resolved = canonicalMap.get(resolved);
    }
    canonicalMap.set(id, resolved);
  }

  // Write canonicalId back to manifests
  for (const m of manifests) {
    m.canonicalId = canonicalMap.get(m.id) ?? m.id;
  }

  const rawCount = manifests.length;
  const canonicalCount = new Set(canonicalMap.values()).size;
  const dedupePercent = rawCount > 0
    ? Math.round((1 - canonicalCount / rawCount) * 1000) / 10
    : 0;

  return { duplicateEdges, rawCount, canonicalCount, dedupePercent };
}
