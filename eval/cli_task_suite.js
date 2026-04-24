import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASKS_PATH = join(__dirname, 'data', 'cli_tasks.json');

/**
 * Load the 5 CLI-grounded task definitions.
 *
 * @param {string} [tasksPath]  override path to cli_tasks.json
 * @returns {Promise<object[]>}
 */
export async function loadCliTasks(tasksPath = DEFAULT_TASKS_PATH) {
  const raw = await readFile(tasksPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Run the CLI Task Suite against a baseline and return per-task results.
 *
 * For each task, the baseline's rank() is called. A task is considered
 * "resolved" if all required_skills appear in the returned ranked list.
 * "Composition order" is validated by checking that required_skills appear
 * in the same relative order as `composition_order` in the ranked list.
 *
 * @param {{ name: string, rank: (query: string) => Promise<string[]> }} baseline
 * @param {object[]} [tasks]  override task list (default: load from disk)
 * @returns {Promise<{ results: object[], summary: object }>}
 */
export async function runCliTaskSuite(baseline, tasks = null) {
  const taskList = tasks ?? await loadCliTasks();
  const results = [];

  for (const task of taskList) {
    const t0 = Date.now();
    const ranked = await baseline.rank(task.task);
    const latencyMs = Date.now() - t0;

    const rankedSet = new Set(ranked);
    const resolved = task.required_skills.every((s) => rankedSet.has(s));

    // Check composition order: required_skills should appear in composition_order sequence
    const positions = task.composition_order.map((s) => ranked.indexOf(s));
    const orderValid = positions.every((p) => p !== -1) &&
      positions.every((p, i) => i === 0 || p > positions[i - 1]);

    results.push({
      id: task.id,
      task: task.task,
      failure_mode: task.failure_mode,
      category: task.category,
      resolved,
      orderValid,
      latencyMs,
      ranked: ranked.slice(0, 10),
    });
  }

  const resolved = results.filter((r) => r.resolved).length;
  const orderCorrect = results.filter((r) => r.orderValid).length;

  return {
    results,
    summary: {
      baseline: baseline.name,
      total: results.length,
      resolved,
      orderCorrect,
      resolutionRate: results.length > 0 ? resolved / results.length : 0,
      orderRate: results.length > 0 ? orderCorrect / results.length : 0,
    },
  };
}
