/**
 * Static-100 baseline — inject all top-N most popular skills regardless of query.
 *
 * Simulates the naive approach of always providing the same large tool list.
 * Represents the "no routing" worst case for token consumption.
 */

/**
 * Create a Static-100 baseline retriever.
 *
 * @param {object[]} manifests  SkillManifest objects (assumed sorted by popularity/index order)
 * @param {number}   n          number of top skills to always return (default 100)
 * @returns {{ name: string, rank: (query: string) => Promise<string[]> }}
 */
export function createStatic100(manifests, n = 100) {
  const topN = manifests.slice(0, n).map((m) => m.id);

  return {
    name: 'Static-100',
    async rank(_query) {
      return topN;
    },
  };
}
