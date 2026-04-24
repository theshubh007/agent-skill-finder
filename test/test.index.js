import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildIndex, recall } from '../src/index.js';

// Five manifests with orthogonal 4-d embedding vectors
const MANIFESTS = [
  { id: 'parse-args',  name: 'Parse Arguments', description: 'Parse CLI arguments from argv array' },
  { id: 'web-search',  name: 'Web Search',       description: 'Search the internet for information' },
  { id: 'read-file',   name: 'Read File',         description: 'Read a file from disk' },
  { id: 'json-parse',  name: 'JSON Parser',       description: 'Parse JSON string into object' },
  { id: 'http-get',    name: 'HTTP GET',           description: 'Make HTTP GET request to a URL' },
];

const EMBED_VECS = [
  [1, 0, 0, 0],       // parse-args
  [0, 1, 0, 0],       // web-search
  [0, 0, 1, 0],       // read-file
  [0.9, 0.1, 0, 0],   // json-parse — close to parse-args
  [0, 0.9, 0.1, 0],   // http-get — close to web-search
];

// Assigns each text its fixed embedding by position in MANIFESTS
const buildEmbedFn = async (texts) => texts.map((_, i) => EMBED_VECS[i % EMBED_VECS.length]);

describe('buildIndex', () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'asf-build-')); });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test('returns count equal to manifests.length', async () => {
    const { count } = await buildIndex(MANIFESTS, { rootDir: dir, embedFn: buildEmbedFn });
    assert.equal(count, MANIFESTS.length);
  });

  test('creates skills.lance on disk', async () => {
    assert.ok(existsSync(join(dir, 'skills.lance')));
  });

  test('rebuilding overwrites existing table without error', async () => {
    const { count } = await buildIndex(MANIFESTS.slice(0, 2), { rootDir: dir, embedFn: buildEmbedFn });
    assert.equal(count, 2);
  });
});

describe('recall', () => {
  let dir;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'asf-recall-'));
    await buildIndex(MANIFESTS, { rootDir: dir, embedFn: buildEmbedFn });
  });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test('returns an array', async () => {
    const embedFn = async () => [[1, 0, 0, 0]];
    const result = await recall('parse arguments', 5, { rootDir: dir, embedFn });
    assert.ok(Array.isArray(result));
  });

  test('result count does not exceed topK', async () => {
    const embedFn = async () => [[0.5, 0.5, 0, 0]];
    const result = await recall('query', 2, { rootDir: dir, embedFn });
    assert.ok(result.length <= 2, `expected ≤2, got ${result.length}`);
  });

  test('topK=1 returns at most 1 item', async () => {
    const embedFn = async () => [[1, 0, 0, 0]];
    const result = await recall('parse', 1, { rootDir: dir, embedFn });
    assert.ok(result.length <= 1);
  });

  test('each result has id and description', async () => {
    const embedFn = async () => [[1, 0, 0, 0]];
    const result = await recall('any query', 5, { rootDir: dir, embedFn });
    for (const r of result) {
      assert.ok(typeof r.id === 'string', `missing id`);
      assert.ok(typeof r.description === 'string', `missing description`);
    }
  });

  test('ANN: query vector identical to parse-args returns parse-args', async () => {
    // [1,0,0,0] is parse-args' exact vector → distance=0 → must rank first by ANN
    const embedFn = async () => [[1, 0, 0, 0]];
    const result = await recall('parse args', 5, { rootDir: dir, embedFn });
    assert.ok(result.map(r => r.id).includes('parse-args'), `parse-args missing from ${result.map(r => r.id)}`);
  });

  test('ANN: query vector identical to web-search returns web-search', async () => {
    const embedFn = async () => [[0, 1, 0, 0]];
    const result = await recall('web search', 5, { rootDir: dir, embedFn });
    assert.ok(result.map(r => r.id).includes('web-search'), `web-search missing`);
  });

  test('FTS: "web search" query surfaces web-search skill', async () => {
    const embedFn = async () => [[0, 1, 0, 0]]; // ANN also favors web-search
    const result = await recall('web search', 5, { rootDir: dir, embedFn });
    assert.ok(result.map(r => r.id).includes('web-search'));
  });

  test('topK larger than dataset returns all items', async () => {
    const embedFn = async () => [[0.2, 0.2, 0.2, 0.2]];
    const result = await recall('query', 100, { rootDir: dir, embedFn });
    assert.equal(result.length, MANIFESTS.length);
  });

  test('RRF: result ids are a subset of indexed manifest ids', async () => {
    const embedFn = async () => [[0.5, 0.3, 0.1, 0.1]];
    const result = await recall('mixed query', 10, { rootDir: dir, embedFn });
    const validIds = new Set(MANIFESTS.map(m => m.id));
    for (const r of result) {
      assert.ok(validIds.has(r.id), `unexpected id ${r.id}`);
    }
  });
});
