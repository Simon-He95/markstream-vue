import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import { readSyntheticLinkOrigin } from '../src/plugins/linkTokenMetadata'

function buildLargeAppendFriendlyDoc(paragraphs: number) {
  return `${Array.from(
    { length: paragraphs },
    (_, index) => `Paragraph ${index + 1} with enough text to keep this document above the stream optimization threshold.`,
  ).join('\n\n')}\n\n`
}

function buildMixedSection(index: number) {
  return [
    `### Section ${index}`,
    '',
    `Paragraph ${index} with **strong** text and \`inline code\`.`,
    '',
    `- item ${index}.1`,
    `- item ${index}.2`,
    '',
    `> Quote ${index}`,
    '',
    '```ts',
    `const value${index} = ${index}`,
    '```',
    '',
    '| Name | Value |',
    '| - | -: |',
    `| row ${index} | ${index} |`,
    '',
    '$$',
    `x_${index}^2`,
    '$$',
    '',
  ].join('\n')
}

function getStreamStats(md: ReturnType<typeof getMarkdown>) {
  return (md as any).stream.stats()
}

function deepFreeze(value: unknown, seen = new WeakSet<object>()) {
  if (!value || typeof value !== 'object')
    return value

  const object = value as object
  if (seen.has(object))
    return value

  seen.add(object)

  for (const key of Reflect.ownKeys(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)
    if (descriptor && 'value' in descriptor)
      deepFreeze(descriptor.value, seen)
  }

  return Object.freeze(object)
}

describe('parseMarkdownToStructure stream parser integration', () => {
  it('uses markdown-it-ts stream.parse for top-level append-heavy parses', () => {
    const md = getMarkdown('stream-parser-top-level')
    ;(md as any).stream.resetStats()

    const first = buildLargeAppendFriendlyDoc(40)
    const second = `${first}Appended paragraph that should take the stream append path.\n\n`

    parseMarkdownToStructure(first, md)
    parseMarkdownToStructure(second, md)

    const stats = getStreamStats(md)
    expect(stats.total).toBe(2)
    expect(stats.appendHits + stats.tailHits + stats.cacheHits).toBeGreaterThan(0)
    expect(stats.fullParses).toBe(1)
    expect(stats.lastMode).not.toBe('full')
  })

  it('does not reprocess the stable top-level token prefix after stream append hits', () => {
    const md = getMarkdown('stream-parser-structured-tail-reuse')
    ;(md as any).stream.resetStats()

    const timing: {
      processTokensInputTokens?: number
      processTokensReusedTopLevelNodes?: number
    } = {}
    let markdown = buildLargeAppendFriendlyDoc(40)

    parseMarkdownToStructure(markdown, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)

    for (let index = 40; index < 160; index++) {
      markdown += `Paragraph ${index + 1} with enough text to keep this document above the stream optimization threshold.\n\n`
      parseMarkdownToStructure(markdown, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
        parserMetrics: timing,
      } as any)
    }

    const finalTokenCount = (md as any).stream.peek().length
    const stats = getStreamStats(md)

    expect(stats.appendHits + stats.tailHits).toBeGreaterThan(0)
    expect(timing.processTokensInputTokens).toBeLessThanOrEqual(finalTokenCount * 4)
    expect(timing.processTokensReusedTopLevelNodes).toBeGreaterThan(0)
  })

  it('skips reusable-token eligibility scans when structured reuse is disabled', () => {
    const md = getMarkdown('stream-parser-disabled-structured-reuse-scan')
    let eligibilityScans = 0
    ;(md as any).core.ruler.after('fix_link_tokens', 'track_reusable_token_scans', (state: any) => {
      for (const inline of state.tokens?.filter((token: any) => token.type === 'inline') ?? []) {
        const children = inline.children
        if (!Array.isArray(children))
          continue
        children.every = (...args: any[]) => {
          eligibilityScans++
          return Array.prototype.every.apply(children, args as any)
        }
      }
    })

    const source = `${buildLargeAppendFriendlyDoc(40)}[link](https://example.com)\n\n`
    parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    })
    parseMarkdownToStructure(source, md, {
      final: true,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)

    expect(eligibilityScans).toBe(0)
  })

  it('reuses stable prefixes containing explicit markdown links', () => {
    const md = getMarkdown('stream-parser-link-prefix-reuse')
    const coldMd = getMarkdown('stream-parser-link-prefix-reuse-cold')
    const base = `${Array.from(
      { length: 40 },
      (_, index) => `Paragraph ${index + 1} with [link ${index + 1}](/guide/${index + 1})`,
    ).join('\n\n')}\n\n`
    const first = parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const source = `${base}Appended paragraph with [another link](/guide/next)\n\n`
    const second = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)

    expect(second).toEqual(parseMarkdownToStructure(source, coldMd, {
      final: false,
      streamParse: false,
    }))
    expect(timing.processTokensReusedTopLevelNodes).toBe(40)
    expect(second[0]).toBe(first[0])
    expect(second[39]).toBe(first[39])
  })

  it('invalidates structured reuse when the effective link validator changes', () => {
    const md = getMarkdown('stream-parser-validate-link-invalidation')
    const coldMd = getMarkdown('stream-parser-validate-link-invalidation-cold')
    const allowLinks = () => true
    const denyLinks = () => false
    const base = `[external](https://example.com)\n\n${buildLargeAppendFriendlyDoc(40)}`
    const first = parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      validateLink: allowLinks,
      reuseStableTopLevelNodes: true,
    } as any)
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const source = `${base}Appended paragraph.\n\n`
    const second = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      validateLink: denyLinks,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)

    expect(second).toEqual(parseMarkdownToStructure(source, coldMd, {
      final: false,
      streamParse: false,
      validateLink: denyLinks,
    }))
    expect(second[0]).not.toBe(first[0])
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
  })

  it('does not reuse linked prefixes when a validator changes behavior', () => {
    const md = getMarkdown('stream-parser-mutable-validate-link')
    const coldMd = getMarkdown('stream-parser-mutable-validate-link-cold')
    let allowLinks = true
    const validateLink = () => allowLinks
    const base = `[external](https://example.com)\n\n${buildLargeAppendFriendlyDoc(40)}`
    const first = parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      validateLink,
      reuseStableTopLevelNodes: true,
    } as any)

    allowLinks = false
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const source = `${base}Appended paragraph.\n\n`
    const second = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      validateLink,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)

    expect(second).toEqual(parseMarkdownToStructure(source, coldMd, {
      final: false,
      streamParse: false,
      validateLink,
    }))
    expect(second[0]).not.toBe(first[0])
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
  })

  it('reuses origin-tagged explicit synthetic links', () => {
    const installCustomLinkMeta = (md: ReturnType<typeof getMarkdown>) => {
      ;(md as any).core.ruler.after('fix_link_tokens', 'add_custom_synthetic_link_meta', (state: any) => {
        for (const token of state.tokens?.flatMap((token: any) => token.children ?? []) ?? []) {
          if (token.type === 'link')
            token.meta = { customId: 'abc' }
        }
      })
    }
    const md = getMarkdown('stream-parser-explicit-synthetic-link-reuse')
    const coldMd = getMarkdown('stream-parser-explicit-synthetic-link-reuse-cold')
    installCustomLinkMeta(md)
    installCustomLinkMeta(coldMd)
    const base = `${Array.from(
      { length: 40 },
      (_, index) => `Paragraph ${index + 1} with [link ${index + 1}](/guide/${index + 1}).`,
    ).join('\n\n')}\n\n`
    const first = parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    const inline = (md as any).stream.peek().find((token: any) => token.type === 'inline')
    const synthetic = inline?.children?.find((token: any) => token.type === 'link')
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const source = `${base}Appended paragraph.\n\n`
    const second = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)

    expect(readSyntheticLinkOrigin(synthetic)).toBe('explicit')
    expect(synthetic?.meta).toEqual({ customId: 'abc' })
    expect(Object.prototype.propertyIsEnumerable.call(synthetic, 'meta')).toBe(true)
    expect({ ...synthetic }.meta).toEqual({ customId: 'abc' })
    expect(Object.assign({}, synthetic).meta).toEqual({ customId: 'abc' })
    expect(JSON.stringify(synthetic)).toContain('"customId":"abc"')
    expect(JSON.stringify(synthetic)).not.toContain('markstreamLinkOrigin')
    expect(JSON.stringify(first)).not.toContain('markstreamLinkOrigin')
    expect(second).toEqual(parseMarkdownToStructure(source, coldMd, {
      final: false,
      streamParse: false,
    }))
    expect(timing.processTokensReusedTopLevelNodes).toBe(40)
    expect(second[0]).toBe(first[0])
    expect(second[39]).toBe(first[39])
  })

  it('does not reuse linkify-derived synthetic links', () => {
    const installSyntheticLinkifyToken = (md: ReturnType<typeof getMarkdown>) => {
      ;(md as any).core.ruler.before('fix_link_tokens', 'test_synthetic_linkify_reuse', (state: any) => {
        const inline = state.tokens?.find((token: any) =>
          token.type === 'inline' && token.content === 'SYNTHETIC_LINKIFY_CASE',
        )
        if (!inline)
          return

        inline.content = '[site](https://example.com) after'
        inline.children = [
          { type: 'text', content: '[site](', raw: '[site](' },
          { type: 'link_open', tag: 'a', nesting: 1, markup: 'linkify', attrs: [['href', 'https://example.com']] },
          { type: 'text', content: 'https://example.com', raw: 'https://example.com' },
          { type: 'link_close', tag: 'a', nesting: -1, markup: 'linkify' },
          { type: 'text', content: ') after', raw: ') after' },
        ]
      })
    }

    const md = getMarkdown('stream-parser-synthetic-linkify-reuse')
    const coldMd = getMarkdown('stream-parser-synthetic-linkify-reuse-cold')
    installSyntheticLinkifyToken(md)
    installSyntheticLinkifyToken(coldMd)

    const base = `SYNTHETIC_LINKIFY_CASE\n\n${buildLargeAppendFriendlyDoc(40)}`
    const first = parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const source = `${base}Appended paragraph.\n\n`
    const second = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)
    const synthetic = (md as any).stream.peek().find((token: any) => token.type === 'inline')?.children?.[0]

    expect(synthetic).toMatchObject({
      type: 'link',
      href: 'https://example.com',
      loading: false,
    })
    expect(readSyntheticLinkOrigin(synthetic)).toBe('explicit')
    expect(second).toEqual(parseMarkdownToStructure(source, coldMd, {
      final: false,
      streamParse: false,
    }))
    // The folded token takes its label from the hand-written `[site](` text in
    // front of the matched destination, so it records the explicit origin,
    // which is reusable for the same reason as a linkify-derived one.
    expect(second[0]).toBe(first[0])
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(41)
  })

  it('does not reuse link pairs with unknown markup', () => {
    const installUnknownLinkMarkup = (md: ReturnType<typeof getMarkdown>) => {
      ;(md as any).core.ruler.after('fix_link_tokens', 'test_unknown_link_markup', (state: any) => {
        for (const token of state.tokens?.flatMap((token: any) => token.children ?? []) ?? []) {
          if (token.type === 'link_open' || token.type === 'link_close')
            token.markup = 'future-link'
        }
      })
    }
    const md = getMarkdown('stream-parser-unknown-link-markup')
    const coldMd = getMarkdown('stream-parser-unknown-link-markup-cold')
    installUnknownLinkMarkup(md)
    installUnknownLinkMarkup(coldMd)
    const base = `${Array.from(
      { length: 40 },
      (_, index) => `Paragraph ${index + 1} with [link ${index + 1}](/guide/${index + 1})`,
    ).join('\n\n')}\n\n`
    const first = parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const source = `${base}Appended paragraph.\n\n`
    const second = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)

    expect(second).toEqual(parseMarkdownToStructure(source, coldMd, {
      final: false,
      streamParse: false,
    }))
    expect(second[0]).not.toBe(first[0])
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
  })

  it('keeps loading-link completion and final transition cold-parse equivalent', () => {
    const md = getMarkdown('stream-parser-loading-link-completion')
    const coldMd = getMarkdown('stream-parser-loading-link-completion-cold')
    const base = buildLargeAppendFriendlyDoc(40)
    const stages = [
      `${base}[x](http://a`,
      `${base}[x](http://a)`,
      `${base}[x](http://a)\n\nAppended paragraph.\n\n`,
    ]

    for (const [index, source] of stages.entries()) {
      const timing: { processTokensReusedTopLevelNodes?: number } = {}
      const streamed = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
        parserMetrics: timing,
      } as any)
      const cold = parseMarkdownToStructure(source, coldMd, {
        final: false,
        streamParse: false,
      })

      expect(streamed).toEqual(cold)
      if (index === 0) {
        const inlineChildren = (md as any).stream.peek().flatMap((token: any) => token.children ?? [])
        const synthetic = inlineChildren.find((token: any) => token.type === 'link')
        expect(JSON.stringify(streamed)).toContain('"loading":true')
        expect(readSyntheticLinkOrigin(synthetic)).toBe('explicit')
        expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
      }
    }

    const source = stages.at(-1)!
    expect(parseMarkdownToStructure(source, md, {
      final: true,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)).toEqual(parseMarkdownToStructure(source, coldMd, {
      final: true,
      streamParse: false,
    }))
  })

  it('does not reuse unresolved links when an appended definition changes them', () => {
    const md = getMarkdown('stream-parser-appended-reference-invalidation')
    const coldMd = getMarkdown('stream-parser-appended-reference-invalidation-cold')
    const base = `[label][target]\n\n${buildLargeAppendFriendlyDoc(40)}`
    const first = parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const source = `${base}[target]: https://example.com\n`
    const second = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)

    expect(second).toEqual(parseMarkdownToStructure(source, coldMd, {
      final: false,
      streamParse: false,
    }))
    expect(second[0]).not.toBe(first[0])
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
  })

  it('keeps every reusable dirty-tail result equivalent to a cold parse', () => {
    const md = getMarkdown('stream-parser-structured-tail-equivalence')
    const coldMd = getMarkdown('stream-parser-structured-tail-equivalence-cold')
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const base = `${buildLargeAppendFriendlyDoc(40)}Formatted **strong** and \`inline code\` paragraph.\n\n`
    const appended = [
      'Tail paragraph continues across chunk boundaries with ordinary words.',
      '',
      '# Stable heading',
      '',
      'Another paragraph remains visible while it is still arriving.',
    ].join('\n')

    for (let end = 7; end < appended.length + 7; end += 7) {
      const source = base + appended.slice(0, Math.min(end, appended.length))
      const streamed = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
        parserMetrics: timing,
      } as any)
      const cold = parseMarkdownToStructure(source, coldMd, {
        final: false,
        streamParse: false,
      })

      expect(streamed).toEqual(cold)
    }

    const finalSource = base + appended
    const streamedFinal = parseMarkdownToStructure(finalSource, md, { final: true })
    const coldFinal = parseMarkdownToStructure(finalSource, coldMd, {
      final: true,
      streamParse: false,
    })

    expect(timing.processTokensReusedTopLevelNodes).toBeGreaterThan(0)
    expect(streamedFinal).toEqual(coldFinal)
  })

  it('keeps progressive mixed top-level group reuse equivalent to a cold parse', () => {
    const md = getMarkdown('stream-parser-mixed-progressive-equivalence')
    const coldMd = getMarkdown('stream-parser-mixed-progressive-equivalence-cold')
    const timing: {
      processTokensInputTokens?: number
      processTokensReusedTopLevelNodes?: number
    } = {}
    const markdown = Array.from({ length: 8 }, (_, index) => buildMixedSection(index + 1)).join('')

    for (let end = 37; end < markdown.length + 37; end += 37) {
      const source = markdown.slice(0, Math.min(end, markdown.length))
      const streamed = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
        parserMetrics: timing,
      } as any)
      const cold = parseMarkdownToStructure(source, coldMd, {
        final: false,
        streamParse: false,
      })

      expect(streamed).toEqual(cold)
    }

    expect(timing.processTokensReusedTopLevelNodes).toBeGreaterThan(0)
  })

  it.each([
    ['unordered list', '- item', 'list'],
    ['ordered list', '1. item', 'list'],
    ['table header', '| A | B |\n', 'table'],
  ])('keeps an early %s prediction equivalent to a cold parse', (_, tail, expectedType) => {
    const md = getMarkdown(`stream-parser-early-${expectedType}`)
    const coldMd = getMarkdown(`stream-parser-early-${expectedType}-cold`)
    const base = buildLargeAppendFriendlyDoc(40)
    let source = base

    parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)

    for (const char of tail) {
      source += char
      const streamed = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      } as any)
      const cold = parseMarkdownToStructure(source, coldMd, {
        final: false,
        streamParse: false,
      })

      expect(streamed).toEqual(cold)
    }

    const nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    expect(nodes.at(-1)?.type).toBe(expectedType)
  })

  it.each([true, false])('continues a list after an ambiguous rule with structured reuse=%s', (reuseStableTopLevelNodes) => {
    for (const [marker, pending, completed] of [
      ['*', '* **', '* **bold** item\n'],
      ['*', '* * *', '* * *text* item\n'],
      ['-', '- --', '- --text item\n'],
      ['-', '- - -', '- - -text item\n'],
    ]) {
      const md = getMarkdown(`stream-parser-rule-list-${pending}-${reuseStableTopLevelNodes}`)
      const coldMd = getMarkdown(`stream-parser-rule-list-cold-${pending}-${reuseStableTopLevelNodes}`)
      const base = `${buildLargeAppendFriendlyDoc(40)}${marker} first\n${marker} second\n`
      let source = base
      for (const tail of ['', pending, completed, `${completed}${marker} next\n`, `${completed}${marker} next\n\nEnd\n\n`]) {
        source = base + tail
        const streamed = parseMarkdownToStructure(source, md, {
          final: false,
          streamParse: true,
          reuseStableTopLevelNodes,
        })
        expect(streamed).toEqual(parseMarkdownToStructure(source, coldMd, { final: false, streamParse: false }))
      }
      const timing: { processTokensReusedTopLevelNodes?: number } = {}
      source += 'Another paragraph\n\n'
      const appended = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes,
        parserMetrics: timing,
      })
      expect(appended).toEqual(parseMarkdownToStructure(source, coldMd, { final: false, streamParse: false }))
      if (reuseStableTopLevelNodes)
        expect(timing.processTokensReusedTopLevelNodes).toBeGreaterThan(0)
      expect(parseMarkdownToStructure(source, md, { final: true, streamParse: true, reuseStableTopLevelNodes }))
        .toEqual(parseMarkdownToStructure(source, coldMd, { final: true, streamParse: false }))
    }
  })

  it.each([
    ['paragraph', 'A paragraph\n', '***'],
    ['bullet list', '* first\n* second\n', '***'],
    ['ordered list', '1. first\n2. second\n', '---'],
    ['blockquote', '> A quote\n', '___'],
  ])('reopens a %s when a partial rule becomes lazy paragraph text', (_name, block, rule) => {
    for (const reuseStableTopLevelNodes of [true, false]) {
      const md = getMarkdown(`stream-parser-lazy-rule-${_name}-${reuseStableTopLevelNodes}`)
      const coldMd = getMarkdown(`stream-parser-lazy-rule-cold-${_name}-${reuseStableTopLevelNodes}`)
      const base = buildLargeAppendFriendlyDoc(40) + block
      for (const source of [base, base + rule, `${base}${rule}text\n`, `${base}${rule}text\n\nDone\n\n`]) {
        const streamed = parseMarkdownToStructure(source, md, { final: false, streamParse: true, reuseStableTopLevelNodes })
        expect(streamed).toEqual(parseMarkdownToStructure(source, coldMd, { final: false, streamParse: false }))
      }
      const source = `${base}${rule}text\n\nDone\n\n`
      expect(parseMarkdownToStructure(source, md, { final: true, streamParse: true, reuseStableTopLevelNodes }))
        .toEqual(parseMarkdownToStructure(source, coldMd, { final: true, streamParse: false }))
    }
  })

  it('preserves a completed rule and a change of bullet marker', () => {
    const md = getMarkdown('stream-parser-rule-stays-rule')
    const coldMd = getMarkdown('stream-parser-rule-stays-rule-cold')
    const base = `${buildLargeAppendFriendlyDoc(40)}* first\n* second\n* **`
    for (const tail of ['', '\n\n* next\n', '\n\n* next\n- different marker\n']) {
      const source = base + tail
      const streamed = parseMarkdownToStructure(source, md, { final: false, streamParse: true, reuseStableTopLevelNodes: true })
      expect(streamed).toEqual(parseMarkdownToStructure(source, coldMd, { final: false, streamParse: false }))
      expect(streamed.some(node => node.type === 'thematic_break')).toBe(true)
    }
  })

  it.each(['*', '-'])('keeps a different %s bullet list separate when a rule becomes a list', (marker) => {
    const previousMarker = marker === '*' ? '-' : '*'
    const md = getMarkdown(`stream-parser-rule-different-marker-${marker}`)
    const base = `${buildLargeAppendFriendlyDoc(40)}${previousMarker} first\n${previousMarker} second\n${marker} ${marker}${marker}`
    const first = parseMarkdownToStructure(base, md, { final: false, streamParse: true, reuseStableTopLevelNodes: true })
    const source = `${base}text${marker}${marker} item\n`
    const appended = parseMarkdownToStructure(source, md, { final: false, streamParse: true, reuseStableTopLevelNodes: true })
    const cold = parseMarkdownToStructure(source, getMarkdown(`stream-parser-rule-different-marker-cold-${marker}`), { final: false, streamParse: false })

    expect(appended).toEqual(cold)
    expect(appended.filter(node => node.type === 'list')).toHaveLength(2)
    expect(appended.find(node => node.type === 'list')).toBe(first.find(node => node.type === 'list'))
  })

  it('reprocesses the previous last group when content becomes mixed', () => {
    const md = getMarkdown('stream-parser-mixed-last-group-overlap')
    const base = 'alpha\n\nbeta\n\n'
    const first = parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const second = parseMarkdownToStructure(`${base}- one\n- two\n\n`, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)

    expect(second[0]).toBe(first[0])
    expect(second[1]).not.toBe(first[1])
    expect(timing.processTokensReusedTopLevelNodes).toBe(1)
  })

  it('falls back instead of losing cross-block linkify context', () => {
    const md = getMarkdown('stream-parser-mixed-linkify-context')
    const base = '# Assets\n\n- docs below\n\nFiles:\n\n'

    parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    parseMarkdownToStructure(`${base}foo.md\n\n`, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)

    const source = `${base}foo.md\n\nbar.md\n\n`
    const timing: {
      processTokensInputTokens?: number
      processTokensReusedTopLevelNodes?: number
    } = {}
    const streamed = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any) as any[]
    const cold = parseMarkdownToStructure(
      source,
      getMarkdown('stream-parser-mixed-linkify-context-cold'),
      { final: false, streamParse: false },
    ) as any[]

    expect(streamed).toEqual(cold)
    expect(streamed.find(node => node.raw === 'foo.md')?.children?.[0]?.type).toBe('text')
    expect(streamed.find(node => node.raw === 'bar.md')?.children?.[0]?.type).toBe('text')
    // The tail's linkify demotion tracker resumes from the stable-prefix
    // boundary context, so cross-block demotion context (Files:) is preserved
    // while the stable prefix is still reused.
    expect(timing.processTokensInputTokens).toBeLessThan((md as any).stream.peek().length)
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBeGreaterThan(0)
  })

  it('keeps a parenthesized bare link stable when its closing punctuation arrives', () => {
    const md = getMarkdown('stream-parser-fullwidth-link-boundary')
    const coldMd = getMarkdown('stream-parser-fullwidth-link-boundary-cold')
    const base = buildLargeAppendFriendlyDoc(40)
    const prefix = `${base}当前浏览器预览打开的是 **百度首页**（`
    const stages = [
      { suffix: 'https://www.baidu', types: ['text', 'strong', 'text', 'link'] },
      { suffix: 'https://www.baidu.com/', types: ['text', 'strong', 'text', 'link'] },
      { suffix: 'https://www.baidu.com/）', types: ['text', 'strong', 'text', 'link', 'text'] },
      { suffix: 'https://www.baidu.com/），搜索框', types: ['text', 'strong', 'text', 'link', 'text'] },
    ]

    for (const stage of stages) {
      const source = prefix + stage.suffix
      const streamed = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      } as any)
      const cold = parseMarkdownToStructure(source, coldMd, {
        final: false,
        streamParse: false,
      })
      const children = (streamed.at(-1) as any).children

      expect(streamed).toEqual(cold)
      expect(children.map((node: any) => node.type)).toEqual(stage.types)
      expect(children.find((node: any) => node.type === 'link')?.href).toBe(
        stage.suffix.includes('.com') ? 'https://www.baidu.com/' : 'https://www.baidu',
      )
    }

    expect(getStreamStats(md).tailHits).toBeGreaterThan(0)
    expect(getStreamStats(md).fullParses).toBe(1)
  })

  it('does not reuse mixed streaming nodes for a final sync parse', () => {
    const md = getMarkdown('stream-parser-mixed-final-fallback')
    const source = Array.from({ length: 4 }, (_, index) => buildMixedSection(index + 1)).join('')
    const streamed = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)
    const timing: {
      processTokensInputTokens?: number
      processTokensReusedTopLevelNodes?: number
    } = {}
    const finalNodes = parseMarkdownToStructure(source, md, {
      final: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)
    const coldFinal = parseMarkdownToStructure(
      source,
      getMarkdown('stream-parser-mixed-final-fallback-cold'),
      { final: true, streamParse: false },
    )

    expect(finalNodes).toEqual(coldFinal)
    expect(finalNodes[0]).not.toBe(streamed[0])
    expect(timing.processTokensInputTokens).toBeGreaterThan(0)
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
  })

  it('keeps mixed stable-prefix token conversion below a deterministic budget', () => {
    const md = getMarkdown('stream-parser-mixed-token-budget')
    const baselineMd = getMarkdown('stream-parser-mixed-token-budget-baseline')
    const timing: {
      processTokensInputTokens?: number
      processTokensReusedTopLevelNodes?: number
    } = {}
    const baselineTiming: { processTokensInputTokens?: number } = {}
    let source = ''

    for (let index = 1; index <= 40; index++) {
      source += buildMixedSection(index)
      parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
        parserMetrics: timing,
      } as any)
      parseMarkdownToStructure(source, baselineMd, {
        final: false,
        streamParse: true,
        parserMetrics: baselineTiming,
      } as any)
    }

    expect(timing.processTokensReusedTopLevelNodes).toBeGreaterThan(0)
    expect(timing.processTokensInputTokens).toBeLessThan((baselineTiming.processTokensInputTokens ?? 0) * 0.15)
  })

  it('does not reuse parsed nodes for custom markdown-it plugins', () => {
    const countHeadings = (md: any) => {
      md.core.ruler.push('test_global_heading_count', (state: any) => {
        const headings = (state.tokens ?? []).filter((token: any) => token.type === 'heading_open')
        for (const token of headings)
          token.attrSet('data-total', String(headings.length))
      })
    }
    const buildHeadings = (count: number) => `${Array.from({ length: count }, (_, index) => `# Heading ${index + 1}`).join('\n\n')}\n\n`
    const md = getMarkdown('stream-parser-custom-plugin-nodes', { plugin: [countHeadings] })
    const firstSource = buildHeadings(40)

    parseMarkdownToStructure(firstSource, md, { final: false, streamParse: true })

    const source = `${firstSource}# Heading 41\n\n`
    const timing: { processTokensReusedTopLevelNodes?: number } = {}
    const streamed = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      parserMetrics: timing,
    } as any) as any[]
    const cold = parseMarkdownToStructure(
      source,
      getMarkdown('stream-parser-custom-plugin-nodes-cold', { plugin: [countHeadings] }),
      { final: false, streamParse: false },
    ) as any[]

    expect(streamed).toEqual(cold)
    expect(streamed[0]?.attrs?.['data-total']).toBe('41')
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
  })

  it('does not retain caller mutations in public parser results', () => {
    const md = getMarkdown('stream-parser-result-mutation')
    const firstSource = buildLargeAppendFriendlyDoc(40)
    const first = parseMarkdownToStructure(firstSource, md, {
      final: false,
      streamParse: true,
    }) as any[]

    first[0].raw = 'caller mutation'
    first[0].children[0].content = 'caller mutation'

    const source = `${firstSource}Appended paragraph.\n\n`
    const streamed = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    })
    const cold = parseMarkdownToStructure(
      source,
      getMarkdown('stream-parser-result-mutation-cold'),
      { final: false, streamParse: false },
    )

    expect(streamed).toEqual(cold)
  })

  it.each([
    ['image', '![alt](https://example.com/image.png)\n\n'],
    ['html', '<div>raw</div>\n\n'],
    ['reference', '[ref]: https://example.com\n'],
  ])('handles appended content containing a %s consistently with a cold parse', (kind, appended) => {
    const md = getMarkdown(`stream-parser-structured-tail-${kind}-fallback`)
    const base = buildLargeAppendFriendlyDoc(40)

    parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)

    const source = base + appended
    const timing: {
      processTokensInputTokens?: number
      processTokensReusedTopLevelNodes?: number
    } = {}
    const streamed = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
    } as any)
    const cold = parseMarkdownToStructure(
      source,
      getMarkdown(`stream-parser-structured-tail-${kind}-fallback-cold`),
      { final: false, streamParse: false },
    )

    expect(streamed).toEqual(cold)
    if (kind === 'image' || kind === 'html') {
      // Images are deterministic per inline group; the stable prefix stays
      // reusable. Top-level html_block became reusable too: its node output is
      // a deterministic function of the token group, and the mergeSplit/
      // combine passes update the reused prefix nodes in place (identical to a
      // cold full parse), so the stable prefix stays reusable.
      expect(timing.processTokensReusedTopLevelNodes ?? 0).toBeGreaterThan(0)
      expect(timing.processTokensInputTokens).toBeLessThan((md as any).stream.peek().length)
    }
    else {
      expect(timing.processTokensInputTokens).toBe((md as any).stream.peek().length)
      expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
    }
    if (kind === 'reference')
      expect(getStreamStats(md).lastMode).toBe('full')
  })

  it('falls back to full node processing when token transforms are present', () => {
    const md = getMarkdown('stream-parser-structured-tail-transform-fallback')
    const base = buildLargeAppendFriendlyDoc(40)

    parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    } as any)

    const source = `${base}Transformed append.\n\n`
    const timing: {
      processTokensInputTokens?: number
      processTokensReusedTopLevelNodes?: number
    } = {}
    let transformCalls = 0
    const streamed = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
      parserMetrics: timing,
      preTransformTokens(tokens) {
        transformCalls++
        return tokens
      },
    } as any)

    expect(streamed).toEqual(parseMarkdownToStructure(
      source,
      getMarkdown('stream-parser-structured-tail-transform-fallback-cold'),
      { final: false, streamParse: false },
    ))
    expect(transformCalls).toBe(1)
    expect(timing.processTokensInputTokens).toBe((md as any).stream.peek().length)
    expect(timing.processTokensReusedTopLevelNodes ?? 0).toBe(0)
  })

  it('resolves references in appended content when reference definitions already exist', () => {
    const md = getMarkdown('stream-parser-reference-append-global-state')
    ;(md as any).stream.resetStats()

    const first = `[ref]: https://example.com\n\n${buildLargeAppendFriendlyDoc(40)}`
    const second = `${first}append: [x][ref]\n`

    parseMarkdownToStructure(first, md, { streamParse: true })
    const streamed = parseMarkdownToStructure(second, md, { streamParse: true }) as any[]
    const sync = parseMarkdownToStructure(
      second,
      getMarkdown('stream-parser-reference-append-global-state-sync'),
      { streamParse: false },
    )

    const links: any[] = []
    const collectLinks = (node: any) => {
      if (!node)
        return
      if (node.type === 'link')
        links.push(node)
      for (const key of ['children', 'items']) {
        if (Array.isArray(node[key])) {
          for (const child of node[key])
            collectLinks(child)
        }
      }
    }

    for (const node of streamed)
      collectLinks(node)

    expect(streamed).toEqual(sync)
    expect(links.some(link => link.text === 'x' && link.href === 'https://example.com')).toBe(true)
    expect(getStreamStats(md).total).toBe(2)
  })

  it('allows callers to opt out of stream.parse', () => {
    const md = getMarkdown('stream-parser-opt-out')
    ;(md as any).stream.resetStats()

    parseMarkdownToStructure(buildLargeAppendFriendlyDoc(40), md, { streamParse: false })

    expect(getStreamStats(md).total).toBe(0)
    expect((md as any).stream.peek()).toHaveLength(0)
  })

  it('keeps final one-shot parses sync by default in auto mode', () => {
    const md = getMarkdown('stream-parser-final-auto')
    ;(md as any).stream.resetStats()

    parseMarkdownToStructure(buildLargeAppendFriendlyDoc(40), md, { final: true })

    expect(getStreamStats(md).total).toBe(0)
    expect((md as any).stream.peek()).toHaveLength(0)
  })

  it('clears stale non-final stream cache when final auto parse falls back to sync parse', () => {
    const md = getMarkdown('stream-parser-final-auto-cache-reset')
    const markdown = buildLargeAppendFriendlyDoc(40)

    parseMarkdownToStructure(markdown, md, { final: false })
    expect((md as any).stream.peek().length).toBeGreaterThan(0)

    parseMarkdownToStructure(markdown, md, { final: true })

    expect((md as any).stream.peek()).toHaveLength(0)
  })

  it('allows callers to force stream.parse for final parses', () => {
    const md = getMarkdown('stream-parser-final-force')
    ;(md as any).stream.resetStats()

    parseMarkdownToStructure(buildLargeAppendFriendlyDoc(40), md, { final: true, streamParse: true })

    expect(getStreamStats(md).total).toBe(1)
  })

  it('does not reuse the streaming env cache when final semantics change', () => {
    const md = getMarkdown('stream-parser-final-env-reset')
    ;(md as any).stream.resetStats()

    const markdown = '```ts\nconst a = 1\n'

    parseMarkdownToStructure(markdown, md, { final: false, streamParse: true })
    const before = getStreamStats(md)

    parseMarkdownToStructure(markdown, md, { final: true, streamParse: true })
    const after = getStreamStats(md)

    expect(after.fullParses).toBeGreaterThanOrEqual(before.fullParses + 1)
  })

  it('does not keep table loading after rows are appended through stream parse', () => {
    const md = getMarkdown('stream-table-loading-clear')
    const first = '| 姓名 | 年龄 | 职业 |\n| --- | --- |'
    const second = '| 姓名 | 年龄 | 职业 |\n| --- | --- | --- |\n| 张三 | 28 | 工程师 |\n| 李四 | 31 | 设计师 |\n\n'

    const partial = parseMarkdownToStructure(first, md, { final: false, streamParse: true }) as any[]
    expect(partial[0]?.type).toBe('table')
    expect(partial[0]?.loading).toBe(true)

    const full = parseMarkdownToStructure(second, md, { final: false, streamParse: true }) as any[]
    expect(full[0]?.type).toBe('table')
    expect(full[0]?.rows?.length).toBe(2)
    expect(full[0]?.loading).toBe(false)
    expect(full[0]?.rows?.[0]?.cells?.[0]?.children?.[0]?.content).toBe('张三')
  })

  it('does not duplicate the prefix when a loading table separator completes through tail reparse', () => {
    const md = getMarkdown('stream-table-loading-tail-reparse')
    ;(md as any).options.streamOptimizationMinSize = 1
    const prefix = '| P | Q |\n| - | - |\n| x | y |\n\n### Next\n\n'
    const first = `${prefix}| A | B |\n| ---`
    const second = `${first} | --- |\n| 1 | 2 |\n`

    expect(first).toHaveLength(56)
    expect(second).toHaveLength(75)

    const partial = parseMarkdownToStructure(first, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    }) as any[]
    expect(partial.at(-1)?.type).toBe('table')
    expect(partial.at(-1)?.loading).toBe(true)

    const actual = parseMarkdownToStructure(second, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    }) as any[]
    const cold = parseMarkdownToStructure(second, getMarkdown('stream-table-loading-tail-reparse-cold'), {
      final: false,
      streamParse: false,
    }) as any[]

    expect(getStreamStats(md).tailHits).toBeGreaterThan(0)
    expect(actual.map(node => node.type)).toEqual(['table', 'heading', 'table'])
    expect(actual).toEqual(cold)
  })

  it('clears table loading on final parse', () => {
    const md = getMarkdown('stream-table-final-loading-clear')
    const markdown = '| 姓名 | 年龄 | 职业 |\n| --- | --- | --- |\n'

    const nodes = parseMarkdownToStructure(markdown, md, {
      final: true,
      streamParse: true,
    }) as any[]

    expect(nodes[0]?.type).toBe('table')
    expect(nodes[0]?.loading).toBe(false)
  })

  it('parses shared-md documents correctly while streamParse opt-out avoids stream stats and cache', () => {
    const md = getMarkdown('stream-parser-shared-md-opt-out')
    const first = '# First\n\nAlpha paragraph.'
    const second = '# Second\n\n- beta\n- gamma\n'

    expect(JSON.stringify(parseMarkdownToStructure(first, md))).toContain('First')
    expect(JSON.stringify(parseMarkdownToStructure(second, md))).toContain('Second')

    ;(md as any).stream.reset()
    ;(md as any).stream.resetStats()

    const optOutFirst = parseMarkdownToStructure(first, md, { streamParse: false }) as any[]
    const optOutSecond = parseMarkdownToStructure(second, md, { streamParse: false }) as any[]

    expect(optOutFirst[0]?.type).toBe('heading')
    expect(JSON.stringify(optOutSecond)).toContain('gamma')
    expect(getStreamStats(md).total).toBe(0)
    expect((md as any).stream.peek()).toHaveLength(0)
  })

  it('keeps final-mode stream parses equivalent to sync parses after streaming same source', () => {
    const md = getMarkdown('stream-parser-final-switch')
    const markdown = [
      '```ts',
      'const value = 1',
      '',
      '<div>',
      '$$',
      'x + y',
    ].join('\n')

    parseMarkdownToStructure(markdown, md, { final: false })
    const streamedFinal = parseMarkdownToStructure(markdown, md, { final: true })
    const syncFinal = parseMarkdownToStructure(
      markdown,
      getMarkdown('stream-parser-final-switch-sync'),
      { final: true, streamParse: false },
    )

    expect(streamedFinal).toEqual(syncFinal)
  })

  it('does not let details fragment parsing overwrite the top-level stream cache', () => {
    const md = getMarkdown('stream-parser-fragments')
    ;(md as any).stream.resetStats()

    parseMarkdownToStructure(
      [
        '<details>',
        '<summary>Steps</summary>',
        '',
        '- one',
        '- two',
        '',
        '</details>',
      ].join('\n'),
      md,
      { final: true, streamParse: true },
    )

    expect(getStreamStats(md).total).toBe(1)
  })

  it('does not let generic html fragment parsing overwrite the top-level stream cache', () => {
    const md = getMarkdown('stream-parser-generic-html-fragments')
    ;(md as any).stream.resetStats()

    const nodes = parseMarkdownToStructure(
      [
        '<div>',
        '# Title',
        '- item',
        '</div>',
      ].join('\n'),
      md,
      { final: true, streamParse: true },
    ) as any[]

    expect(nodes[0]?.children?.length).toBeGreaterThan(0)
    expect(getStreamStats(md).total).toBe(1)
  })

  it('does not duplicate the paragraph before a streaming tolerant math block', () => {
    const md = getMarkdown('stream-parser-tolerant-math-boundary')
    const source = `${'Alpha '.repeat(20)}$$\n\\w`
    let nodes: any[] = []

    for (let end = 1; end <= source.length; end++) {
      nodes = parseMarkdownToStructure(source.slice(0, end), md, {
        final: false,
        streamParse: true,
      }) as any[]
    }

    const leadingParagraphs = nodes.filter(node => node.type === 'paragraph' && String(node.raw ?? '').startsWith('Alpha'))
    expect(leadingParagraphs).toHaveLength(1)
    expect(nodes.map(node => node.type)).toEqual(['paragraph', 'math_block'])
  })

  it('keeps long invalid dollar delimiter runs as plain text', () => {
    const md = getMarkdown('stream-parser-invalid-dollar-run')
    const source = `prefix ${'$'.repeat(1000)} suffix`
    const nodes = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]

    expect(JSON.stringify(nodes)).not.toContain('"type":"math_inline"')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('paragraph')
    expect(nodes[0]?.raw).toBe(source)
  })

  it('updates the top-level stream cache for standalone html documents', () => {
    const md = getMarkdown('stream-parser-standalone-html-document')
    ;(md as any).stream.resetStats()

    const nodes = parseMarkdownToStructure(
      [
        '<!doctype html>',
        '<html>',
        '<body><p>Cached document</p></body>',
        '</html>',
      ].join('\n'),
      md,
      { final: true, streamParse: true },
    ) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('html')
    expect(getStreamStats(md).total).toBe(1)
  })

  it('does not let cached stream tokens leak mutations into repeated parses', () => {
    const md = getMarkdown('stream-parser-token-clone')
    const markdown = [
      '<span>',
      '',
      '- alpha',
      '- beta',
      '',
      '</span>',
    ].join('\n')

    parseMarkdownToStructure(markdown, md, { final: true, streamParse: true })
    const second = parseMarkdownToStructure(markdown, md, { final: true, streamParse: true }) as any[]

    expect(second).toHaveLength(1)
    expect(second[0]?.type).toBe('html_block')
    expect(second[0]?.children).toHaveLength(1)
  })

  it('does not mutate cached stream tokens in markdown-link linkify fallback', () => {
    const md = getMarkdown('stream-parser-linkify-tail-no-mutation')
    ;(md as any).core.ruler.after('fix_link_tokens', 'test_linkify_markdown_tail_tokens', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (!inline)
        return

      inline.content = '[site](https://example.com) after'
      inline.children = [
        { type: 'text', content: '[site](', raw: '[site](' },
        { type: 'link_open', tag: 'a', nesting: 1, markup: 'linkify', attrs: [['href', 'https://example.com']] },
        { type: 'text', content: 'https://example.com', raw: 'https://example.com' },
        { type: 'link_close', tag: 'a', nesting: -1, markup: 'linkify' },
        { type: 'text', content: ') after', raw: ') after' },
      ]
    })

    const source = 'placeholder'
    const first = parseMarkdownToStructure(source, md, { final: false, streamParse: true }) as any[]
    const cachedInline = (md as any).stream.peek().find((token: any) => token.type === 'inline')
    const cachedTrailing = cachedInline?.children?.[4]

    expect(cachedTrailing?.content).toBe(') after')
    expect(cachedTrailing?.raw).toBe(') after')

    const second = parseMarkdownToStructure(source, md, { final: false, streamParse: true }) as any[]

    expect(getStreamStats(md).cacheHits).toBeGreaterThan(0)
    expect(second).toEqual(first)

    const serialized = JSON.stringify(second[0]?.children)
    expect(serialized).toContain('after')
    expect(serialized).not.toContain(') after')
  })

  it('preserves following markdown-link linkify fallback when close text starts another link', () => {
    const md = getMarkdown('stream-parser-linkify-chain-no-mutation')
    ;(md as any).core.ruler.after('fix_link_tokens', 'test_chained_markdown_linkify_tokens', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (!inline)
        return

      inline.content = '[a](https://a.com) [b](https://b.com)'
      inline.children = [
        { type: 'text', content: '[a](', raw: '[a](' },
        { type: 'link_open', tag: 'a', nesting: 1, markup: 'linkify', attrs: [['href', 'https://a.com']] },
        { type: 'text', content: 'https://a.com', raw: 'https://a.com' },
        { type: 'link_close', tag: 'a', nesting: -1, markup: 'linkify' },
        { type: 'text', content: ') [b](', raw: ') [b](' },
        { type: 'link_open', tag: 'a', nesting: 1, markup: 'linkify', attrs: [['href', 'https://b.com']] },
        { type: 'text', content: 'https://b.com', raw: 'https://b.com' },
        { type: 'link_close', tag: 'a', nesting: -1, markup: 'linkify' },
        { type: 'text', content: ')', raw: ')' },
      ]
    })

    const nodes = parseMarkdownToStructure('placeholder', md, {
      final: false,
      streamParse: true,
    }) as any[]
    const serialized = JSON.stringify(nodes)

    expect(serialized.match(/"type":"link"/g) ?? []).toHaveLength(2)
    expect(serialized).toContain('"href":"https://a.com"')
    expect(serialized).toContain('"href":"https://b.com"')
    expect(serialized).not.toContain('"href":""')
  })

  it('does not mutate frozen stream tokens during first-pass processing', () => {
    const md = getMarkdown('stream-parser-first-pass-freeze-no-mutation')
    ;(md as any).core.ruler.push('test_freeze_stream_tokens_after_plugins', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (!inline)
        return

      inline.content = '[site](https://example.com) after'
      inline.children = [
        { type: 'text', content: '[site](', raw: '[site](' },
        { type: 'link_open', tag: 'a', nesting: 1, markup: 'linkify', attrs: [['href', 'https://example.com']] },
        { type: 'text', content: 'https://example.com', raw: 'https://example.com' },
        { type: 'link_close', tag: 'a', nesting: -1, markup: 'linkify' },
        { type: 'text', content: ') after', raw: ') after' },
      ]
      deepFreeze(state.tokens)
    })

    let nodes: any[] = []
    expect(() => {
      nodes = parseMarkdownToStructure('placeholder', md, { final: false, streamParse: true }) as any[]
    }).not.toThrow()

    const serialized = JSON.stringify(nodes[0]?.children)
    expect(serialized).toContain('"href":"https://example.com"')
    expect(serialized).toContain('after')
    expect(serialized).not.toContain(') after')
  })

  it('does not mutate cached stream tokens during no-transform cache-hit processing', () => {
    const md = getMarkdown('stream-parser-cache-freeze-no-mutation')
    const source = [
      '1. [site](https://example.com) after',
      '2. **bold [link](https://example.com)**',
      '',
      '```html',
      '<antArtifact type="application/vnd.ant.react">x</antArtifact>',
      '```',
      '',
      '<details><summary>Hi</summary>Body</details>',
    ].join('\n')

    ;(md as any).stream.resetStats()

    const first = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    })

    deepFreeze((md as any).stream.peek())

    expect(() => {
      const second = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      })
      expect(second).toEqual(first)
    }).not.toThrow()

    expect(getStreamStats(md).cacheHits).toBeGreaterThan(0)
  })

  it('does not mutate cached list paragraph tokens when stripping leaked ordered-list markers', () => {
    const md = getMarkdown('stream-parser-list-jitter-no-mutation')
    ;(md as any).core.ruler.push('test_leaked_ordered_list_marker', (state: any) => {
      const inline = state.tokens?.find((token: any, index: number) => {
        return token.type === 'inline' && state.tokens?.[index - 1]?.type === 'paragraph_open'
      })
      if (!inline)
        return

      inline.content = 'alpha\n\n2.'
      inline.children = [
        { type: 'text', content: 'alpha', raw: 'alpha' },
        { type: 'softbreak', content: '', raw: '\n' },
        { type: 'softbreak', content: '', raw: '\n' },
        { type: 'text', content: '2.', raw: '2.' },
      ]
    })
    ;(md as any).stream.resetStats()

    const source = '1. alpha'
    const first = parseMarkdownToStructure(source, md, {
      final: false,
      streamParse: true,
    }) as any[]
    const cachedInline = (md as any).stream.peek().find((token: any) => token.type === 'inline')

    expect(first[0]?.items?.[0]?.children?.[0]?.raw).toBe('alpha')
    expect(cachedInline?.content).toBe('alpha\n\n2.')
    expect(cachedInline?.children?.at(-1)?.content).toBe('2.')

    deepFreeze((md as any).stream.peek())

    expect(() => {
      const second = parseMarkdownToStructure(source, md, {
        final: false,
        streamParse: true,
      })
      expect(second).toEqual(first)
    }).not.toThrow()

    expect(getStreamStats(md).cacheHits).toBeGreaterThan(0)
    expect(cachedInline?.content).toBe('alpha\n\n2.')
    expect(cachedInline?.children?.at(-1)?.content).toBe('2.')
  })

  it('does not clone stream tokens without transform hooks', () => {
    const md = getMarkdown('stream-parser-skip-token-clone')
    ;(md as any).core.ruler.push('test_large_token_meta', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (!inline)
        return

      inline.meta = {
        rows: Array.from({ length: 10000 }, (_, index) => {
          const row = {}
          Object.defineProperty(row, 'value', {
            enumerable: true,
            get() {
              if (index >= 250)
                throw new Error('large token meta should not be cloned')
              return index
            },
          })
          return row
        }),
      }
    })

    const timing: { tokenCloneMs?: number } = {}
    const nodes = parseMarkdownToStructure(buildLargeAppendFriendlyDoc(40), md, {
      streamParse: true,
      parserMetrics: timing,
    } as any) as any[]

    expect(nodes).toHaveLength(40)
    expect(timing.tokenCloneMs ?? 0).toBe(0)
  })

  it('deep-clones cached stream token object fields before transform hooks', () => {
    const md = getMarkdown('stream-parser-token-deep-clone')
    ;(md as any).core.ruler.push('test_nested_token_fields', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (!inline)
        return

      inline.meta = { nested: { value: 'cached' } }
      inline.custom = { state: { value: 'cached' } }
    })
    ;(md as any).stream.resetStats()

    const markdown = buildLargeAppendFriendlyDoc(40)
    const seenMeta: string[] = []
    const seenCustom: string[] = []
    let mutate = true

    const options = {
      preTransformTokens(tokens: any[]) {
        const inline = tokens.find(token => token.type === 'inline')
        seenMeta.push(inline?.meta?.nested?.value)
        seenCustom.push(inline?.custom?.state?.value)

        if (mutate) {
          inline.meta.nested.value = 'mutated'
          inline.custom.state.value = 'mutated'
        }

        return tokens
      },
    }

    parseMarkdownToStructure(markdown, md, options)
    mutate = false
    parseMarkdownToStructure(markdown, md, options)

    const stats = getStreamStats(md)
    expect(stats.cacheHits + stats.appendHits + stats.tailHits).toBeGreaterThan(0)
    expect(seenMeta).toEqual(['cached', 'cached'])
    expect(seenCustom).toEqual(['cached', 'cached'])
  })

  it('preserves symbol and non-enumerable token fields before transform hooks', () => {
    const tokenSymbol = Symbol('token-plugin-state')
    const md = getMarkdown('stream-parser-token-hidden-fields')
    ;(md as any).core.ruler.push('test_hidden_token_fields', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (!inline)
        return

      Object.defineProperty(inline, 'hiddenPluginState', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: { value: 'cached' },
      })
      inline[tokenSymbol] = { value: 'cached' }
    })
    ;(md as any).stream.resetStats()

    const markdown = buildLargeAppendFriendlyDoc(40)
    const seenHidden: unknown[] = []
    const seenSymbol: unknown[] = []
    const seenHiddenEnumerable: unknown[] = []
    let mutate = true

    const options = {
      preTransformTokens(tokens: any[]) {
        const inline = tokens.find(token => token.type === 'inline')
        seenHidden.push(inline?.hiddenPluginState?.value)
        seenSymbol.push(inline?.[tokenSymbol]?.value)
        seenHiddenEnumerable.push(Object.getOwnPropertyDescriptor(inline, 'hiddenPluginState')?.enumerable)

        if (mutate) {
          inline.hiddenPluginState.value = 'mutated'
          inline[tokenSymbol].value = 'mutated'
        }

        return tokens
      },
    }

    parseMarkdownToStructure(markdown, md, options)
    mutate = false
    parseMarkdownToStructure(markdown, md, options)

    const stats = getStreamStats(md)
    expect(stats.cacheHits + stats.appendHits + stats.tailHits).toBeGreaterThan(0)
    expect(seenHidden).toEqual(['cached', 'cached'])
    expect(seenSymbol).toEqual(['cached', 'cached'])
    expect(seenHiddenEnumerable).toEqual([false, false])
  })

  it('keeps non-plain token meta objects usable when cloning cached stream tokens', () => {
    const md = getMarkdown('stream-parser-map-meta')
    ;(md as any).core.ruler.push('test_map_meta', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (inline)
        inline.meta = { map: new Map([['k', 'v']]) }
    })

    const markdown = buildLargeAppendFriendlyDoc(40)
    let seen: unknown

    parseMarkdownToStructure(markdown, md, {
      preTransformTokens(tokens: any[]) {
        seen = tokens.find(token => token.type === 'inline')?.meta?.map?.get('k')
        return tokens
      },
    })

    expect(seen).toBe('v')
  })

  it('does not leak mutations to non-plain token meta objects', () => {
    const md = getMarkdown('stream-parser-map-mutation')
    ;(md as any).core.ruler.push('test_non_plain_meta', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (!inline)
        return

      const regexp = /cached/g
      regexp.lastIndex = 2
      inline.meta = {
        map: new Map([['k', 'cached']]),
        set: new Set(['cached']),
        date: new Date(123),
        regexp,
      }
    })
    ;(md as any).stream.resetStats()

    const markdown = buildLargeAppendFriendlyDoc(40)
    const seenMap: unknown[] = []
    const seenSet: unknown[] = []
    const seenDate: number[] = []
    const seenRegExpLastIndex: number[] = []
    let mutate = true

    const options = {
      preTransformTokens(tokens: any[]) {
        const meta = tokens.find(token => token.type === 'inline')?.meta
        seenMap.push(meta?.map?.get('k'))
        seenSet.push(Array.from(meta?.set ?? [])[0])
        seenDate.push(meta?.date?.getTime())
        seenRegExpLastIndex.push(meta?.regexp?.lastIndex)

        if (mutate) {
          meta?.map?.set('k', 'mutated')
          meta?.set?.clear()
          meta?.set?.add('mutated')
          meta?.date?.setTime(456)
          if (meta?.regexp)
            meta.regexp.lastIndex = 8
        }

        return tokens
      },
    }

    parseMarkdownToStructure(markdown, md, options)
    mutate = false
    parseMarkdownToStructure(markdown, md, options)

    const stats = getStreamStats(md)
    expect(stats.cacheHits + stats.appendHits + stats.tailHits).toBeGreaterThan(0)
    expect(seenMap).toEqual(['cached', 'cached'])
    expect(seenSet).toEqual(['cached', 'cached'])
    expect(seenDate).toEqual([123, 123])
    expect(seenRegExpLastIndex).toEqual([2, 2])
  })

  it('does not leak mutations to structured-cloneable class token meta objects', () => {
    class MutableMeta {
      value = 'cached'
    }

    const md = getMarkdown('stream-parser-class-meta-mutation')
    ;(md as any).core.ruler.push('test_custom_class_meta', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (inline)
        inline.meta = { custom: new MutableMeta() }
    })
    ;(md as any).stream.resetStats()

    const markdown = buildLargeAppendFriendlyDoc(40)
    const seen: string[] = []
    let mutate = true

    const options = {
      preTransformTokens(tokens: any[]) {
        const meta = tokens.find(token => token.type === 'inline')?.meta
        seen.push(meta?.custom?.value)
        if (mutate)
          meta.custom.value = 'mutated'
        return tokens
      },
    }

    parseMarkdownToStructure(markdown, md, options)
    mutate = false
    parseMarkdownToStructure(markdown, md, options)

    const stats = getStreamStats(md)
    expect(stats.cacheHits + stats.appendHits + stats.tailHits).toBeGreaterThan(0)
    expect(seen).toEqual(['cached', 'cached'])
  })

  it('preserves custom class token meta prototype when cloning cached stream tokens', () => {
    class CustomMeta {
      value = 'cached'

      getValue() {
        return this.value
      }
    }

    const md = getMarkdown('stream-parser-class-prototype')
    ;(md as any).core.ruler.push('test_class_meta', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (inline)
        inline.meta = { custom: new CustomMeta() }
    })

    let seenInstance = false
    let seenMethod = ''

    parseMarkdownToStructure(buildLargeAppendFriendlyDoc(40), md, {
      preTransformTokens(tokens: any[]) {
        const custom = tokens.find(token => token.type === 'inline')?.meta?.custom
        seenInstance = custom instanceof CustomMeta
        seenMethod = custom.getValue()
        return tokens
      },
    })

    expect(seenInstance).toBe(true)
    expect(seenMethod).toBe('cached')
  })

  it('does not create invalid clones for URL and Error token meta objects', () => {
    const md = getMarkdown('stream-parser-built-in-meta-clone')
    const promise = Promise.resolve('cached')
    ;(md as any).core.ruler.push('test_builtin_meta', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (inline) {
        inline.meta = {
          url: new URL('https://example.com/path?q=1'),
          error: new TypeError('cached error'),
          promise,
        }
      }
    })

    let seenUrl = ''
    let seenUrlQuery = ''
    let seenErrorMessage = ''
    let seenErrorInstance = false
    let seenPromise: unknown

    parseMarkdownToStructure(buildLargeAppendFriendlyDoc(40), md, {
      preTransformTokens(tokens: any[]) {
        const meta = tokens.find(token => token.type === 'inline')?.meta
        seenUrl = meta?.url?.toString()
        seenUrlQuery = meta?.url?.searchParams?.get('q')
        seenErrorMessage = meta?.error?.message
        seenErrorInstance = meta?.error instanceof TypeError
        seenPromise = meta?.promise
        return tokens
      },
    })

    expect(seenUrl).toBe('https://example.com/path?q=1')
    expect(seenUrlQuery).toBe('1')
    expect(seenErrorMessage).toBe('cached error')
    expect(seenErrorInstance).toBe(true)
    expect(seenPromise).toBe(promise)
  })

  it('does not leak mutations to non-structured-cloneable class token meta objects', () => {
    class NonStructuredCloneableMeta {
      value = 'cached'
      fn = () => 'x'
    }

    const md = getMarkdown('stream-parser-non-structured-class-meta-mutation')
    ;(md as any).core.ruler.push('test_non_structured_class_meta', (state: any) => {
      const inline = state.tokens?.find((token: any) => token.type === 'inline')
      if (inline)
        inline.meta = { custom: new NonStructuredCloneableMeta() }
    })
    ;(md as any).stream.resetStats()

    const markdown = buildLargeAppendFriendlyDoc(40)
    const seen: string[] = []
    let mutate = true

    const options = {
      preTransformTokens(tokens: any[]) {
        const meta = tokens.find(token => token.type === 'inline')?.meta
        seen.push(meta?.custom?.value)
        if (mutate)
          meta.custom.value = 'mutated'
        return tokens
      },
    }

    parseMarkdownToStructure(markdown, md, options)
    mutate = false
    parseMarkdownToStructure(markdown, md, options)

    const stats = getStreamStats(md)
    expect(stats.cacheHits + stats.appendHits + stats.tailHits).toBeGreaterThan(0)
    expect(seen).toEqual(['cached', 'cached'])
  })

  it('keeps stitched details consistent with a cold parse across fine-grained appends', () => {
    // Regression guard for the per-opener details stitch cache: a reused
    // (stable-prefix) details opener is keyed on explicitClose + closeSliceEnd
    // + middleSource, so an open->closed transition and a trailing line-ending
    // extension must invalidate the cached stitched node instead of returning a
    // stale (still-loading or short-raw) node.
    const md = getMarkdown('stream-parser-details-stitch-cache')
    const coldMd = getMarkdown('stream-parser-details-stitch-cache-cold')

    const base = `${buildLargeAppendFriendlyDoc(40)}\n\n`
    const tail = [
      '<details>',
      '<summary>Closed one</summary>',
      '',
      'Body **bold** with `code` inside.',
      '',
      '</details>',
      '',
      '<details open>',
      '<summary>Growing one</summary>',
      '',
      'This details stays open while streaming and only closes at the very end.',
      '',
      '</details>',
      '',
    ].join('\n')

    parseMarkdownToStructure(base, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    })

    // Small commits so `</details>` and its trailing newline land on separate
    // boundaries, exercising the open->closed and close-extension cache keys.
    const chunkSize = 7
    let current = base
    for (let i = 0; i < tail.length; i += chunkSize) {
      current = base + tail.slice(0, i + chunkSize)
      const streamed = parseMarkdownToStructure(current, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      })
      const cold = parseMarkdownToStructure(current, coldMd, {
        final: false,
        streamParse: false,
      })
      expect(streamed).toEqual(cold)
    }

    // final parse of the full document must also match a cold final parse
    const finalNodes = parseMarkdownToStructure(base + tail, md, {
      final: true,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    })
    const finalCold = parseMarkdownToStructure(base + tail, coldMd, {
      final: true,
      streamParse: false,
    })
    expect(finalNodes).toEqual(finalCold)
  })

  it('keeps split-opener details (summary committed in a later group) consistent with a cold parse', () => {
    // Regression guard: at fine commit granularity the stream can commit a
    // `<details>` opener as a stable group before its `<summary>` arrives,
    // freezing a partial opener fragment in the reuse cache. combine must
    // re-derive the content boundaries and the summary child from the source so
    // the streamed node matches a full parse (the summary must be structured,
    // not lost or emitted as a raw childless html_block).
    const md = getMarkdown('stream-parser-details-split-opener')
    const coldMd = getMarkdown('stream-parser-details-split-opener-cold')

    const sections = Array.from({ length: 60 }, (_, index) => {
      return [
        `## Section ${index}`,
        '',
        '<details open>',
        `<summary>Details ${index}</summary>`,
        '',
        `Inside details ${index} with a list:`,
        '',
        `- item a${index}`,
        `- item b${index}`,
        `- item c${index}`,
        '',
        '</details>',
        '',
      ].join('\n')
    }).join('\n')

    let current = ''
    const chunkSize = 128
    for (let i = 0; i < sections.length; i += chunkSize) {
      current = sections.slice(0, i + chunkSize)
      const streamed = parseMarkdownToStructure(current, md, {
        final: false,
        streamParse: true,
        reuseStableTopLevelNodes: true,
      })
      const cold = parseMarkdownToStructure(current, coldMd, {
        final: false,
        streamParse: false,
      })
      expect(streamed).toEqual(cold)
    }

    const finalNodes = parseMarkdownToStructure(sections, md, {
      final: true,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    })
    const finalCold = parseMarkdownToStructure(sections, coldMd, {
      final: true,
      streamParse: false,
    })
    expect(finalNodes).toEqual(finalCold)
  })
})
