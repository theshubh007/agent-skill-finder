import { connect, Index } from '@lancedb/lancedb';
import { pipeline, env } from '@xenova/transformers';
import { join } from 'node:path';

env.allowRemoteModels = true;
env.useBrowserCache = false;

const MODEL_ID = 'Xenova/bge-small-en-v1.5';
const TABLE_NAME = 'skills';
const RRF_K = 60;

// HNSW tuning: m=16 (graph degree), efConstruction=100 (build quality)
const HNSW_M = 16;
const HNSW_EF_CONSTRUCTION = 100;

let _pipe = null;
// Warm-start cache: dbPath → open Table reference
const _tableCache = new Map();

async function defaultEmbedFn(texts) {
  if (!_pipe) _pipe = await pipeline('feature-extraction', MODEL_ID, { quantized: true });
  const out = await _pipe(texts, { pooling: 'mean', normalize: true });
  const dim = out.dims[1];
  return Array.from({ length: texts.length }, (_, i) =>
    Array.from(out.data.slice(i * dim, (i + 1) * dim)),
  );
}

function manifestText(m) {
  return `${m.id} ${m.name ?? ''} ${m.description ?? ''}`.trim();
}

function rrfFuse(annRows, ftsRows, topK) {
  const scores = new Map();
  const byId = new Map();

  const rank = (rows) => {
    rows.forEach((r, i) => {
      scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (RRF_K + i + 1));
      byId.set(r.id, r);
    });
  };

  rank(annRows);
  rank(ftsRows);

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => JSON.parse(byId.get(id).manifest));
}

export async function buildIndex(manifests, { rootDir = process.cwd(), embedFn = null } = {}) {
  const embed = embedFn ?? defaultEmbedFn;
  const texts = manifests.map(manifestText);
  const vecs = await embed(texts);

  const records = manifests.map((m, i) => ({
    id: m.id,
    text: texts[i],
    vector: vecs[i],
    manifest: JSON.stringify(m),
  }));

  const dbPath = join(rootDir, 'skills.lance');
  const db = await connect(dbPath);
  const existing = await db.tableNames();
  if (existing.includes(TABLE_NAME)) await db.dropTable(TABLE_NAME);
  const table = await db.createTable(TABLE_NAME, records);

  // Build FTS index for BM25 recall and HNSW index for sub-10ms ANN
  await table.createIndex('text', { config: Index.fts() });
  await table.createIndex('vector', {
    config: Index.hnswSq({ m: HNSW_M, efConstruction: HNSW_EF_CONSTRUCTION }),
  });

  // Warm-start: cache open table so first recall() skips reconnect overhead
  _tableCache.set(dbPath, table);

  return { count: records.length };
}

export async function recall(query, topK = 100, { rootDir = process.cwd(), embedFn = null } = {}) {
  const embed = embedFn ?? defaultEmbedFn;
  const [qVec] = await embed([query]);

  // Reuse warm table handle; fall back to fresh connect on first call
  const dbPath = join(rootDir, 'skills.lance');
  let table = _tableCache.get(dbPath);
  if (!table) {
    const db = await connect(dbPath);
    table = await db.openTable(TABLE_NAME);
    _tableCache.set(dbPath, table);
  }
  const fetchK = Math.min(Math.ceil(topK * 2), 500);

  const [annRows, ftsRows] = await Promise.all([
    table.search(qVec).limit(fetchK).toArray(),
    table.query().nearestToText(query).limit(fetchK).toArray(),
  ]);

  return rrfFuse(annRows, ftsRows, topK);
}
