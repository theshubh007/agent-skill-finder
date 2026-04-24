import { SkillBundle } from '../../bundle.js';

/**
 * Convert SkillManifest[] → MCP Tool[] (inputSchema format).
 * Standalone adapter — no SkillBundle instance required at the call site.
 *
 * @param {object[]} manifests  SkillManifest objects
 * @returns {Array<{name: string, description: string, inputSchema: object}>}
 */
export function toMcp(manifests) {
  return new SkillBundle(manifests).toMcp();
}

/**
 * Write SKILL.md + scripts/ + references/ for each manifest to outputDir.
 * Standalone adapter — no SkillBundle instance required at the call site.
 *
 * @param {object[]} manifests  SkillManifest objects
 * @param {string} outputDir    root output directory
 */
export function toSkillMdDir(manifests, outputDir) {
  return new SkillBundle(manifests).toSkillMdDir(outputDir);
}
