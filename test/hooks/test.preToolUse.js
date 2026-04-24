import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runPreToolUse } from '../../src/hooks/preToolUse.js';
import { runPostToolUse } from '../../src/hooks/postToolUse.js';
import { SkillBundle } from '../../src/bundle.js';

const SKILL_A = {
  id: 'web-search',
  name: 'Web Search',
  description: 'Search the internet',
  capability: { inputs: ['query:string'], outputs: ['results:list[Result]'] },
};

function makeRouter(manifests, fail = false) {
  return {
    async find({ task, maxSkills = 5 }) {
      if (fail) throw new Error('router unavailable');
      const slice = manifests.slice(0, maxSkills);
      const bundle = new SkillBundle(slice, {
        steps: slice.map((m, i) => ({ step: i + 1, skill: m.id })),
        plan: { deadlocks: [], ioWarnings: [] },
      });
      return { bundle, timings: { total: 2 } };
    },
  };
}

describe('runPreToolUse', () => {
  test('returns decision allow when routing succeeds', async () => {
    const result = await runPreToolUse({
      toolName: 'web_search',
      input: { query: 'climate data' },
      router: makeRouter([SKILL_A]),
    });
    assert.equal(result.decision, 'allow');
  });

  test('bundle contains routed manifests on success', async () => {
    const result = await runPreToolUse({
      toolName: 'web_search',
      input: { query: 'climate data' },
      router: makeRouter([SKILL_A]),
    });
    assert.ok(result.bundle !== null);
    assert.equal(result.bundle.manifests.length, 1);
    assert.equal(result.bundle.manifests[0].id, 'web-search');
  });

  test('uses input.description as task when present', async () => {
    let capturedTask;
    const spyRouter = {
      async find({ task }) {
        capturedTask = task;
        const bundle = new SkillBundle([SKILL_A]);
        return { bundle, timings: { total: 1 } };
      },
    };
    await runPreToolUse({
      toolName: 'Bash',
      input: { description: 'search for latest papers' },
      router: spyRouter,
    });
    assert.equal(capturedTask, 'search for latest papers');
  });

  test('falls back to toolName as task when no description or task in input', async () => {
    let capturedTask;
    const spyRouter = {
      async find({ task }) {
        capturedTask = task;
        const bundle = new SkillBundle([SKILL_A]);
        return { bundle, timings: { total: 1 } };
      },
    };
    await runPreToolUse({
      toolName: 'Read',
      input: {},
      router: spyRouter,
    });
    assert.equal(capturedTask, 'Read');
  });

  test('returns decision allow even when router throws', async () => {
    const result = await runPreToolUse({
      toolName: 'web_search',
      input: {},
      router: makeRouter([], true),
    });
    assert.equal(result.decision, 'allow');
    assert.ok(result.reason.includes('router unavailable'));
  });

  test('empty toolName returns allow with null bundle', async () => {
    const result = await runPreToolUse({
      toolName: '',
      input: {},
      router: makeRouter([SKILL_A]),
    });
    assert.equal(result.decision, 'allow');
    assert.equal(result.bundle, null);
  });
});

describe('runPostToolUse', () => {
  test('appends entry to store', async () => {
    const entries = [];
    const store = { async append(e) { entries.push(e); } };
    await runPostToolUse({ toolName: 'web_search', input: { query: 'x' }, output: { results: [] }, store });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].toolName, 'web_search');
  });

  test('entry has timestamp and success fields', async () => {
    const entries = [];
    const store = { async append(e) { entries.push(e); } };
    await runPostToolUse({ toolName: 'Read', input: {}, output: {}, store });
    assert.ok(typeof entries[0].timestamp === 'number');
    assert.ok(typeof entries[0].success === 'boolean');
  });

  test('success is false when output has isError true', async () => {
    const entries = [];
    const store = { async append(e) { entries.push(e); } };
    await runPostToolUse({ toolName: 'Bash', input: {}, output: { isError: true }, store });
    assert.equal(entries[0].success, false);
  });

  test('returns logged true', async () => {
    const store = { async append() {} };
    const result = await runPostToolUse({ toolName: 'x', input: {}, output: {}, store });
    assert.equal(result.logged, true);
  });
});
