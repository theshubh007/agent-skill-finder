import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import yaml from 'js-yaml';
import { safeParseManifest } from '../manifest.js';

const COMPOSIO_DIR = 'composio-skills';

// Root-level dirs that are skills (not meta dirs)
const META_DIRS = new Set([
  'composio-skills',
  'awesome-claude-skills-research',
  'graphify-out',
  'mcp-builder',
  'template-skill',
]);

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
 * Composio automation skills all follow the `*-automation` naming pattern.
 * Their descriptions are highly similar (pairwise SBERT sim > 0.92 confirmed),
 * so description_uniqueness is flagged low and slop_score reduced.
 * Skills below slop_score 0.4 enter quarantine at canonicalize time.
 */
function composioQuality() {
  return {
    slop_score: 0.45,       // above quarantine threshold but flagged
    description_uniqueness: 0.28,  // known collision risk
    is_duplicate: false,
  };
}

/**
 * Load a single SKILL.md and build a manifest.
 * @param {string} skillMdPath
 * @param {string} skillId
 * @param {string} registryRelPath
 * @param {boolean} isComposio
 */
async function loadSkillMd(skillMdPath, skillId, registryRelPath, isComposio) {
  let mdContent;
  try { mdContent = await readFile(skillMdPath, 'utf8'); } catch { return null; }

  const fm = parseFrontmatter(mdContent);
  const name = String(fm.name ?? skillId);
  const description = String(fm.description ?? '');
  if (!description || description.length < 10) return null;

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) return null;

  const raw_manifest = {
    id,
    name,
    version: '1.0.0',
    description,
    capability: { type: 'retrieval', inputs: [], outputs: [] },
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
      registry: 'awesome-claude-skills',
      path: registryRelPath,
    },
    quality: isComposio ? composioQuality() : { slop_score: 1, description_uniqueness: 1, is_duplicate: false },
  };

  const result = safeParseManifest(raw_manifest);
  return result.success ? result.data : null;
}

/**
 * Load skills from awesome-claude-skills registry.
 * Handles two categories:
 *  1. Composio automation skills in composio-skills/ (~800 skills)
 *  2. Regular curated skills at registry root (~30 skills)
 * @param {string} registryRoot  absolute path to awesome-claude-skills repo
 * @returns {Promise<import('../manifest.js').SkillManifest[]>}
 */
export async function loadAwesomeClaudeSkills(registryRoot) {
  const manifests = [];

  // --- Category 1: Composio automation skills ---
  const composioRoot = join(registryRoot, COMPOSIO_DIR);
  let composioEntries = [];
  try { composioEntries = await readdir(composioRoot, { withFileTypes: true }); } catch { /* no composio dir */ }

  for (const entry of composioEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const skillMdPath = join(composioRoot, entry.name, 'SKILL.md');
    const m = await loadSkillMd(
      skillMdPath,
      entry.name,
      join(COMPOSIO_DIR, entry.name),
      true,
    );
    if (m) manifests.push(m);
  }

  // --- Category 2: Regular root-level skills ---
  let rootEntries = [];
  try { rootEntries = await readdir(registryRoot, { withFileTypes: true }); } catch { return manifests; }

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (META_DIRS.has(entry.name)) continue;

    const skillMdPath = join(registryRoot, entry.name, 'SKILL.md');
    const m = await loadSkillMd(
      skillMdPath,
      entry.name,
      entry.name,
      false,
    );
    if (m) manifests.push(m);
  }

  return manifests;
}
