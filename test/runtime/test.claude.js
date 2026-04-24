import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toAnthropic } from '../../src/runtime/adapters/claude.js';

const MANIFESTS = [
  {
    id: 'parse-args',
    name: 'Parse Arguments',
    description: 'Parse CLI arguments from argv array',
    capability: { inputs: ['argv:string'], outputs: ['args:object'] },
    source: { registry: 'antigravity', path: 'skills/parse-args/SKILL.md' },
  },
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the internet for information',
    capability: { inputs: ['query:string', 'limit:number'], outputs: ['results:list[Result]'] },
    source: { registry: 'awesome-claude', path: 'skills/web-search/SKILL.md' },
  },
  {
    id: 'json-parse',
    name: 'JSON Parser',
    description: 'Parse JSON string into object',
    capability: { inputs: ['text:string'], outputs: ['data:object'] },
    source: { registry: 'antigravity', path: 'skills/json-parse/SKILL.md' },
  },
];

describe('toAnthropic (claude runtime adapter)', () => {
  test('returns array of length equal to manifests', () => {
    assert.equal(toAnthropic(MANIFESTS).length, MANIFESTS.length);
  });

  test('each item has name, description, input_schema', () => {
    for (const tool of toAnthropic(MANIFESTS)) {
      assert.ok(typeof tool.name === 'string');
      assert.ok(typeof tool.description === 'string');
      assert.ok(typeof tool.input_schema === 'object');
    }
  });

  test('hyphens in id converted to underscores', () => {
    const tools = toAnthropic(MANIFESTS);
    assert.equal(tools[0].name, 'parse_args');
    assert.equal(tools[1].name, 'web_search');
  });

  test('input_schema.type is object', () => {
    for (const t of toAnthropic(MANIFESTS)) {
      assert.equal(t.input_schema.type, 'object');
    }
  });

  test('input_schema.properties keys match input names', () => {
    const ws = toAnthropic(MANIFESTS).find((t) => t.name === 'web_search');
    assert.ok('query' in ws.input_schema.properties);
    assert.ok('limit' in ws.input_schema.properties);
  });

  test('number IOType maps to JSON schema number', () => {
    const ws = toAnthropic(MANIFESTS).find((t) => t.name === 'web_search');
    assert.equal(ws.input_schema.properties.limit.type, 'number');
  });

  test('required array lists all input names', () => {
    const ws = toAnthropic(MANIFESTS).find((t) => t.name === 'web_search');
    assert.deepEqual(ws.input_schema.required.sort(), ['limit', 'query']);
  });

  test('empty manifests returns empty array', () => {
    assert.deepEqual(toAnthropic([]), []);
  });
});
