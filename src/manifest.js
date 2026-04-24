import { z } from 'zod';

export const RiskTier = z.enum(['safe', 'network', 'exec', 'critical', 'unsafe']);

export const CapabilityType = z.enum([
  'retrieval',
  'code-execution',
  'file-io',
  'web-search',
  'data-transform',
  'visualization',
  'bioinformatics',
  'report-writing',
  'communication',
  'database',
  'security',
  'devops',
  'ml-inference',
  'planning',
]);

// "name:type" e.g. "query:string", "papers:list[Paper]"
const IOType = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*:.+$/, {
  message: 'IOType must be in "name:type" format, e.g. "query:string"',
});

export const SkillManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, {
    message: 'id must be lowercase alphanumeric with hyphens',
  }),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, {
    message: 'version must be semver, e.g. "1.0.0"',
  }),
  description: z.string().min(10),

  capability: z.object({
    type: CapabilityType,
    inputs: z.array(IOType).default([]),
    outputs: z.array(IOType).default([]),
  }),

  graph: z.object({
    depends_on: z.array(z.string()).default([]),
    complements: z.array(z.string()).default([]),
    co_used_with: z.array(z.string()).default([]),
  }),

  compatibility: z.object({
    claude_code: z.boolean().default(false),
    gemini: z.boolean().default(false),
    codex: z.boolean().default(false),
    cursor: z.boolean().default(false),
    mcp: z.boolean().default(false),
  }),

  risk: RiskTier,

  source: z.object({
    registry: z.string().min(1),
    path: z.string().min(1),
  }),

  quality: z.object({
    slop_score: z.number().min(0).max(1).default(1),
    description_uniqueness: z.number().min(0).max(1).default(1),
    is_duplicate: z.boolean().default(false),
  }).default({}),
});

/** @typedef {z.infer<typeof SkillManifestSchema>} SkillManifest */

/**
 * Parse and validate a raw object as a SkillManifest.
 * Throws ZodError on invalid input.
 * @param {unknown} raw
 * @returns {import('zod').infer<typeof SkillManifestSchema>}
 */
export function parseManifest(raw) {
  return SkillManifestSchema.parse(raw);
}

/**
 * Safe parse — returns { success, data } or { success: false, error }.
 * @param {unknown} raw
 */
export function safeParseManifest(raw) {
  return SkillManifestSchema.safeParse(raw);
}
