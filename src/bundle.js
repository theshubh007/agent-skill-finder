import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseIOType(s) {
  const idx = s.indexOf(':');
  if (idx < 0) return { name: s, type: 'string' };
  return { name: s.slice(0, idx), type: s.slice(idx + 1) };
}

function ioTypeToJsonSchema(typeStr) {
  const t = typeStr.toLowerCase();
  if (t === 'string' || t === 'str' || t === 'path') return { type: 'string' };
  if (['number', 'int', 'integer', 'float'].includes(t)) return { type: 'number' };
  if (t === 'boolean' || t === 'bool') return { type: 'boolean' };
  if (t === 'dict' || t === 'object') return { type: 'object' };
  if (t.startsWith('list[') || t.startsWith('array[') || t === 'list' || t === 'array') {
    return { type: 'array' };
  }
  return { type: 'string', description: typeStr };
}

function buildProperties(ioList) {
  const props = {};
  for (const raw of ioList) {
    const { name, type } = typeof raw === 'string' ? parseIOType(raw) : raw;
    props[name] = ioTypeToJsonSchema(type);
  }
  return props;
}

function requiredNames(ioList) {
  return ioList.map((raw) =>
    typeof raw === 'string' ? parseIOType(raw).name : raw.name,
  );
}

// Skill IDs use hyphens; tool names for Anthropic/OpenAI require alphanumeric + underscores
function toolName(id) {
  return id.replace(/-/g, '_');
}

// ── SkillBundle ────────────────────────────────────────────────────────────────

export class SkillBundle {
  /**
   * @param {object[]} manifests  SkillManifest objects
   * @param {{ steps?: object[], plan?: object }} [opts]
   */
  constructor(manifests, { steps = [], plan = null } = {}) {
    this.manifests = manifests;
    this.steps = steps;
    this.plan = plan;
  }

  /**
   * Anthropic Claude API — tools parameter format.
   * @returns {Array<{name: string, description: string, input_schema: object}>}
   */
  toAnthropic() {
    return this.manifests.map((m) => {
      const inputs = m.capability?.inputs ?? [];
      return {
        name: toolName(m.id),
        description: m.description ?? m.name ?? m.id,
        input_schema: {
          type: 'object',
          properties: buildProperties(inputs),
          required: requiredNames(inputs),
        },
      };
    });
  }

  /**
   * OpenAI Chat Completions API — tools parameter format.
   * @returns {Array<{type: 'function', function: object}>}
   */
  toOpenAI() {
    return this.manifests.map((m) => {
      const inputs = m.capability?.inputs ?? [];
      return {
        type: 'function',
        function: {
          name: toolName(m.id),
          description: m.description ?? m.name ?? m.id,
          parameters: {
            type: 'object',
            properties: buildProperties(inputs),
            required: requiredNames(inputs),
          },
        },
      };
    });
  }

  /**
   * Google Gemini API — tools parameter format.
   * @returns {[{functionDeclarations: object[]}]}
   */
  toGemini() {
    return [
      {
        functionDeclarations: this.manifests.map((m) => {
          const inputs = m.capability?.inputs ?? [];
          const props = buildProperties(inputs);
          return {
            name: toolName(m.id),
            description: m.description ?? m.name ?? m.id,
            parameters: {
              type: 'OBJECT',
              properties: Object.fromEntries(
                Object.entries(props).map(([k, v]) => [
                  k,
                  { type: (v.type ?? 'string').toUpperCase() },
                ]),
              ),
              required: requiredNames(inputs),
            },
          };
        }),
      },
    ];
  }

  /**
   * gemini-cli pre-filter — ActivateSkillToolInput[] format.
   * @returns {Array<{skillId: string, registry: string}>}
   */
  toGeminiActivateTool() {
    return this.manifests.map((m) => ({
      skillId: m.id,
      registry: m.source?.registry ?? 'local',
    }));
  }

  /**
   * MCP Tool[] format (Model Context Protocol).
   * @returns {Array<{name: string, description: string, inputSchema: object}>}
   */
  toMcp() {
    return this.manifests.map((m) => {
      const inputs = m.capability?.inputs ?? [];
      return {
        name: m.id,
        description: m.description ?? m.name ?? m.id,
        inputSchema: {
          type: 'object',
          properties: buildProperties(inputs),
        },
      };
    });
  }

  /**
   * Write SKILL.md + scripts/ + references/ for each manifest to outputDir.
   * @param {string} outputDir  root output directory
   */
  async toSkillMdDir(outputDir) {
    for (const m of this.manifests) {
      const dir = join(outputDir, m.id);
      await mkdir(join(dir, 'scripts'), { recursive: true });
      await mkdir(join(dir, 'references'), { recursive: true });

      const { source: _s, quality: _q, ...frontmatter } = m;
      const skillMd = `---\n${yaml.dump(frontmatter).trim()}\n---\n`;
      await writeFile(join(dir, 'SKILL.md'), skillMd, 'utf8');
    }
  }
}
