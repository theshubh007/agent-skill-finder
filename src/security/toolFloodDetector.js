/**
 * ToolFlood defense — anomaly detection for bulk skill injection.
 *
 * A ToolFlood attack submits many skills with similar trigger patterns in a
 * single registry update to overwhelm routing and surface attacker-controlled
 * skills above legitimate ones. Detection criteria:
 *
 *   1. Batch size > bulkThreshold, AND
 *   2. ≥ similarityRatio of skills share the same dominant trigger pattern.
 *
 * Flagged skills are held for slop-gate review before entering the live index.
 */

import { extractTriggerPatterns } from './triggerAnalysis.js';

const DEFAULT_BULK_THRESHOLD  = 10;
const DEFAULT_SIMILARITY_RATIO = 0.7;

function dominantPattern(skill) {
  return extractTriggerPatterns(skill)[0] ?? null;
}

/**
 * Detect a ToolFlood signature in a batch of newly submitted skills.
 *
 * @param {object[]} newSkills  all skills from a single registry update
 * @param {{ bulkThreshold?: number, similarityRatio?: number }} [opts]
 * @returns {{
 *   flooded:       boolean,
 *   totalNewSkills: number,
 *   flagged: Array<{ pattern: string, count: number, ratio: number, skillIds: string[], risk: string }>,
 * }}
 */
export function detectToolFlood(newSkills, opts = {}) {
  const bulkThreshold  = opts.bulkThreshold  ?? DEFAULT_BULK_THRESHOLD;
  const similarityRatio = opts.similarityRatio ?? DEFAULT_SIMILARITY_RATIO;

  const groups = new Map();
  for (const skill of newSkills) {
    const pattern = dominantPattern(skill) ?? '__none__';
    if (!groups.has(pattern)) groups.set(pattern, []);
    groups.get(pattern).push(skill);
  }

  const flagged = [];
  for (const [pattern, skills] of groups) {
    if (pattern === '__none__') continue;
    const ratio = skills.length / newSkills.length;
    if (skills.length > bulkThreshold && ratio >= similarityRatio) {
      flagged.push({
        pattern,
        count:    skills.length,
        ratio:    Math.round(ratio * 100) / 100,
        skillIds: skills.map((s) => s.id),
        risk:     'HIGH',
      });
    }
  }

  return { flooded: flagged.length > 0, totalNewSkills: newSkills.length, flagged };
}

/**
 * Partition a batch into admitted and held queues.
 * Skills matching a ToolFlood signature are held for slop-gate review.
 *
 * @param {object[]} newSkills
 * @param {{ bulkThreshold?: number, similarityRatio?: number }} [opts]
 * @returns {{
 *   admitted: object[],
 *   held:     object[],
 *   flooded:  boolean,
 *   reason:   string|null,
 *   flagged?: object[],
 * }}
 */
export function rateLimitSkills(newSkills, opts = {}) {
  const { flooded, flagged } = detectToolFlood(newSkills, opts);

  if (!flooded) {
    return { admitted: newSkills, held: [], flooded: false, reason: null };
  }

  const heldIds = new Set(flagged.flatMap((f) => f.skillIds));
  return {
    admitted: newSkills.filter((s) => !heldIds.has(s.id)),
    held:     newSkills.filter((s) =>  heldIds.has(s.id)),
    flooded:  true,
    reason:   `ToolFlood: ${flagged.length} pattern group(s) exceeded bulk threshold`,
    flagged,
  };
}
