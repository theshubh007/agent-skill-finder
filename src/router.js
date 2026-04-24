import { recall } from './index.js';
import { rerank } from './rerank.js';
import { walkFromCandidates } from './kg/walk.js';
import { buildPlan } from './planner.js';
import { SkillBundle } from './bundle.js';
import { buildGraph } from './kg/build.js';

export class JITRouter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.indexDir]          directory containing skills.lance
   * @param {Function|null} [opts.embedFn]    injectable embed fn (tests)
   * @param {Function|null} [opts.rerankerFn] injectable reranker fn (tests)
   * @param {import('graphology').DirectedGraph|null} [opts.graph] injectable SKG (tests)
   */
  constructor({ indexDir = process.cwd(), embedFn = null, rerankerFn = null, graph = null } = {}) {
    this.indexDir = indexDir;
    this._embedFn = embedFn;
    this._rerankerFn = rerankerFn;
    this._graph = graph;
  }

  /**
   * Route a task through the 4-stage pipeline and return a SkillBundle + per-stage timings.
   *
   * @param {object} opts
   * @param {string} opts.task
   * @param {number} [opts.tokenBudget]  SKG walk token cap (default 4000)
   * @param {number} [opts.maxSkills]    max skills in final bundle (default 5)
   * @param {number} [opts.recallK]      Stage 1 top-K (default 100)
   * @param {number} [opts.rerankK]      Stage 2 top-K (default 30)
   * @returns {Promise<{
   *   bundle: SkillBundle,
   *   timings: { recall: number, rerank: number, graph: number, hydrate: number, total: number }
   * }>}
   */
  async find({ task, tokenBudget = 4000, maxSkills = 5, recallK = 100, rerankK = 30 } = {}) {
    const t0 = Date.now();

    // Stage 1: BM25 + bi-encoder recall
    const t1 = Date.now();
    const recalled = await recall(task, recallK, { rootDir: this.indexDir, embedFn: this._embedFn });
    const recallMs = Date.now() - t1;

    if (recalled.length === 0) {
      return {
        bundle: new SkillBundle([]),
        timings: { recall: recallMs, rerank: 0, graph: 0, hydrate: 0, total: Date.now() - t0 },
      };
    }

    // Stage 2: cross-encoder rerank
    const t2 = Date.now();
    const ranked = await rerank(task, recalled, rerankK, { rerankerFn: this._rerankerFn });
    const rerankMs = Date.now() - t2;

    // Stage 3: token-budget SKG walk from top maxSkills seeds
    const t3 = Date.now();
    const G = this._graph ?? buildGraph(recalled, []);
    const subgraph = walkFromCandidates(G, ranked.slice(0, maxSkills), { tokenBudget });
    const graphMs = Date.now() - t3;

    // Stage 4: hydrate manifests, build plan, assemble bundle
    const t4 = Date.now();
    const mMap = new Map(recalled.map((m) => [m.id, m]));
    const subManifests = subgraph.nodes.map((id) => mMap.get(id)).filter(Boolean);
    const { steps, deadlocks, ioViolations } = buildPlan(subgraph, mMap);
    const bundle = new SkillBundle(subManifests, { steps, plan: { deadlocks, ioViolations } });
    const hydrateMs = Date.now() - t4;

    return {
      bundle,
      timings: { recall: recallMs, rerank: rerankMs, graph: graphMs, hydrate: hydrateMs, total: Date.now() - t0 },
    };
  }
}
