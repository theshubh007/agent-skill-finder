import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildIndex, recall } from '../src/index.js';

const MANIFESTS = [
  { id: 'parse-args',  name: 'Parse Arguments', description: 'Parse CLI arguments from argv array' },
  { id: 'web-search',  name: 'Web Search',       description: 'Search the internet for information' },
  { id: 'read-file',   name: 'Read File',         description: 'Read a file from disk' },
  { id: 'json-parse',  name: 'JSON Parser',       description: 'Parse JSON string into object' },
  { id: 'http-get',    name: 'HTTP GET',           description: 'Make HTTP GET request to a URL' },
];

describe('buildIndex', () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'asf-build-')); });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test('returns count equal to manifests.length', async () => {
    const { count } = await buildIndex(MANIFESTS, { rootDir: dir });
    assert.equal(count, MANIFESTS.length);
  });

  test('rebuilding overwrites existing index without error', async () => {
    const { count } = await buildIndex(MANIFESTS.slice(0, 2), { rootDir: dir });
    assert.equal(count, 2);
  });
});

describe('recall', () => {
  let dir;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'asf-recall-'));
    await buildIndex(MANIFESTS, { rootDir: dir });
  });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test('returns an array', async () => {
    const result = await recall('parse arguments', 5, { rootDir: dir });
    assert.ok(Array.isArray(result));
  });

  test('result count does not exceed topK', async () => {
    const result = await recall('query', 2, { rootDir: dir });
    assert.ok(result.length <= 2, `expected ≤2, got ${result.length}`);
  });

  test('topK=1 returns at most 1 item', async () => {
    const result = await recall('parse', 1, { rootDir: dir });
    assert.ok(result.length <= 1);
  });

  test('each result has id and description', async () => {
    const result = await recall('any query', 5, { rootDir: dir });
    for (const r of result) {
      assert.ok(typeof r.id === 'string', `missing id`);
      assert.ok(typeof r.description === 'string', `missing description`);
    }
  });

  test('BM25: "parse CLI arguments" surfaces parse-args', async () => {
    const result = await recall('parse CLI arguments', 5, { rootDir: dir });
    assert.ok(result.map(r => r.id).includes('parse-args'), `parse-args missing from ${result.map(r => r.id)}`);
  });

  test('BM25: "search internet" surfaces web-search', async () => {
    const result = await recall('search internet', 5, { rootDir: dir });
    assert.ok(result.map(r => r.id).includes('web-search'), `web-search missing`);
  });

  test('BM25: "web search" surfaces web-search', async () => {
    const result = await recall('web search', 5, { rootDir: dir });
    assert.ok(result.map(r => r.id).includes('web-search'));
  });

  test('topK larger than dataset returns all items', async () => {
    const result = await recall('query', 100, { rootDir: dir });
    assert.equal(result.length, MANIFESTS.length);
  });

  test('result ids are a subset of indexed manifest ids', async () => {
    const result = await recall('mixed query', 10, { rootDir: dir });
    const validIds = new Set(MANIFESTS.map(m => m.id));
    for (const r of result) {
      assert.ok(validIds.has(r.id), `unexpected id ${r.id}`);
    }
  });
});
