import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toOpenAI } from '../../src/runtime/adapters/openai.js';

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

describe('toOpenAI (openai runtime adapter)', () => {
  test('returns array of length equal to manifests', () => {
    assert.equal(toOpenAI(MANIFESTS).length, MANIFESTS.length);
  });

  test('each item has type function and function object', () => {
    for (const tool of toOpenAI(MANIFESTS)) {
      assert.equal(tool.type, 'function');
      assert.ok(typeof tool.function === 'object');
    }
  });

  test('function object has name, description, parameters', () => {
    for (const tool of toOpenAI(MANIFESTS)) {
      assert.ok(typeof tool.function.name === 'string');
      assert.ok(typeof tool.function.description === 'string');
      assert.ok(typeof tool.function.parameters === 'object');
    }
  });

  test('hyphens in id converted to underscores', () => {
    const tools = toOpenAI(MANIFESTS);
    assert.equal(tools[0].function.name, 'parse_args');
    assert.equal(tools[1].function.name, 'web_search');
  });

  test('parameters.type is object', () => {
    for (const tool of toOpenAI(MANIFESTS)) {
      assert.equal(tool.function.parameters.type, 'object');
    }
  });

  test('parameters.properties keys match input names', () => {
    const ws = toOpenAI(MANIFESTS).find((t) => t.function.name === 'web_search');
    assert.ok('query' in ws.function.parameters.properties);
    assert.ok('limit' in ws.function.parameters.properties);
  });

  test('number IOType maps to JSON schema number', () => {
    const ws = toOpenAI(MANIFESTS).find((t) => t.function.name === 'web_search');
    assert.equal(ws.function.parameters.properties.limit.type, 'number');
  });

  test('required array lists all input names', () => {
    const ws = toOpenAI(MANIFESTS).find((t) => t.function.name === 'web_search');
    assert.deepEqual(ws.function.parameters.required.sort(), ['limit', 'query']);
  });

  test('empty manifests returns empty array', () => {
    assert.deepEqual(toOpenAI([]), []);
  });
});
