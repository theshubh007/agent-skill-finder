import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMcpTool } from '../../src/adapters/mcp_server.js';

// normalizeMcpTool is not exported by default — test the internal contract
// via a thin re-export shim. For integration tests against a live MCP server,
// use `loadMcpServerSkills('mcp://localhost:9000')` with a real server running.

describe('mcp_server adapter — normalizeMcpTool', () => {
  test('normalizes a well-formed tool', () => {
    const tool = {
      name: 'search_papers',
      description: 'Search academic papers by keyword and return DOIs.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
      },
      annotations: { readOnly: true },
    };
    const m = normalizeMcpTool(tool, 'mcp://localhost:9000');
    assert.ok(m !== null, 'expected a manifest');
    assert.equal(m.id, 'search-papers');
    assert.equal(m.name, 'search_papers');
    assert.equal(m.risk, 'safe');
    assert.equal(m.compatibility.mcp, true);
    assert.equal(m.source.registry, 'mcp://localhost:9000');
    assert.ok(m.capability.inputs.includes('query:string'));
    assert.ok(m.capability.inputs.includes('limit:number'));
  });

  test('infers network risk from openWorld annotation', () => {
    const tool = {
      name: 'fetch_url',
      description: 'Fetch a URL and return the response body.',
      inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
      annotations: { openWorld: true },
    };
    const m = normalizeMcpTool(tool, 'mcp://localhost:9001');
    assert.equal(m.risk, 'network');
  });

  test('infers critical risk from destructive annotation', () => {
    const tool = {
      name: 'delete_file',
      description: 'Deletes a file from the filesystem.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      annotations: { destructive: true },
    };
    const m = normalizeMcpTool(tool, 'mcp://localhost:9002');
    assert.equal(m.risk, 'critical');
  });

  test('returns null for tool with missing name', () => {
    const m = normalizeMcpTool({ name: '', description: 'Some description' }, 'mcp://x');
    assert.equal(m, null);
  });

  test('returns null for tool with missing description', () => {
    const m = normalizeMcpTool({ name: 'my_tool', description: '' }, 'mcp://x');
    assert.equal(m, null);
  });

  test('infers retrieval capability from search keyword', () => {
    const tool = { name: 'query_index', description: 'Search the vector index.', inputSchema: {} };
    const m = normalizeMcpTool(tool, 'mcp://localhost:9000');
    assert.equal(m.capability.type, 'retrieval');
  });

  test('infers code-execution capability from execute keyword', () => {
    const tool = { name: 'execute_bash', description: 'Run a shell command.', inputSchema: {} };
    const m = normalizeMcpTool(tool, 'mcp://localhost:9000');
    assert.equal(m.capability.type, 'code-execution');
  });
});
