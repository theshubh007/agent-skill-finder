/**
 * Scheduled LTR retrain runner.
 *
 * Runs a retrain cycle on a cadence (default: weekly) and persists
 * the resulting delta map to a JSON file so the router can load it
 * at startup without re-reading the full telemetry log.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { retrain } from './ltr.js';

const DEFAULT_CADENCE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Persist a delta map to disk as JSON.
 *
 * @param {Map<string, number>} deltas
 * @param {string} outputPath
 */
export async function saveDeltas(deltas, outputPath) {
  const obj = Object.fromEntries(deltas);
  await writeFile(outputPath, JSON.stringify(obj, null, 2), 'utf8');
}

/**
 * Load a previously persisted delta map from disk.
 *
 * @param {string} inputPath
 * @returns {Promise<Map<string, number>>}
 */
export async function loadDeltas(inputPath) {
  try {
    const raw = await readFile(inputPath, 'utf8');
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
}

/**
 * Run one retrain cycle: pull rates, compute deltas, save to disk.
 *
 * @param {import('../telemetry.js').TelemetryStore} store
 * @param {string} outputPath  path to write delta JSON
 * @returns {Promise<{ deltas: Map<string,number>, savedAt: string }>}
 */
export async function runRetrain(store, outputPath) {
  const deltas  = await retrain(store);
  await saveDeltas(deltas, outputPath);
  return { deltas, savedAt: new Date().toISOString() };
}

/**
 * Start a recurring retrain loop. Returns a handle with a `stop()` method.
 *
 * @param {import('../telemetry.js').TelemetryStore} store
 * @param {string} outputPath
 * @param {{ cadenceMs?: number, onComplete?: Function }} [opts]
 * @returns {{ stop: () => void }}
 */
export function startRetrainScheduler(store, outputPath, opts = {}) {
  const cadenceMs  = opts.cadenceMs  ?? DEFAULT_CADENCE_MS;
  const onComplete = opts.onComplete ?? (() => {});

  const tick = async () => {
    try {
      const result = await runRetrain(store, outputPath);
      onComplete(null, result);
    } catch (err) {
      onComplete(err, null);
    }
  };

  const intervalId = setInterval(tick, cadenceMs);
  return {
    stop() { clearInterval(intervalId); },
  };
}
