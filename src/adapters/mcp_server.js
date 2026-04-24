import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { safeParseManifest } from '../manifest.js';

const RISK_FROM_ANNOTATIONS = {
  destructive: 'critical',
  readOnly: 'safe',
};

/**
 * Infer risk tier from MCP tool annotations.
 * @param {Record<string, unknown>} annotations
 */
function inferRisk(annotations = {}) {
  if (annotations.destructive) return 'critical';
  if (annotations.readOnly === false) return 'exec';
  if (annotations.openWorld) return 'network';
  return 'safe';
}

/**
 * Infer capability type from tool name and description.
 * @param {string} name
 * @param {string} description
 */
function inferCapability(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  if (text.match(/search|lookup|find|query|fetch|retrieve/)) return 'retrieval';
  if (text.match(/execut|run|command|shell|bash/)) return 'code-execution';
  if (text.match(/file|read|write|path|dir/)) return 'file-io';
  if (text.match(/http|request|api|endpoint|curl/)) return 'web-search';
  if (text.match(/database|sql|db|table|record/)) return 'database';
  if (text.match(/transform|convert|parse|format/)) return 'data-transform';
  return 'retrieval';
}

/**
 * Normalize a single MCP tool definition to SkillManifest format.
 * Exported for unit testing.
 * @public
 * @param {object} tool  MCP tool object from list_tools
 * @param {string} registry  registry label (e.g. "mcp://localhost:9000")
 * @returns {import('../manifest.js').SkillManifest | null}
 */
export function normalizeMcpTool(tool, registry) {
  const name = String(tool.name ?? '');
  if (!name) return null;

  const description = String(tool.description ?? '');
  if (description.length < 5) return null;

  // slug: snake_case or camelCase → kebab-case
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) return null;

  // Extract I/O types from JSON schema if present
  const inputs = [];
  const props = tool.inputSchema?.properties ?? {};
  for (const [propName, propSchema] of Object.entries(props)) {
    const type = propSchema?.type ?? 'unknown';
    inputs.push(`${propName}:${type}`);
  }

  const annotations = tool.annotations ?? {};
  const risk = inferRisk(annotations);
  const capabilityType = inferCapability(name, description);

  const raw_manifest = {
    id,
    name,
    version: '1.0.0',
    description,
    capability: { type: capabilityType, inputs, outputs: [] },
    graph: { depends_on: [], complements: [], co_used_with: [] },
    compatibility: {
      claude_code: false,
      gemini: false,
      codex: false,
      cursor: false,
      mcp: true,
    },
    risk,
    source: { registry, path: name },
    quality: { slop_score: 1, description_uniqueness: 1, is_duplicate: false },
  };

  const result = safeParseManifest(raw_manifest);
  return result.success ? result.data : null;
}

/**
 * Connect to an MCP server and retrieve all tools as SkillManifests.
 * Supports `mcp://` URLs mapped to Streamable HTTP transport.
 *
 * @param {string} mcpUrl  e.g. "mcp://localhost:9000" or "http://localhost:9000/mcp"
 * @returns {Promise<import('../manifest.js').SkillManifest[]>}
 */
export async function loadMcpServerSkills(mcpUrl) {
  // Normalise mcp:// → http://
  const httpUrl = mcpUrl.replace(/^mcp:\/\//, 'http://');
  const url = new URL(httpUrl.includes('/mcp') ? httpUrl : `${httpUrl}/mcp`);

  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client(
    { name: 'agentskillfinder-ingest', version: '0.1.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  let cursor;
  const tools = [];

  // paginate through all tools
  do {
    const response = await client.listTools({ cursor });
    tools.push(...(response.tools ?? []));
    cursor = response.nextCursor;
  } while (cursor);

  await client.close();

  const manifests = [];
  for (const tool of tools) {
    const m = normalizeMcpTool(tool, mcpUrl);
    if (m) manifests.push(m);
  }
  return manifests;
}
