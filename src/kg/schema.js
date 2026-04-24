import { z } from 'zod';

export const EdgeRelation = z.enum([
  'depends_on',
  'required_sub_skills',
  'complements',
  'duplicate_of',
  'co_used_with',
  'tested_by',
  'conflicts_with',
  'version_of',
  'extends',
]);

export const ConfidenceSource = z.enum(['EXTRACTED', 'INFERRED', 'AMBIGUOUS']);

export const NodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  file_type: z.enum(['skill', 'document', 'paper', 'image', 'rationale']),
  source_file: z.string(),
  source_location: z.string().default(''),
});

export const EdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  relation: EdgeRelation,
  confidence: ConfidenceSource,
  confidence_score: z.number().min(0).max(1).default(1.0),
  source_file: z.string(),
  source_location: z.string().default(''),
  weight: z.number().min(0).max(1).default(1.0),
});

export const ExtractionSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

/**
 * Validate an extraction dict. Returns list of error strings; empty = valid.
 * @param {unknown} data
 * @returns {string[]}
 */
export function validateExtraction(data) {
  const result = ExtractionSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
}

/**
 * Validate and throw on error.
 * @param {unknown} data
 * @returns {z.infer<typeof ExtractionSchema>}
 */
export function assertValidExtraction(data) {
  return ExtractionSchema.parse(data);
}
