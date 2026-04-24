import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { safeParseManifest } from '../manifest.js';

const CATEGORY_TO_CAPABILITY = {
  security: 'security',
  devops: 'devops',
  database: 'database',
  visualization: 'visualization',
  bioinformatics: 'bioinformatics',
  'data-science': 'data-transform',
  'data-analysis': 'data-transform',
  data: 'data-transform',
  'file-management': 'file-io',
  'file-io': 'file-io',
  'web-search': 'web-search',
  web: 'web-search',
  'code-execution': 'code-execution',
  'game-development': 'code-execution',
  programming: 'code-execution',
  'report-writing': 'report-writing',
  documentation: 'report-writing',
  communication: 'communication',
  'ml-inference': 'ml-inference',
  ml: 'ml-inference',
  ai: 'ml-inference',
  'ai-agents': 'ml-inference',
  planning: 'planning',
  architecture: 'planning',
};

const RISK_MAP = {
  safe: 'safe',
  network: 'network',
  exec: 'exec',
  critical: 'critical',
  unsafe: 'unsafe',
  // antigravity-specific tiers
  none: 'safe',
  unknown: 'safe',
  'fs-write': 'exec',
  destructive: 'critical',
};

/**
 * Extract YAML frontmatter from SKILL.md content.
 * @param {string} content
 * @returns {Record<string, unknown>}
 */
function parseFrontmatter(content) {
  const sanitized = content.replace(/^﻿/, '');
  const lines = sanitized.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return {};

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIndex = i; break; }
  }
  if (endIndex === -1) return {};

  const block = lines.slice(1, endIndex).join('\n');
  try {
    return yaml.load(block) ?? {};
  } catch {
    return {};
  }
}

/**
 * Build a Set<skillId> → { claude, codex } compatibility from plugin-compatibility.json.
 * @param {string} registryRoot
 * @returns {Promise<Map<string, {claude: boolean, codex: boolean}>>}
 */
async function loadCompatMap(registryRoot) {
  const compatPath = join(registryRoot, 'data', 'plugin-compatibility.json');
  try {
    const raw = await readFile(compatPath, 'utf8');
    const { skills } = JSON.parse(raw);
    const map = new Map();
    for (const s of skills) {
      map.set(s.id, {
        claude: s.targets?.claude === 'supported',
        codex: s.targets?.codex === 'supported',
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Load all skills from the antigravity-awesome-skills registry.
 * @param {string} registryRoot  absolute path to antigravity-awesome-skills repo
 * @returns {Promise<import('../manifest.js').SkillManifest[]>}
 */
export async function loadAntigravitySkills(registryRoot) {
  const indexPath = join(registryRoot, 'data', 'skills_index.json');
  const raw = await readFile(indexPath, 'utf8');
  const entries = JSON.parse(raw);

  const compatMap = await loadCompatMap(registryRoot);
  const manifests = [];

  for (const entry of entries) {
    const skillMdPath = join(registryRoot, entry.path, 'SKILL.md');

    try {
      await access(skillMdPath);
    } catch {
      continue;
    }

    const mdContent = await readFile(skillMdPath, 'utf8');
    const fm = parseFrontmatter(mdContent);

    const capabilityType = CATEGORY_TO_CAPABILITY[entry.category] ?? 'retrieval';
    const rawRisk = fm.risk ?? entry.risk ?? 'safe';
    const risk = RISK_MAP[String(rawRisk).toLowerCase()] ?? 'safe';

    const compat = compatMap.get(entry.id) ?? { claude: true, codex: false };

    const raw_manifest = {
      id: entry.id,
      name: entry.name ?? entry.id,
      version: '1.0.0',
      description: entry.description ?? String(fm.description ?? ''),
      capability: {
        type: capabilityType,
        inputs: [],
        outputs: [],
      },
      graph: {
        depends_on: [],
        complements: [],
        co_used_with: [],
      },
      compatibility: {
        claude_code: compat.claude,
        gemini: false,
        codex: compat.codex,
        cursor: false,
        mcp: true,
      },
      risk,
      source: {
        registry: 'antigravity-awesome-skills',
        path: entry.path,
      },
      quality: {
        slop_score: 1,
        description_uniqueness: 1,
        is_duplicate: false,
      },
    };

    const result = safeParseManifest(raw_manifest);
    if (result.success) {
      manifests.push(result.data);
    }
  }

  return manifests;
}
