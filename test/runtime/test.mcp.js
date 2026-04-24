import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { toMcp, toSkillMdDir } from '../../src/runtime/adapters/mcp.js';

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

describe('toMcp (mcp runtime adapter)', () => {
  test('returns array of length equal to manifests', () => {
    assert.equal(toMcp(MANIFESTS).length, MANIFESTS.length);
  });

  test('each item has name, description, inputSchema', () => {
    for (const tool of toMcp(MANIFESTS)) {
      assert.ok(typeof tool.name === 'string');
      assert.ok(typeof tool.description === 'string');
      assert.ok(typeof tool.inputSchema === 'object');
    }
  });

  test('name equals id (hyphens preserved — MCP uses original id)', () => {
    const tools = toMcp(MANIFESTS);
    assert.equal(tools[0].name, 'parse-args');
    assert.equal(tools[1].name, 'web-search');
  });

  test('inputSchema.type is object', () => {
    for (const tool of toMcp(MANIFESTS)) {
      assert.equal(tool.inputSchema.type, 'object');
    }
  });

  test('inputSchema.properties keys match input names', () => {
    const ws = toMcp(MANIFESTS).find((t) => t.name === 'web-search');
    assert.ok('query' in ws.inputSchema.properties);
    assert.ok('limit' in ws.inputSchema.properties);
  });

  test('number IOType maps to JSON schema number', () => {
    const ws = toMcp(MANIFESTS).find((t) => t.name === 'web-search');
    assert.equal(ws.inputSchema.properties.limit.type, 'number');
  });

  test('MCP tools use inputSchema (camelCase) not input_schema', () => {
    for (const tool of toMcp(MANIFESTS)) {
      assert.ok('inputSchema' in tool);
      assert.ok(!('input_schema' in tool));
    }
  });

  test('empty manifests returns empty array', () => {
    assert.deepEqual(toMcp([]), []);
  });
});

describe('toSkillMdDir (skill file writer)', () => {
  let dir;

  test('writes SKILL.md for each manifest', async () => {
    dir = mkdtempSync(join(tmpdir(), 'asf-mcp-test-'));
    await toSkillMdDir(MANIFESTS, dir);
    for (const m of MANIFESTS) {
      assert.ok(existsSync(join(dir, m.id, 'SKILL.md')), `SKILL.md missing for ${m.id}`);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('creates scripts/ subdirectory for each manifest', async () => {
    dir = mkdtempSync(join(tmpdir(), 'asf-mcp-test-'));
    await toSkillMdDir(MANIFESTS, dir);
    for (const m of MANIFESTS) {
      assert.ok(existsSync(join(dir, m.id, 'scripts')), `scripts/ missing for ${m.id}`);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('empty manifests writes nothing, returns without error', async () => {
    dir = mkdtempSync(join(tmpdir(), 'asf-mcp-test-'));
    await assert.doesNotReject(() => toSkillMdDir([], dir));
    rmSync(dir, { recursive: true, force: true });
  });
});
