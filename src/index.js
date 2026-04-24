import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Okapi BM25 constants
const BM25_K1 = 1.5;
const BM25_B  = 0.75;

function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function manifestText(m) {
  return `${m.id} ${m.name ?? ''} ${m.description ?? ''} ${m.capability?.type ?? ''}`.trim();
}

export async function buildIndex(manifests, { rootDir = process.cwd() } = {}) {
  await writeFile(join(rootDir, '_index.json'), JSON.stringify(manifests, null, 2), 'utf8');
  return { count: manifests.length };
}

export async function recall(query, topK = 100, { rootDir = process.cwd() } = {}) {
  const raw = await readFile(join(rootDir, '_index.json'), 'utf8');
  const manifests = JSON.parse(raw);
  if (manifests.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return manifests.slice(0, topK);

  const docs = manifests.map(m => ({ m, tokens: tokenize(manifestText(m)) }));

  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.tokens.length, 0) / N;

  const df = new Map();
  for (const { tokens } of docs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = t => Math.log((N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5) + 1);

  const scored = docs.map(({ m, tokens }) => {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const dl = tokens.length;
    let score = 0;
    for (const q of queryTokens) {
      const f = tf.get(q) ?? 0;
      if (f === 0) continue;
      score += idf(q) * (f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl));
    }
    return { m, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.m);
}
