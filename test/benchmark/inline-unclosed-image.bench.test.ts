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
 * scaling assertion fails while the parse is quadratic (4x the targets costs
 * ~12-16x the time) and passes once it is linear (~4x).
 * @vitest-environment node
 */
import type { ParsedNode } from 'stream-markdown-parser'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

const md = getMarkdown('inline-unclosed-image-bench')

/** One paragraph per case, with the unclosed destinations joined by spaces. */
function makeTargets(count: number) {
  return Array.from({ length: count }, (_, index) => `![a](https://e.com/${index}.png`).join(' ')
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
    const small = 800
    const large = 3200
    const smallMs = bestOf(makeTargets(small), true)
    const largeMs = bestOf(makeTargets(large), true)
    const ratio = largeMs / Math.max(0.001, smallMs)

    // Streaming is measured on a bigger pair: at these sizes its absolute times
    // are only a few milliseconds, so a ratio over 800/3200 is mostly noise.
    const streamSmallMs = bestOf(makeTargets(large), false)
    const streamLargeMs = bestOf(makeTargets(12_800), false)
    const streamRatio = streamLargeMs / Math.max(0.001, streamSmallMs)

    // Logged only: the token rewrite still grows faster than linear at this size
    // (it splices a growing token array once per folded link), which is a
    // separate cost from the image-range scan fixed here.
    const tailMs = bestOf(makeTargets(12_800), true)

    console.log(
      `[unclosed-image-bench] final ${small}=${smallMs.toFixed(1)}ms ${large}=${largeMs.toFixed(1)}ms ratio=${ratio.toFixed(2)}x (4x input)`,
    )
    console.log(
      `[unclosed-image-bench] stream ${large}=${streamSmallMs.toFixed(1)}ms 12800=${streamLargeMs.toFixed(1)}ms ratio=${streamRatio.toFixed(2)}x (4x input)`,
    )
    console.log(`[unclosed-image-bench] final 12800=${tailMs.toFixed(1)}ms (logged only)`)

    // Quadratic growth gives ~12-16x for 4x the input; linear gives ~4x. The
    // threshold leaves room for timing noise on a shared CI machine while still
    // rejecting the quadratic curve.
    expect(ratio).toBeLessThan(8)
    expect(streamRatio).toBeLessThan(8)
  }, 120_000)
})
