/**
 * Micro-benchmark: `final` parse of a paragraph holding many unclosed image
 * destinations (`![alt](https://…` with no closing paren).
 *
 * The math plugin builds "image ranges" once per inline source so `$`/`\`
 * inside an image destination is not treated as math. When the destinations
 * never close, the range builder used to rescan to the end of the source for
 * every `![`, which is O(unclosed × source length); streaming is unaffected
 * because there the first unclosed destination ends the scan.
 *
 * The parity fixture below pins the exact output the fix must preserve, and the
 * scaling assertion compares equal volumes: four paragraphs of N targets cost
 * the same as one paragraph of 4N when the scan is linear, and ~3-4x more while
 * it is quadratic.
 * @vitest-environment node
 */
import type { ParsedNode } from 'stream-markdown-parser'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

const md = getMarkdown('inline-unclosed-image-bench')

/**
 * One paragraph per case, with the unclosed destinations joined by spaces.
 * `seed` keeps separately measured paragraphs from sharing an identical source.
 */
function makeTargets(count: number, seed = 0) {
  return Array.from({ length: count }, (_, index) => `![a](https://e.com/${seed}/${index}.png`).join(' ')
}

function describeNode(node: any): string {
  if (node?.type === 'text')
    return `text(${JSON.stringify(node.content)})`
  if (node?.type === 'image')
    return `image(src=${JSON.stringify(node.src)},loading=${String(node.loading)})`
  if (node?.type === 'link')
    return `link(href=${JSON.stringify(node.href)},text=${JSON.stringify(node.text)},loading=${String(node.loading)})`
  return String(node?.type)
}

function summarize(nodes: ParsedNode[]): string[] {
  const out: string[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object')
      return
    out.push(describeNode(node))
    if (Array.isArray(node.children))
      node.children.forEach(walk)
    if (Array.isArray(node.items))
      node.items.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

function bestOf(input: string, final: boolean, runs = 3) {
  // Warm every code path once (plugin setup, caches) before timing.
  parseMarkdownToStructure(input, md, { final })
  let best = Number.POSITIVE_INFINITY
  for (let run = 0; run < runs; run++) {
    const start = performance.now()
    parseMarkdownToStructure(input, md, { final })
    best = Math.min(best, performance.now() - start)
  }
  return best
}

/**
 * `smallInputs` hold the same characters as `largeInput`, so a linear scan costs
 * the same on both sides and a quadratic one costs ~4x more. Both timings are
 * taken inside one repetition, so a busy runner slows them down together; a bare
 * "4x the input costs < 8x the time" ratio cannot do that, because taking the
 * best of a few runs favours the shorter workload and inflates the ratio.
 *
 * Returns the best repetition: a GC pause or a scheduling hiccup can only
 * inflate one side of one repetition, while a quadratic build is slow in every
 * repetition, so the best one still clears the threshold on its own.
 */
function equalVolumeRatio(smallInputs: string[], largeInput: string, final: boolean, runs = 5) {
  const parseAll = (inputs: string[]) => {
    for (const input of inputs)
      parseMarkdownToStructure(input, md, { final })
  }
  const measure = (inputs: string[]) => {
    const start = performance.now()
    parseAll(inputs)
    return performance.now() - start
  }

  // Warm every code path twice (plugin setup, caches, JIT tier-up) before
  // timing: the first timed repetition would otherwise pay for making the hot
  // loops optimized, which skewed an early quadratic measurement to ~1x.
  for (let pass = 0; pass < 2; pass++) {
    parseAll(smallInputs)
    parseAll([largeInput])
  }

  let best = { ratio: Number.POSITIVE_INFINITY, smallMs: 0, largeMs: 0 }
  for (let run = 0; run < runs; run++) {
    // Alternate the order: one side never systematically pays for the heap
    // growth or the CPU ramp of the repetition before it.
    let smallMs: number
    let largeMs: number
    if (run % 2 === 0) {
      smallMs = measure(smallInputs)
      largeMs = measure([largeInput])
    }
    else {
      largeMs = measure([largeInput])
      smallMs = measure(smallInputs)
    }
    const ratio = largeMs / Math.max(0.001, smallMs)
    if (ratio < best.ratio)
      best = { ratio, smallMs, largeMs }
  }
  return best
}

describe('unclosed image destinations — final parse', () => {
  it('keeps the current output while the destinations stay unclosed', () => {
    // `final`: nothing can arrive any more, so the placeholder becomes the
    // source text, the way a truncated link destination already behaves.
    expect(summarize(parseMarkdownToStructure('![a](https://e.com/a.png', md, { final: true }))).toEqual([
      'paragraph',
      'text("![a](https://e.com/a.png")',
    ])

    // Streaming keeps the progressive placeholder for the same source.
    expect(summarize(parseMarkdownToStructure('![a](https://e.com/a.png', md, { final: false }))).toEqual([
      'paragraph',
      'image(src="https://e.com/a.png",loading=true)',
    ])

    // Mixed with prose and a closed image, so the recovery has to keep both.
    expect(summarize(parseMarkdownToStructure('see ![a](https://e.com/a.png and ![b](b.png)', md, { final: true }))).toEqual([
      'paragraph',
      'text("see ![a](https://e.com/a.png and ")',
      'image(src="b.png",loading=false)',
    ])

    // Two unclosed targets in one paragraph: the text written back for the
    // first one carries the start of the second, which then stays a link.
    expect(summarize(parseMarkdownToStructure('![a](https://e.com/a.png ![b](https://e.com/b.png', md, { final: true }))).toEqual([
      'paragraph',
      'text("![a](https://e.com/a.png ![b](")',
      'link(href="https://e.com/b.png",text="https://e.com/b.png",loading=false)',
      'text("https://e.com/b.png")',
    ])
  })

  it('scales linearly with the number of unclosed destinations at final', () => {
    // Equal volume on both sides: four paragraphs of `small` cost the same as
    // one paragraph with four times the targets when the scan is linear, and
    // ~4x more while it is quadratic. Measured here: the fix 1.0-1.2x, `main`
    // 2.8-4.0x, so 2.0 splits the two with room on either side.
    const small = 1600
    const smallInputs = [0, 1, 2, 3].map(seed => makeTargets(small, seed))
    const final = equalVolumeRatio(smallInputs, makeTargets(small * 4), true)

    // Streaming is measured on a bigger pair: its absolute times are small, so
    // a ratio at the sizes above is mostly noise there.
    const streamSmallMs = bestOf(makeTargets(3200), false)
    const streamLargeMs = bestOf(makeTargets(12_800), false)
    const streamRatio = streamLargeMs / Math.max(0.001, streamSmallMs)

    // Logged only: the token rewrite still grows faster than linear at this size
    // (it splices a growing token array once per folded link), which is a
    // separate cost from the image-range scan fixed here.
    const tailMs = bestOf(makeTargets(12_800), true)

    console.log(
      `[unclosed-image-bench] final ${small}x4=${final.smallMs.toFixed(1)}ms ${small * 4}=${final.largeMs.toFixed(1)}ms ratio=${final.ratio.toFixed(2)}x (equal volume)`,
    )
    console.log(
      `[unclosed-image-bench] stream 3200=${streamSmallMs.toFixed(1)}ms 12800=${streamLargeMs.toFixed(1)}ms ratio=${streamRatio.toFixed(2)}x (4x input)`,
    )
    console.log(`[unclosed-image-bench] final ${small * 8}=${tailMs.toFixed(1)}ms (logged only)`)

    // Quadratic growth makes the equal-volume pair ~4x, linear ~1x. The
    // threshold leaves room for timing noise on a shared CI machine while still
    // rejecting the quadratic curve.
    expect(final.ratio).toBeLessThan(2)
    expect(streamRatio).toBeLessThan(8)
  }, 120_000)
})
