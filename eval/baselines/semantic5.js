/**
 * Semantic-5 baseline — bi-encoder top-5, no rerank, no graph walk.
 *
 * Exercises only Stage 1 (ANN recall). Isolates the contribution of
 * cross-encoder reranking and graph expansion to the full pipeline.
 */

/**
 * Create a Semantic-5 baseline retriever.
 *
 * @param {Function} recallFn  async (query: string, k: number) => { id: string }[]
 *                             injectable ANN recall function (e.g. from src/index.js recall())
 * @param {number}   k         number of results to return (default 5)
 * @returns {{ name: string, rank: (query: string) => Promise<string[]> }}
 */
export function createSemantic5(recallFn, k = 5) {
  return {
    name: 'Semantic-5',
    async rank(query) {
      const results = await recallFn(query, k);
      return results.map((r) => r.id);
    },
  };
}
