/**
 * GAP-TD-5 baseline — full ASF 4-stage pipeline (the proposed system).
 *
 * Stages: ANN recall (k=100) → cross-encoder rerank (top-30) →
 *         graph walk (token-bounded BFS) → topological plan.
 * Returns up to maxSkills (default 5) ranked skill IDs.
 */

/**
 * Create a GAP-TD-5 baseline retriever backed by a JITRouter instance.
 *
 * @param {object} router      JITRouter instance (src/router.js)
 * @param {number} maxSkills   max skills per bundle (default 5)
 * @returns {{ name: string, rank: (query: string) => Promise<string[]> }}
 */
export function createGapTd5(router, maxSkills = 5) {
  return {
    name: 'GAP-TD-5',
    async rank(query) {
      const { bundle } = await router.find({ task: query, maxSkills });
      return bundle.manifests.map((m) => m.id);
    },
  };
}
