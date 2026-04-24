import { evaluate } from '../metrics.js';

const DEFAULT_TLIS = [0.3, 0.4, 0.5, 0.6, 0.7];
const DEFAULT_GNCI = [10, 15, 20, 30, 40];
const DEFAULT_CFI  = [5, 8, 10, 15, 20];

function healthyUnder(actual, threshold) {
  return actual < threshold;
}

// Mirrors computeRScore from src/metrics.js but uses per-ablation normalization denominators
// (2× the swept threshold instead of fixed 40 / 20).
function rscoreAt(tlis, gnci, cfi, gnciThr, cfiThr) {
  const normGNCI = Math.min(gnci / (gnciThr * 2), 1);
  const normCFI  = Math.min(cfi  / (cfiThr  * 2), 1);
  return Math.max(0, Math.round((1 - (tlis + normGNCI + normCFI) / 3) * 10000) / 10000);
}

/**
 * Sweep TLIS / GNCI / CFI threshold values and report how routability
 * classifications and RScore change at each combination.
 *
 * @param {{
 *   graphMetrics:  { tlis: number, gnci: number, cfi: number },
 *   thresholds?:   { tlis?: number[], gnci?: number[], cfi?: number[] },
 *   baseline?:     { name: string, rank: (q: string) => Promise<string[]> },
 *   evalSet?:      Array<{ query: string, relevant: string[] }>,
 * }} opts
 * @returns {Promise<{
 *   graphMetrics: object,
 *   retrieval:    object|null,
 *   combinations: object[],
 *   summary:      object,
 * }>}
 */
export async function runAblation({
  graphMetrics,
  thresholds = {},
  baseline = null,
  evalSet = [],
} = {}) {
  const tlisRange = thresholds.tlis ?? DEFAULT_TLIS;
  const gnciRange = thresholds.gnci ?? DEFAULT_GNCI;
  const cfiRange  = thresholds.cfi  ?? DEFAULT_CFI;

  // Run retrieval eval once — it is threshold-independent.
  let retrieval = null;
  if (baseline && evalSet.length > 0) {
    retrieval = await evaluate(evalSet, (q) => baseline.rank(q), { ks: [1, 5, 20], mrr: true });
  }

  const combinations = [];

  for (const tlisThr of tlisRange) {
    for (const gnciThr of gnciRange) {
      for (const cfiThr of cfiRange) {
        const healthyTlis = healthyUnder(graphMetrics.tlis, tlisThr);
        const healthyGnci = healthyUnder(graphMetrics.gnci, gnciThr);
        const healthyCfi  = healthyUnder(graphMetrics.cfi,  cfiThr);

        combinations.push({
          thresholds: { tlis: tlisThr, gnci: gnciThr, cfi: cfiThr },
          healthy:    { tlis: healthyTlis, gnci: healthyGnci, cfi: healthyCfi },
          allHealthy: healthyTlis && healthyGnci && healthyCfi,
          rscore:     rscoreAt(graphMetrics.tlis, graphMetrics.gnci, graphMetrics.cfi, gnciThr, cfiThr),
        });
      }
    }
  }

  const rscores        = combinations.map((c) => c.rscore);
  const healthyCount   = combinations.filter((c) => c.allHealthy).length;
  const avgRScore      = rscores.reduce((a, b) => a + b, 0) / rscores.length;

  return {
    graphMetrics,
    retrieval,
    combinations,
    summary: {
      totalCombinations:    combinations.length,
      healthyCombinations:  healthyCount,
      unhealthyCombinations: combinations.length - healthyCount,
      avgRScore:  Math.round(avgRScore * 10000) / 10000,
      minRScore:  Math.min(...rscores),
      maxRScore:  Math.max(...rscores),
      baselineName: baseline?.name ?? null,
    },
  };
}
