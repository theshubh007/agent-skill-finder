/**
 * Cross-registry behavioral trigger-pattern analysis.
 *
 * Detects two failure modes:
 *  1. Overlap — two skills from different registries share trigger patterns
 *     (cross-registry confusion risk — router may surface the wrong one).
 *  2. ToolTweak — skill description contains trigger patterns from a category
 *     inconsistent with its declared purpose (adversarial naming / injection).
 */

const CATEGORY_PATTERNS = {
  filesystem: /\b(files?|read|write|path|directory|folder|disk|stat)\b/i,
  network:    /\b(http|https|fetch|url|api|request|endpoint|rest|graphql|webhook)\b/i,
  shell:      /\b(bash|exec|command|spawn|run|shell|terminal|subprocess)\b/i,
  data:       /\b(json|csv|xml|parse|transform|format|serialize|deserialize)\b/i,
  ml:         /\b(model|inference|embedding|classify|predict|llm|gpt|bert|tokenize)\b/i,
  crypto:     /\b(encrypt|decrypt|sign|verify|hash|hmac|key|certificate|tls)\b/i,
  database:   /\b(query|sql|insert|select|update|delete|schema|migration|orm)\b/i,
  scientific: /\b(align|sequence|genome|protein|molecule|reagent|simulation)\b/i,
};

/**
 * Extract matching category labels from a skill manifest's text fields.
 *
 * @param {object} manifest
 * @returns {string[]}  matched category names
 */
export function extractTriggerPatterns(manifest) {
  const text = [
    manifest?.description ?? '',
    manifest?.name ?? '',
    ...(manifest?.tags ?? []),
  ].join(' ');

  return Object.entries(CATEGORY_PATTERNS)
    .filter(([, re]) => re.test(text))
    .map(([cat]) => cat);
}

/**
 * Find skills from two different registries that share trigger patterns.
 *
 * @param {object[]} skillsA  each item must have { id, registry, description?, name?, tags? }
 * @param {object[]} skillsB
 * @returns {Array<{ skillA, registryA, skillB, registryB, sharedPatterns, risk }>}
 */
export function detectCrossRegistryOverlap(skillsA, skillsB) {
  const patternsA = skillsA.map((s) => ({ skill: s, patterns: new Set(extractTriggerPatterns(s)) }));
  const overlaps  = [];

  for (const b of skillsB) {
    const patternsB = extractTriggerPatterns(b);
    if (patternsB.length === 0) continue;

    for (const { skill: a, patterns: setA } of patternsA) {
      if (a.registry === b.registry) continue;
      const shared = patternsB.filter((p) => setA.has(p));
      if (shared.length === 0) continue;

      overlaps.push({
        skillA:         a.id,
        registryA:      a.registry,
        skillB:         b.id,
        registryB:      b.registry,
        sharedPatterns: shared,
        risk:           shared.length >= 2 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  return overlaps;
}

/**
 * Flag skills whose trigger patterns are inconsistent with their declared category.
 * A mismatch suggests adversarial renaming (ToolTweak) or mis-categorization.
 *
 * @param {object[]} skills
 * @param {Map<string, string[]>} categoryMap  skillId → expected category labels
 * @returns {Array<{ skillId, registry, expectedCategories, unexpectedPatterns, injectionRisk }>}
 */
export function detectToolTweakInjection(skills, categoryMap) {
  const flags = [];

  for (const skill of skills) {
    const patterns  = extractTriggerPatterns(skill);
    const expected  = categoryMap.get(skill.id) ?? [];
    const unexpected = patterns.filter((p) => !expected.includes(p));

    if (unexpected.length > 0) {
      flags.push({
        skillId:             skill.id,
        registry:            skill.registry ?? null,
        expectedCategories:  expected,
        unexpectedPatterns:  unexpected,
        injectionRisk:       'HIGH',
      });
    }
  }

  return flags;
}

/**
 * Run full cross-registry analysis over an array of named registries.
 *
 * @param {Array<{ name: string, skills: object[] }>} registries
 * @returns {{ overlaps: object[], summary: { total, high, medium } }}
 */
export function analyzeRegistries(registries) {
  const tagged = registries.map(({ name, skills }) => ({
    name,
    skills: skills.map((s) => ({ ...s, registry: name })),
  }));

  const allOverlaps = [];
  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      allOverlaps.push(...detectCrossRegistryOverlap(tagged[i].skills, tagged[j].skills));
    }
  }

  const high = allOverlaps.filter((o) => o.risk === 'HIGH').length;
  return {
    overlaps: allOverlaps,
    summary: { total: allOverlaps.length, high, medium: allOverlaps.length - high },
  };
}
