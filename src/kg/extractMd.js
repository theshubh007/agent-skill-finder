import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import MarkdownIt from 'markdown-it';
import yaml from 'js-yaml';

const md = new MarkdownIt();

function makeId(...parts) {
  return parts.join(':').replace(/[^a-zA-Z0-9:._/-]/g, '_');
}

/**
 * Parse YAML frontmatter block from markdown source.
 * Returns { frontmatter: object, body: string }.
 */
function parseFrontmatter(source) {
  const fm = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fm) return { frontmatter: {}, body: source };
  try {
    return { frontmatter: yaml.load(fm[1]) ?? {}, body: fm[2] };
  } catch {
    return { frontmatter: {}, body: source };
  }
}

/**
 * Extract a list of skill ids from a frontmatter field (string or array).
 * @param {unknown} value
 * @returns {string[]}
 */
function toIdList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Walk markdown-it token stream and extract heading-level sections.
 * Returns Map<headingText, tokensBelowHeading[]>.
 */
function extractSections(tokens) {
  const sections = new Map();
  let currentHeading = null;
  let depth = 0;

  for (const tok of tokens) {
    if (tok.type === 'heading_open') {
      depth = parseInt(tok.tag.slice(1), 10);
      currentHeading = null;
    } else if (tok.type === 'inline' && depth > 0) {
      currentHeading = tok.content;
      if (!sections.has(currentHeading)) sections.set(currentHeading, []);
      depth = 0;
    } else if (currentHeading) {
      sections.get(currentHeading).push(tok);
    }
  }
  return sections;
}

/**
 * Collect inline text from a token list.
 * @param {object[]} tokens
 * @returns {string}
 */
function inlineText(tokens) {
  return tokens
    .filter(t => t.type === 'inline')
    .map(t => t.content)
    .join('\n');
}

/**
 * Extract skill dependency edges from a SKILL.md file.
 *
 * Frontmatter `depends_on` / `complements` → EXTRACTED edges (confidence 1.0).
 * `## Required` prose sections → INFERRED edges (confidence 0.7).
 * `## References` sections → `references` node type.
 *
 * @param {string} filePath  absolute path to SKILL.md
 * @returns {{ nodes: object[], edges: object[] }}
 */
export function extractMd(filePath) {
  const strPath = filePath;
  const stem = basename(filePath, '.md');
  const fileId = makeId(strPath);

  const baseNode = {
    id: fileId,
    label: stem,
    file_type: 'skill',
    source_file: strPath,
    source_location: 'L1',
  };

  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    return { nodes: [baseNode], edges: [] };
  }

  const { frontmatter, body } = parseFrontmatter(source);
  const nodes = [baseNode];
  const edges = [];

  // ── EXTRACTED edges from frontmatter ──────────────────────────────────────
  for (const targetId of toIdList(frontmatter.depends_on)) {
    edges.push({
      source: fileId,
      target: makeId(targetId),
      relation: 'depends_on',
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      source_file: strPath,
      source_location: 'frontmatter',
      weight: 1.0,
    });
  }

  for (const targetId of toIdList(frontmatter.complements)) {
    edges.push({
      source: fileId,
      target: makeId(targetId),
      relation: 'complements',
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      source_file: strPath,
      source_location: 'frontmatter',
      weight: 1.0,
    });
  }

  // ── Parse markdown body ───────────────────────────────────────────────────
  const tokens = md.parse(body, {});
  const sections = extractSections(tokens);

  // ── INFERRED edges from ## Required sections ──────────────────────────────
  for (const [heading, sectionTokens] of sections) {
    if (/^required/i.test(heading)) {
      const text = inlineText(sectionTokens);
      for (const line of text.split('\n')) {
        // Extract bare skill-id-like tokens: kebab-case or snake_case words
        const ids = line.match(/\b[a-z][a-z0-9_-]{2,}\b/g) ?? [];
        for (const id of ids) {
          if (id === stem) continue;
          edges.push({
            source: fileId,
            target: makeId(id),
            relation: 'depends_on',
            confidence: 'INFERRED',
            confidence_score: 0.7,
            source_file: strPath,
            source_location: `heading:${heading}`,
            weight: 0.7,
          });
        }
      }
    }
  }

  // ── References nodes from ## References sections ──────────────────────────
  for (const [heading, sectionTokens] of sections) {
    if (/^references?/i.test(heading)) {
      const text = inlineText(sectionTokens);
      for (const line of text.split('\n')) {
        const trimmed = line.replace(/^[-*]\s*/, '').trim();
        if (!trimmed) continue;
        const refId = makeId(trimmed.toLowerCase().replace(/\s+/g, '-').slice(0, 60));
        if (!nodes.find(n => n.id === refId)) {
          nodes.push({
            id: refId,
            label: trimmed.slice(0, 80),
            file_type: 'rationale',
            source_file: strPath,
            source_location: `heading:${heading}`,
          });
        }
        edges.push({
          source: fileId,
          target: refId,
          relation: 'complements',
          confidence: 'AMBIGUOUS',
          confidence_score: 0.5,
          source_file: strPath,
          source_location: `heading:${heading}`,
          weight: 0.5,
        });
      }
    }
  }

  return { nodes, edges };
}
