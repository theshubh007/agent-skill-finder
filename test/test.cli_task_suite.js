import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runCliTaskSuite, loadCliTasks } from '../eval/cli_task_suite.js';

const FIXTURE_TASKS = [
  {
    id: 1,
    task: 'fetch stream then execute command',
    failure_mode: 'Composition Deadlock',
    category: 'streaming',
    required_skills: ['skill-a', 'skill-b'],
    composition_order: ['skill-a', 'skill-b'],
  },
  {
    id: 2,
    task: 'retrieve adversarial skill',
    failure_mode: 'ToolTweak',
    category: 'adversarial',
    required_skills: ['skill-c'],
    composition_order: ['skill-c'],
  },
];

function makeBaseline(returnFn) {
  return { name: 'test-baseline', rank: returnFn };
}

describe('runCliTaskSuite', () => {
  test('returns results for each task', async () => {
    const b = makeBaseline(async () => ['skill-a', 'skill-b', 'skill-c']);
    const { results } = await runCliTaskSuite(b, FIXTURE_TASKS);
    assert.equal(results.length, 2);
  });

  test('resolved true when all required_skills in ranked list', async () => {
    const b = makeBaseline(async () => ['skill-a', 'skill-b', 'skill-c']);
    const { results } = await runCliTaskSuite(b, FIXTURE_TASKS);
    assert.equal(results[0].resolved, true);
    assert.equal(results[1].resolved, true);
  });

  test('resolved false when required skill missing from ranked list', async () => {
    const b = makeBaseline(async () => ['skill-a']);
    const { results } = await runCliTaskSuite(b, FIXTURE_TASKS);
    assert.equal(results[0].resolved, false);
  });

  test('orderValid true when skills appear in composition order', async () => {
    const b = makeBaseline(async () => ['skill-a', 'skill-b', 'skill-c']);
    const { results } = await runCliTaskSuite(b, FIXTURE_TASKS);
    assert.equal(results[0].orderValid, true);
  });

  test('orderValid false when skills appear in wrong order', async () => {
    const b = makeBaseline(async () => ['skill-b', 'skill-a', 'skill-c']);
    const { results } = await runCliTaskSuite(b, FIXTURE_TASKS);
    assert.equal(results[0].orderValid, false);
  });

  test('summary.resolutionRate computed correctly', async () => {
    const b = makeBaseline(async () => ['skill-a', 'skill-b', 'skill-c']);
    const { summary } = await runCliTaskSuite(b, FIXTURE_TASKS);
    assert.equal(summary.resolutionRate, 1);
    assert.equal(summary.total, 2);
    assert.equal(summary.resolved, 2);
  });

  test('each result has latencyMs as number', async () => {
    const b = makeBaseline(async () => []);
    const { results } = await runCliTaskSuite(b, FIXTURE_TASKS);
    for (const r of results) assert.ok(typeof r.latencyMs === 'number');
  });

  test('empty task list returns empty results with zero rates', async () => {
    const b = makeBaseline(async () => []);
    const { results, summary } = await runCliTaskSuite(b, []);
    assert.deepEqual(results, []);
    assert.equal(summary.resolutionRate, 0);
  });
});

describe('loadCliTasks', () => {
  test('loads 5 tasks from disk', async () => {
    const tasks = await loadCliTasks();
    assert.equal(tasks.length, 5);
  });

  test('each task has id, task, failure_mode, required_skills, composition_order', async () => {
    const tasks = await loadCliTasks();
    for (const t of tasks) {
      assert.ok(typeof t.id === 'number');
      assert.ok(typeof t.task === 'string');
      assert.ok(typeof t.failure_mode === 'string');
      assert.ok(Array.isArray(t.required_skills));
      assert.ok(Array.isArray(t.composition_order));
    }
  });

  test('covers all 5 distinct failure modes', async () => {
    const tasks = await loadCliTasks();
    const modes = new Set(tasks.map((t) => t.failure_mode));
    assert.ok(modes.size === 5, `expected 5 failure modes, got ${modes.size}`);
  });
});
