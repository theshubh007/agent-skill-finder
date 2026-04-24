import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillBundle } from '../src/bundle.js';

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

const bundle = new SkillBundle(MANIFESTS);

describe('SkillBundle.toAnthropic', () => {
  test('returns array of length equal to manifests', () => {
    assert.equal(bundle.toAnthropic().length, MANIFESTS.length);
  });

  test('each item has name, description, input_schema', () => {
    for (const tool of bundle.toAnthropic()) {
      assert.ok(typeof tool.name === 'string');
      assert.ok(typeof tool.description === 'string');
      assert.ok(typeof tool.input_schema === 'object');
    }
  });

  test('hyphens in id converted to underscores', () => {
    const tools = bundle.toAnthropic();
    assert.equal(tools[0].name, 'parse_args');
    assert.equal(tools[1].name, 'web_search');
  });

  test('input_schema type is object', () => {
    for (const t of bundle.toAnthropic()) {
      assert.equal(t.input_schema.type, 'object');
    }
  });

  test('input_schema.properties keys match input names', () => {
    const ws = bundle.toAnthropic().find((t) => t.name === 'web_search');
    assert.ok('query' in ws.input_schema.properties);
    assert.ok('limit' in ws.input_schema.properties);
  });

  test('number IOType maps to JSON schema number', () => {
    const ws = bundle.toAnthropic().find((t) => t.name === 'web_search');
    assert.equal(ws.input_schema.properties.limit.type, 'number');
  });

  test('required array lists all input names', () => {
    const ws = bundle.toAnthropic().find((t) => t.name === 'web_search');
    assert.deepEqual(ws.input_schema.required.sort(), ['limit', 'query']);
  });
});

describe('SkillBundle.toOpenAI', () => {
  test('each item has type="function"', () => {
    for (const tool of bundle.toOpenAI()) {
      assert.equal(tool.type, 'function');
    }
  });

  test('function.name uses underscore form', () => {
    assert.equal(bundle.toOpenAI()[0].function.name, 'parse_args');
  });

  test('function.parameters.type is object', () => {
    for (const t of bundle.toOpenAI()) {
      assert.equal(t.function.parameters.type, 'object');
    }
  });

  test('function.description is populated', () => {
    for (const t of bundle.toOpenAI()) {
      assert.ok(t.function.description.length > 0);
    }
  });
});

describe('SkillBundle.toGemini', () => {
  test('returns array of length 1 (one Tool with all declarations)', () => {
    assert.equal(bundle.toGemini().length, 1);
  });

  test('functionDeclarations has one entry per manifest', () => {
    const [tool] = bundle.toGemini();
    assert.equal(tool.functionDeclarations.length, MANIFESTS.length);
  });

  test('parameters.type is OBJECT (Gemini uppercase convention)', () => {
    const [tool] = bundle.toGemini();
    for (const fn of tool.functionDeclarations) {
      assert.equal(fn.parameters.type, 'OBJECT');
    }
  });

  test('property types are uppercase', () => {
    const [tool] = bundle.toGemini();
    const ws = tool.functionDeclarations.find((f) => f.name === 'web_search');
    assert.equal(ws.parameters.properties.query.type, 'STRING');
    assert.equal(ws.parameters.properties.limit.type, 'NUMBER');
  });
});

describe('SkillBundle.toGeminiActivateTool', () => {
  test('returns array of length equal to manifests', () => {
    assert.equal(bundle.toGeminiActivateTool().length, MANIFESTS.length);
  });

  test('each item has skillId and registry', () => {
    for (const item of bundle.toGeminiActivateTool()) {
      assert.ok(typeof item.skillId === 'string');
      assert.ok(typeof item.registry === 'string');
    }
  });

  test('skillId preserves original id with hyphens', () => {
    const items = bundle.toGeminiActivateTool();
    assert.equal(items[0].skillId, 'parse-args');
    assert.equal(items[1].skillId, 'web-search');
  });

  test('registry sourced from manifest.source.registry', () => {
    const items = bundle.toGeminiActivateTool();
    assert.equal(items[0].registry, 'antigravity');
    assert.equal(items[1].registry, 'awesome-claude');
  });
});

describe('SkillBundle.toMcp', () => {
  test('returns array of length equal to manifests', () => {
    assert.equal(bundle.toMcp().length, MANIFESTS.length);
  });

  test('each item has name, description, inputSchema', () => {
    for (const tool of bundle.toMcp()) {
      assert.ok(typeof tool.name === 'string');
      assert.ok(typeof tool.description === 'string');
      assert.ok(tool.inputSchema);
    }
  });

  test('name preserves hyphens (MCP allows hyphens)', () => {
    const tools = bundle.toMcp();
    assert.equal(tools[0].name, 'parse-args');
  });

  test('inputSchema.type is object', () => {
    for (const t of bundle.toMcp()) {
      assert.equal(t.inputSchema.type, 'object');
    }
  });
});

describe('SkillBundle.toSkillMdDir', () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'asf-bundle-')); });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test('creates a subdirectory per skill', async () => {
    await bundle.toSkillMdDir(dir);
    for (const m of MANIFESTS) {
      assert.ok(existsSync(join(dir, m.id)), `dir missing for ${m.id}`);
    }
  });

  test('each skill directory contains SKILL.md', async () => {
    for (const m of MANIFESTS) {
      assert.ok(existsSync(join(dir, m.id, 'SKILL.md')), `SKILL.md missing for ${m.id}`);
    }
  });

  test('SKILL.md contains YAML frontmatter with id', async () => {
    const content = readFileSync(join(dir, 'parse-args', 'SKILL.md'), 'utf8');
    assert.ok(content.startsWith('---'), 'should start with ---');
    assert.ok(content.includes('parse-args'), 'should contain skill id');
  });

  test('creates scripts/ directory per skill', async () => {
    for (const m of MANIFESTS) {
      assert.ok(existsSync(join(dir, m.id, 'scripts')));
    }
  });

  test('creates references/ directory per skill', async () => {
    for (const m of MANIFESTS) {
      assert.ok(existsSync(join(dir, m.id, 'references')));
    }
  });
});

describe('SkillBundle — empty bundle', () => {
  const empty = new SkillBundle([]);

  test('toAnthropic returns []', () => assert.deepEqual(empty.toAnthropic(), []));
  test('toOpenAI returns []',    () => assert.deepEqual(empty.toOpenAI(), []));
  test('toGemini returns [{functionDeclarations:[]}]', () => {
    assert.equal(empty.toGemini()[0].functionDeclarations.length, 0);
  });
  test('toMcp returns []',       () => assert.deepEqual(empty.toMcp(), []));
});
