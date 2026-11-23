/**
 * Micro-benchmark: inline math on prose full of `$` that never forms a formula
 * (prices), on prose with real inline formulas, and on `\(...\)` formulas
 * holding a half-open interval.
 *
 * The inline math rule runs at every `$` and `\` of a paragraph and has to
 * decide each one where it stands. A decision that looks at the rest of the
 * paragraph again for every `$` (rebuilding code-span or image ranges, scanning
 * to the end for a closer) costs O(dollars × paragraph length), which is
 * quadratic on a list of prices. The same holds for a `\)` search that pairs
 * plain parentheses: the `(` of `(0, 1]` takes the formula's `\)`, and every
 * `\(` scans on to the end.
 *
 * The fixture below pins what the generated inputs parse to, so the timing is
 * known to measure rejected openers on one side and real formulas on the
 * other. The scaling assertion compares equal volumes: four paragraphs of N
 * units cost the same as one paragraph of 4N when the rule is linear.
 * @vitest-environment node
 */
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

const md = getMarkdown('inline-math-dollar-scan-bench')

// A streaming parse of the same source again is answered from the stream
// parser's cache, so every timed parse starts from a reset stream.
function parse(input: string, final: boolean) {
  ;(md as any).stream?.reset?.()
  return parseMarkdownToStructure(input, md, { final }) as any[]
}

/** One paragraph of prices; `seed` keeps separately measured paragraphs distinct. */
function makePrices(count: number, seed = 0) {
  return Array.from({ length: count }, (_, index) => `plan ${seed}.${index} is $${index % 90 + 5} a month or $${index % 900 + 50} a year,`).join(' ')
}

/** One paragraph with one `$...$` and one `\(...\)` formula per unit. */
function makeFormulas(count: number, seed = 0) {
  return Array.from({ length: count }, (_, index) => `term ${seed}.${index} is $x_{${index}}$ and \\(y_{${index}}\\),`).join(' ')
}

/** One paragraph with one `\(x \in (a, b]\)` formula per unit. */
function makeIntervals(count: number, seed = 0) {
  return Array.from({ length: count }, (_, index) => `case ${seed}.${index} has \\(x \\in (${index}, ${index + 1}]\\),`).join(' ')
}

function countNodes(nodes: any[], type: string): number {
  return nodes.reduce((total, node) => total + (node?.type === type ? 1 : 0) + countNodes([...(node?.children ?? []), ...(node?.items ?? [])], type), 0)
}

function bestOf(input: string, final: boolean, runs = 3) {
  // Warm every code path once (plugin setup, caches) before timing.
  parse(input, final)
  let best = Number.POSITIVE_INFINITY
  for (let run = 0; run < runs; run++) {
    const start = performance.now()
    parse(input, final)
    best = Math.min(best, performance.now() - start)
  }
  return best
}

/**
 * `smallInputs` hold the same characters as `largeInput`, so a linear rule costs
 * the same on both sides and a quadratic one ~4x more. Each side keeps its
 * smallest sample, and the order alternates, as in the unclosed-image benchmark.
 */
function equalVolumeRatio(smallInputs: string[], largeInput: string, final: boolean, runs = 9) {
  const parseAll = (inputs: string[]) => {
    for (const input of inputs)
      parse(input, final)
  }
  const measure = (inputs: string[]) => {
    const start = performance.now()
    parseAll(inputs)
    return performance.now() - start
  }

  for (let pass = 0; pass < 2; pass++) {
    parseAll(smallInputs)
    parseAll([largeInput])
  }

  let smallMs = Number.POSITIVE_INFINITY
  let largeMs = Number.POSITIVE_INFINITY
  for (let run = 0; run < runs; run++) {
    if (run % 2 === 0) {
      smallMs = Math.min(smallMs, measure(smallInputs))
      largeMs = Math.min(largeMs, measure([largeInput]))
    }
    else {
      largeMs = Math.min(largeMs, measure([largeInput]))
      smallMs = Math.min(smallMs, measure(smallInputs))
    }
  }
  return { ratio: largeMs / Math.max(0.001, smallMs), smallMs, largeMs }
}

describe('inline math on dollar-heavy prose', () => {
  it('parses the generated inputs as prices and as formulas', () => {
    for (const final of [true, false]) {
      const prices = parse(makePrices(40), final)
      expect(countNodes(prices, 'math_inline')).toBe(0)
      expect(countNodes(prices, 'paragraph')).toBe(1)

      const formulas = parse(makeFormulas(40), final)
      expect(countNodes(formulas, 'math_inline')).toBe(80)
      expect(countNodes(formulas, 'paragraph')).toBe(1)

      const intervals = parse(makeIntervals(40), final)
      expect(countNodes(intervals, 'math_inline')).toBe(40)
      expect(countNodes(intervals, 'paragraph')).toBe(1)
    }
  })

  it('scales linearly with the number of openers in a paragraph', () => {
    const small = 1600
    const results = {
      pricesFinal: equalVolumeRatio([0, 1, 2, 3].map(seed => makePrices(small, seed)), makePrices(small * 4), true),
      pricesStream: equalVolumeRatio([0, 1, 2, 3].map(seed => makePrices(small, seed)), makePrices(small * 4), false),
      formulasFinal: equalVolumeRatio([0, 1, 2, 3].map(seed => makeFormulas(small, seed)), makeFormulas(small * 4), true),
      intervalsFinal: equalVolumeRatio([0, 1, 2, 3].map(seed => makeIntervals(small, seed)), makeIntervals(small * 4), true),
    }
    for (const [name, result] of Object.entries(results))
      console.log(`[dollar-scan-bench] ${name} ${small}x4=${result.smallMs.toFixed(1)}ms ${small * 4}=${result.largeMs.toFixed(1)}ms ratio=${result.ratio.toFixed(2)}x (equal volume)`)

    // Logged only: a single larger paragraph, to show the absolute cost.
    console.log(`[dollar-scan-bench] prices ${small * 8}=${bestOf(makePrices(small * 8), true).toFixed(1)}ms (logged only)`)

    expect(results.pricesFinal.ratio).toBeLessThan(3)
    expect(results.pricesStream.ratio).toBeLessThan(3)
    expect(results.formulasFinal.ratio).toBeLessThan(3)
    expect(results.intervalsFinal.ratio).toBeLessThan(3)
  }, 120_000)
})
