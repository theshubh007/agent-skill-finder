import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { JITRouter } from './router.js';

const SERVER_TOOLS = [
  {
    name: 'list_tools',
    description: 'List all canonical skills in the ASF index',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'query_skills',
    description: 'Route a task description to the best-fit SkillBundle via the 4-stage pipeline',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        tokenBudget: { type: 'number' },
        maxSkills: { type: 'number' },
      },
      required: ['task'],
    },
  },
  {
    name: 'get_skill',
    description: 'Retrieve a single SkillManifest by its id',
    inputSchema: {
      type: 'object',
      properties: { skillId: { type: 'string' } },
      required: ['skillId'],
    },
  },
];

/**
 * Build the call-tool handler with injected dependencies.
 *
 * @param {{ manifests: object[], router: object }} deps
 */
export function buildCallToolHandler({ manifests, router }) {
  return async (request) => {
    const { name, arguments: args = {} } = request.params;

    if (name === 'list_tools') {
      return {
        content: [{ type: 'text', text: JSON.stringify(manifests, null, 2) }],
      };
    }

    if (name === 'query_skills') {
      const { task, tokenBudget = 4000, maxSkills = 5 } = args;
      if (!task) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'task is required' }) }], isError: true };
      }
      const { bundle, timings } = await router.find({ task, tokenBudget, maxSkills });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ manifests: bundle.manifests, steps: bundle.steps, plan: bundle.plan, timings }),
        }],
      };
    }

    if (name === 'get_skill') {
      const { skillId } = args;
      const manifest = manifests.find((m) => m.id === skillId);
      if (!manifest) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: `skill not found: ${skillId}` }) }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(manifest) }] };
    }

    return { content: [{ type: 'text', text: JSON.stringify({ error: `unknown tool: ${name}` }) }], isError: true };
  };
}

/**
 * Create and wire an ASF MCP Server instance.
 *
 * @param {{ indexDir?: string, manifests?: object[], embedFn?: Function, rerankerFn?: Function }} opts
 * @returns {{ server: Server, connect: (transport: object) => Promise<void> }}
 */
export function createServer({ indexDir = process.cwd(), manifests = [], embedFn = null, rerankerFn = null } = {}) {
  const router = new JITRouter({ indexDir, embedFn, rerankerFn });

  const server = new Server(
    { name: 'agentskillfinder', version: '0.5.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: SERVER_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, buildCallToolHandler({ manifests, router }));

  return {
    server,
    async connect(transport) {
      await server.connect(transport);
    },
  };
}

/**
 * Start ASF as an MCP stdio server (CLI entry point).
 *
 * @param {{ indexDir?: string, manifests?: object[] }} opts
 */
export async function startStdioServer(opts = {}) {
  const { server, connect } = createServer(opts);
  const transport = new StdioServerTransport();
  await connect(transport);
  return server;
}
