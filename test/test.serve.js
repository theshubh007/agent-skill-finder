import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildCallToolHandler } from '../src/serve.js';
import { createServer } from '../src/serve.js';

const MANIFESTS = [
  {
    id: 'fetch-data',
    name: 'Fetch Data',
    description: 'Fetch data from a remote source',
    capability: { inputs: ['url:string'], outputs: ['data:object'] },
    source: { registry: 'antigravity', path: 'skills/fetch-data/SKILL.md' },
  },
  {
    id: 'parse-csv',
    name: 'Parse CSV',
    description: 'Parse CSV text into structured rows',
    capability: { inputs: ['csv:string'], outputs: ['rows:list[Row]'] },
    source: { registry: 'antigravity', path: 'skills/parse-csv/SKILL.md' },
  },
];

function makeRouter(manifests) {
  return {
    async find({ task, maxSkills = 5 }) {
      const slice = manifests.slice(0, maxSkills);
      const { SkillBundle } = await import('../src/bundle.js');
      const bundle = new SkillBundle(slice, {
        steps: slice.map((m, i) => ({ step: i + 1, skill: m.id })),
        plan: { deadlocks: [], ioWarnings: [] },
      });
      return { bundle, timings: { recall: 1, rerank: 1, graph: 1, hydrate: 1, total: 4 } };
    },
  };
}

describe('buildCallToolHandler', () => {
  test('list_tools returns all manifests as JSON text', async () => {
    const handler = buildCallToolHandler({ manifests: MANIFESTS, router: makeRouter(MANIFESTS) });
    const result = await handler({ params: { name: 'list_tools', arguments: {} } });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].id, 'fetch-data');
  });

  test('get_skill returns matching manifest', async () => {
    const handler = buildCallToolHandler({ manifests: MANIFESTS, router: makeRouter(MANIFESTS) });
    const result = await handler({ params: { name: 'get_skill', arguments: { skillId: 'parse-csv' } } });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.id, 'parse-csv');
  });

  test('get_skill unknown id returns isError true', async () => {
    const handler = buildCallToolHandler({ manifests: MANIFESTS, router: makeRouter(MANIFESTS) });
    const result = await handler({ params: { name: 'get_skill', arguments: { skillId: 'nonexistent' } } });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.error.includes('nonexistent'));
  });

  test('query_skills returns bundle with manifests and timings', async () => {
    const handler = buildCallToolHandler({ manifests: MANIFESTS, router: makeRouter(MANIFESTS) });
    const result = await handler({ params: { name: 'query_skills', arguments: { task: 'fetch and parse a CSV file' } } });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.manifests));
    assert.ok(typeof parsed.timings === 'object');
    assert.ok(parsed.timings.total > 0);
  });

  test('query_skills missing task returns isError true', async () => {
    const handler = buildCallToolHandler({ manifests: MANIFESTS, router: makeRouter(MANIFESTS) });
    const result = await handler({ params: { name: 'query_skills', arguments: {} } });
    assert.equal(result.isError, true);
  });

  test('unknown tool name returns isError true', async () => {
    const handler = buildCallToolHandler({ manifests: MANIFESTS, router: makeRouter(MANIFESTS) });
    const result = await handler({ params: { name: 'does_not_exist', arguments: {} } });
    assert.equal(result.isError, true);
  });
});

describe('createServer', () => {
  test('returns server and connect function', () => {
    const { server, connect } = createServer({ manifests: MANIFESTS });
    assert.ok(server !== null && typeof server === 'object');
    assert.ok(typeof connect === 'function');
  });
});
