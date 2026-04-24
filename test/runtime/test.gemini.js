import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toGemini } from '../../src/runtime/adapters/gemini.js';

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

describe('toGemini (gemini runtime adapter)', () => {
  test('returns array of length 1 (single Tool wrapper)', () => {
    assert.equal(toGemini(MANIFESTS).length, 1);
  });

  test('result[0] has functionDeclarations array', () => {
    const result = toGemini(MANIFESTS);
    assert.ok(Array.isArray(result[0].functionDeclarations));
  });

  test('functionDeclarations length equals manifests length', () => {
    assert.equal(toGemini(MANIFESTS)[0].functionDeclarations.length, MANIFESTS.length);
  });

  test('each declaration has name, description, parameters', () => {
    for (const decl of toGemini(MANIFESTS)[0].functionDeclarations) {
      assert.ok(typeof decl.name === 'string');
      assert.ok(typeof decl.description === 'string');
      assert.ok(typeof decl.parameters === 'object');
    }
  });

  test('hyphens in id converted to underscores', () => {
    const decls = toGemini(MANIFESTS)[0].functionDeclarations;
    assert.equal(decls[0].name, 'parse_args');
    assert.equal(decls[1].name, 'web_search');
  });

  test('parameters.type is OBJECT (uppercase Gemini convention)', () => {
    for (const decl of toGemini(MANIFESTS)[0].functionDeclarations) {
      assert.equal(decl.parameters.type, 'OBJECT');
    }
  });

  test('parameters.properties keys match input names', () => {
    const ws = toGemini(MANIFESTS)[0].functionDeclarations.find((d) => d.name === 'web_search');
    assert.ok('query' in ws.parameters.properties);
    assert.ok('limit' in ws.parameters.properties);
  });

  test('number IOType maps to NUMBER (uppercase)', () => {
    const ws = toGemini(MANIFESTS)[0].functionDeclarations.find((d) => d.name === 'web_search');
    assert.equal(ws.parameters.properties.limit.type, 'NUMBER');
  });

  test('required array lists all input names', () => {
    const ws = toGemini(MANIFESTS)[0].functionDeclarations.find((d) => d.name === 'web_search');
    assert.deepEqual(ws.parameters.required.sort(), ['limit', 'query']);
  });

  test('empty manifests returns single wrapper with empty functionDeclarations', () => {
    const result = toGemini([]);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].functionDeclarations, []);
  });
});
