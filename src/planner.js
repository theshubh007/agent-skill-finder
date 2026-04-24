/**
 * Capability-typed I/O composition planner.
 * Pure graph traversal — no LLM calls.
 *
 * buildPlan(subgraph, manifests, opts)
 *   → { steps: Step[], deadlocks: string[], ioViolations: IOViolation[] }
 *
 * Step: { step, skill, inputs[], outputs[], dependsOn[] }
 * Each input/output: { name: string, type: string }
 */

function parseIOType(s) {
  const idx = s.indexOf(':');
  if (idx < 0) return { name: s, type: 'string' };
  return { name: s.slice(0, idx), type: s.slice(idx + 1) };
}

function parseIOList(arr) {
  return arr.map((s) => (typeof s === 'string' ? parseIOType(s) : s));
}

/**
 * Kahn's algorithm topological sort.
 * Preserves input ordering for nodes at the same depth (deterministic).
 * @param {string[]} nodes
 * @param {Array<{source: string, target: string}>} depEdges
 * @returns {string[]}
 */
function topoSort(nodes, depEdges) {
  const inDegree = new Map(nodes.map((n) => [n, 0]));
  const adj = new Map(nodes.map((n) => [n, []]));

  for (const { source, target } of depEdges) {
    if (!inDegree.has(source) || !inDegree.has(target)) continue;
    inDegree.set(target, inDegree.get(target) + 1);
    adj.get(source).push(target);
  }

  // Seed queue in original node order for determinism
  const queue = nodes.filter((n) => inDegree.get(n) === 0);
  const sorted = [];

  while (queue.length) {
    const node = queue.shift();
    sorted.push(node);
    for (const nbr of adj.get(node)) {
      const d = inDegree.get(nbr) - 1;
      inDegree.set(nbr, d);
      if (d === 0) queue.push(nbr);
    }
  }

  if (sorted.length < nodes.length) throw new Error('cycle detected in dependency graph');
  return sorted;
}

/**
 * Build a capability-typed execution plan from a Stage-3 subgraph.
 *
 * @param {{ nodes: string[], edges: Array<{source: string, target: string, relation: string}> }} subgraph
 * @param {Map<string, object> | object[]} manifests  skill manifests indexed by id
 * @param {{ seeds?: string[] }} [opts]
 * @returns {{
 *   steps: Array<{step: number, skill: string, inputs: object[], outputs: object[], dependsOn: string[]}>,
 *   deadlocks: string[],
 *   ioViolations: Array<{from: string, to: string}>
 * }}
 */
export function buildPlan(subgraph, manifests, { seeds = [] } = {}) {
  const mMap =
    manifests instanceof Map
      ? manifests
      : new Map((Array.isArray(manifests) ? manifests : []).map((m) => [m.id, m]));

  const { nodes, edges } = subgraph;
  const depEdges = edges.filter((e) => e.relation === 'depends_on');

  // Deadlocks: depends_on targets that are missing from the subgraph
  const nodeSet = new Set(nodes);
  const deadlocks = [
    ...new Set(depEdges.map((e) => e.target).filter((t) => !nodeSet.has(t))),
  ];

  // Topo sort over in-subgraph depends_on edges only
  const internalDeps = depEdges.filter(
    (e) => nodeSet.has(e.source) && nodeSet.has(e.target),
  );

  let sorted;
  try {
    sorted = topoSort(nodes, internalDeps);
  } catch {
    // Cycle fallback: seeds first, then insertion order
    const seedSet = new Set(seeds);
    sorted = [
      ...nodes.filter((n) => seedSet.has(n)),
      ...nodes.filter((n) => !seedSet.has(n)),
    ];
  }

  const steps = sorted.map((id, i) => {
    const m = mMap.get(id) ?? { id };
    const cap = m.capability ?? {};
    const myDeps = internalDeps.filter((e) => e.target === id).map((e) => e.source);

    return {
      step: i + 1,
      skill: id,
      inputs: parseIOList(cap.inputs ?? []),
      outputs: parseIOList(cap.outputs ?? []),
      dependsOn: myDeps,
    };
  });

  // I/O compatibility: check output types of each depended-on step match inputs of dependent
  const ioViolations = [];
  for (const step of steps) {
    for (const depId of step.dependsOn) {
      const depStep = steps.find((s) => s.skill === depId);
      if (!depStep || depStep.outputs.length === 0 || step.inputs.length === 0) continue;
      const outTypes = new Set(depStep.outputs.map((o) => o.type));
      const compatible = step.inputs.some((inp) => outTypes.has(inp.type));
      if (!compatible) ioViolations.push({ from: depId, to: step.skill });
    }
  }

  return { steps, deadlocks, ioViolations };
}
