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
