import { SkillBundle } from '../../bundle.js';

/**
 * Convert SkillManifest[] → Claude API ToolParam[] (tool_use input_schema format).
 * Standalone adapter — no SkillBundle instance required at the call site.
 *
 * @param {object[]} manifests  SkillManifest objects
 * @returns {Array<{name: string, description: string, input_schema: object}>}
 */
export function toAnthropic(manifests) {
  return new SkillBundle(manifests).toAnthropic();
}
