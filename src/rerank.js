import { pipeline, env } from '@xenova/transformers';

env.allowRemoteModels = true;
env.useBrowserCache = false;

const RERANKER_ID = 'Xenova/bge-reranker-v2-m3';

// Singleton: ONNX session kept open across calls — no session re-init overhead
let _reranker = null;

async function defaultRerankerFn(query, texts) {
  if (!_reranker) {
    // quantized=true loads the int8 ONNX weights (~4× smaller → faster cold start)
    _reranker = await pipeline('text-classification', RERANKER_ID, { quantized: true });
  }
  const pairs = texts.map((t) => [query, t]);
  // Single batched inference call — all pairs scored in one ONNX forward pass
  const outputs = await _reranker(pairs, {
    function_to_apply: 'sigmoid',
    batch_size: pairs.length,
  });
  return (Array.isArray(outputs) ? outputs : [outputs]).map((o) => o.score);
}

function manifestText(m) {
  return `${m.id} ${m.name ?? ''} ${m.description ?? ''}`.trim();
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
