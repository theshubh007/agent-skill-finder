function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function manifestText(m) {
  return `${m.id} ${m.name ?? ''} ${m.description ?? ''}`.trim();
}

function jaccardScore(queryTokens, docTokens) {
  const qSet = new Set(queryTokens);
  const dSet = new Set(docTokens);
  let overlap = 0;
  for (const t of qSet) if (dSet.has(t)) overlap++;
  const union = qSet.size + dSet.size - overlap;
  return union > 0 ? overlap / union : 0;
}

async function defaultRerankerFn(query, texts) {
  const qTok = tokenize(query);
  return texts.map(t => jaccardScore(qTok, tokenize(t)));
}

export async function rerank(query, candidates, topK = 30, { rerankerFn = null } = {}) {
  if (candidates.length === 0) return [];
  const score = rerankerFn ?? defaultRerankerFn;
  const texts = candidates.map(manifestText);
  const scores = await score(query, texts);

  return candidates
    .map((m, i) => ({ ...m, _rerankScore: scores[i] }))
    .sort((a, b) => b._rerankScore - a._rerankScore)
    .slice(0, topK);
}
