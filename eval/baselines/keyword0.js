/**
 * Keyword-0 baseline — exact keyword match, no semantic search.
 *
 * Scores each skill by token overlap between the query and the skill's
 * name + description. No embeddings, no graph walk.
 */

function tokenize(text) {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
  );
}

function overlapScore(queryTokens, skillTokens) {
  let count = 0;
  for (const t of queryTokens) if (skillTokens.has(t)) count++;
  return count;
}

/**
 * Create a Keyword-0 baseline retriever.
 *
 * @param {object[]} manifests  SkillManifest objects
 * @returns {{ name: string, rank: (query: string) => Promise<string[]> }}
 */
export function createKeyword0(manifests) {
  const indexed = manifests.map((m) => ({
    id: m.id,
    tokens: tokenize(`${m.name ?? ''} ${m.description ?? ''}`),
  }));

  return {
    name: 'Keyword-0',
    async rank(query) {
      const qTokens = tokenize(query);
      return indexed
        .map(({ id, tokens }) => ({ id, score: overlapScore(qTokens, tokens) }))
        .sort((a, b) => b.score - a.score || 0)
        .map((x) => x.id);
    },
  };
}
