import { SkillBundle } from '../../bundle.js';

/**
 * Convert SkillManifest[] → OpenAI ChatCompletionTool[] (tools parameter format).
 * Standalone adapter — no SkillBundle instance required at the call site.
 *
 * @param {object[]} manifests  SkillManifest objects
 * @returns {Array<{type: 'function', function: object}>}
 */
export function toOpenAI(manifests) {
  return new SkillBundle(manifests).toOpenAI();
}
