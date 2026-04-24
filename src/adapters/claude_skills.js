import { readFile, readdir, access } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import yaml from 'js-yaml';
import { safeParseManifest } from '../manifest.js';

// agents: field values → compatibility flags
const AGENT_COMPAT = {
  'claude-code': 'claude_code',
  'codex-cli': 'codex',
  'gemini': 'gemini',
  'gemini-cli': 'gemini',
  'cursor': 'cursor',
  'openclaw': 'claude_code',
  'opencode': 'claude_code',
};

const CATEGORY_TO_CAPABILITY = {
  marketing: 'planning',
  leadership: 'planning',
  engineering: 'code-execution',
  'engineering-team': 'code-execution',
  documentation: 'report-writing',
  security: 'security',
  finance: 'data-transform',
  product: 'planning',
  'project-management': 'planning',
  'business-growth': 'planning',
  devops: 'devops',
  'qa-qm': 'security',
  orchestration: 'planning',
  bioinformatics: 'bioinformatics',
  visualization: 'visualization',
};

/**
 * Parse YAML frontmatter block.
 * @param {string} content
 * @returns {Record<string, unknown>}
 */
function parseFrontmatter(content) {
  const sanitized = content.replace(/^﻿/, '');
  const lines = sanitized.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return {};
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return {};
  try {
    return yaml.load(lines.slice(1, end).join('\n')) ?? {};
  } catch {
    return {};
  }
}

/**
 * Recursively find all SKILL.md files under a root, returning their paths.
 * Skips hidden dirs and node_modules.
 * @param {string} root
 * @param {number} maxDepth
 * @returns {Promise<string[]>}
 */
async function findSkillMds(root, maxDepth = 4) {
  const results = [];
  async function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.name === 'SKILL.md') {
        results.push(full);
      }
    }
  }
  await walk(root, 0);
  return results;
}

/**
 * Derive capability type from category string or directory path.
 * @param {string} category
 * @param {string} relPath
 */
function inferCapability(category, relPath) {
  if (category && CATEGORY_TO_CAPABILITY[category]) return CATEGORY_TO_CAPABILITY[category];
  const parts = relPath.toLowerCase().split('/');
  for (const part of parts) {
    if (CATEGORY_TO_CAPABILITY[part]) return CATEGORY_TO_CAPABILITY[part];
  }
  return 'planning';
}

/**
 * Map agents[] array from frontmatter to compatibility object.
 * @param {unknown} agents
 */
function parseCompatibility(agents) {
  const compat = { claude_code: false, gemini: false, codex: false, cursor: false, mcp: true };
  if (!Array.isArray(agents)) {
    // no agents field → assume claude-code native
    compat.claude_code = true;
    return compat;
  }
  for (const agent of agents) {
    const key = AGENT_COMPAT[String(agent).toLowerCase()];
    if (key) compat[key] = true;
  }
  return compat;
}

/**
 * Load skills from claude-skills registry.
 * Walks all SKILL.md files at depth ≥ 2 (individual skills, not plugin descriptors).
 * @param {string} registryRoot  absolute path to claude-skills repo
 * @returns {Promise<import('../manifest.js').SkillManifest[]>}
 */
export async function loadClaudeSkills(registryRoot) {
  const skillMdPaths = await findSkillMds(registryRoot, 3);
  const manifests = [];

  for (const skillMdPath of skillMdPaths) {
    const relPath = relative(registryRoot, skillMdPath);
    const depth = relPath.split('/').length - 1; // SKILL.md is a file, so depth = dirs

    // depth 0 = registry root SKILL.md (skip — none exists)
    // depth 1 = plugin root descriptor (e.g. marketing-skill/SKILL.md) — skip
    // depth 2+ = individual skills
    if (depth < 2) continue;

    let mdContent;
    try { mdContent = await readFile(skillMdPath, 'utf8'); } catch { continue; }

    const fm = parseFrontmatter(mdContent);
    const name = String(fm.name ?? '');
    if (!name) continue;

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) continue;

    const description = String(fm.description ?? '');
    if (!description) continue;

    const category = String(fm.metadata?.category ?? dirname(relPath).split('/')[0] ?? '');
    const capabilityType = inferCapability(category, relPath);
    const compatibility = parseCompatibility(fm.agents ?? null);

    const raw_manifest = {
      id,
      name,
      version: String(fm.metadata?.version ?? fm.version ?? '1.0.0'),
      description,
      capability: { type: capabilityType, inputs: [], outputs: [] },
      graph: { depends_on: [], complements: [], co_used_with: [] },
      compatibility,
      risk: 'safe',
      source: {
        registry: 'claude-skills',
        path: dirname(relPath),
      },
      quality: { slop_score: 1, description_uniqueness: 1, is_duplicate: false },
    };

    const result = safeParseManifest(raw_manifest);
    if (result.success) manifests.push(result.data);
  }

  return manifests;
}
