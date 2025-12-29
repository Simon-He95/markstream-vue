/**
 * Recommend when to use Worker based on formula count and complexity.
 *
 * N_threshold ≈ floor(B / (R × (1 - H)))
 * - B: main-thread budget (ms), e.g. 50ms or a stricter 16.7ms
 * - R: avg render time per unique formula (ms)
 * - H: cache hit rate (0~1)
 */

export interface ThresholdInput {
  R: number // avg render time per unique formula, ms
  H?: number // cache hit rate (0~1), default 0 for first paint
  B?: number // main-thread budget ms, default 50
}

export function recommendWorkerThreshold({ R, H = 0, B = 50 }: ThresholdInput) {
  const denom = R * (1 - H) || 1e-6
  const N = Math.max(1, Math.floor(B / denom))
  return N
}

// A very lightweight classifier by formula length/characters to pick R ballpark
export function estimateRByFormula(sample: string): 'simple' | 'medium' | 'complex' {
  const len = sample.length
  const slashes = (sample.match(/\\/g) || []).length
  // heuristics: more backslashes and longer length indicate complexity
  const score = len + slashes * 10
  if (score < 10)
    return 'simple'
  if (score < 40)
    return 'medium'
  return 'complex'
}

export function defaultRByClass(cls: 'simple' | 'medium' | 'complex'): number {
  // conservative defaults (ms) for mid-tier devices
  switch (cls) {
    case 'simple': return 3
    case 'medium': return 10
    case 'complex': return 30
  }
}

export function recommendNForSamples(formulas: string[], opts?: { H?: number, B?: number }) {
  // classify each and take the worst (max R) since bursts often contain mixed complexity
  let maxR = 0
  for (const f of formulas) {
    const cls = estimateRByFormula(f)
    const R = defaultRByClass(cls)
    if (R > maxR)
      maxR = R
  }
  return recommendWorkerThreshold({ R: maxR, H: opts?.H ?? 0, B: opts?.B ?? 50 })
}
