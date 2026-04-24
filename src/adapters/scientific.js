import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import { safeParseManifest } from '../manifest.js';

const SKILLS_DIR = 'scientific-skills';

// scientific skill name keywords → capability type
const NAME_TO_CAPABILITY = {
  plot: 'visualization',
  chart: 'visualization',
  visual: 'visualization',
  figure: 'visualization',
  graph: 'visualization',
  report: 'report-writing',
  notebook: 'report-writing',
  fetch: 'retrieval',
  search: 'retrieval',
  lookup: 'retrieval',
  query: 'retrieval',
  pubmed: 'retrieval',
  entrez: 'retrieval',
  database: 'database',
  sql: 'database',
  ml: 'ml-inference',
  model: 'ml-inference',
  predict: 'ml-inference',
  train: 'ml-inference',
  torch: 'ml-inference',
  tensorflow: 'ml-inference',
};

/**
 * Infer capability type from skill name and description.
 * Defaults to bioinformatics for scientific skills.
 * @param {string} name
 * @param {string} description
 */
function inferCapability(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  for (const [keyword, cap] of Object.entries(NAME_TO_CAPABILITY)) {
    if (text.includes(keyword)) return cap;
  }
  return 'bioinformatics';
}

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
 * Load skills from scientific-agent-skills registry.
 * @param {string} registryRoot  absolute path to scientific-agent-skills repo
 * @returns {Promise<import('../manifest.js').SkillManifest[]>}
 */
export async function loadScientificSkills(registryRoot) {
  const skillsRoot = join(registryRoot, SKILLS_DIR);
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const manifests = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const skillMdPath = join(skillsRoot, entry.name, 'SKILL.md');
    let mdContent;
    try { mdContent = await readFile(skillMdPath, 'utf8'); } catch { continue; }

    const fm = parseFrontmatter(mdContent);
    const name = String(fm.name ?? entry.name);
    const description = String(fm.description ?? '');
    if (!description || description.length < 10) continue;

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) continue;

    const capabilityType = inferCapability(name, description);

    const raw_manifest = {
      id,
      name,
      version: '1.0.0',
      description,
      capability: { type: capabilityType, inputs: [], outputs: [] },
      graph: { depends_on: [], complements: [], co_used_with: [] },
      compatibility: {
        claude_code: true,
        gemini: false,
        codex: false,
        cursor: false,
        mcp: true,
      },
      risk: 'safe',
      source: {
        registry: 'scientific-agent-skills',
        path: join(SKILLS_DIR, entry.name),
      },
      quality: { slop_score: 1, description_uniqueness: 1, is_duplicate: false },
    };

    const result = safeParseManifest(raw_manifest);
    if (result.success) manifests.push(result.data);
  }

  return manifests;
}
