import { SkillBundle } from '../../bundle.js';

/**
 * Convert SkillManifest[] → Gemini API Tool[] (functionDeclarations format).
 * Standalone adapter — no SkillBundle instance required at the call site.
 *
 * @param {object[]} manifests  SkillManifest objects
 * @returns {[{functionDeclarations: object[]}]}
 */
export function toGemini(manifests) {
  return new SkillBundle(manifests).toGemini();
}

/**
 * Convert SkillManifest[] → gemini-cli ActivateSkillToolInput[] pre-filter format.
 * ASF acts as the pre-filter layer feeding ranked candidates into gemini-cli's existing
 * ActivateSkillTool without replacing it.
 *
 * @param {object[]} manifests  SkillManifest objects (ranked, highest-relevance first)
 * @returns {Array<{skillId: string, registry: string}>}
 */
export function toGeminiActivateTool(manifests) {
  return new SkillBundle(manifests).toGeminiActivateTool();
}
