import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function buildLargeAppendFriendlyDoc(paragraphs: number) {
  return `${Array.from(
    { length: paragraphs },
    (_, index) => `Paragraph ${index + 1} with enough text to keep this document above the stream optimization threshold.`,
  ).join('\n\n')}\n\n`
}

function getStreamStats(md: ReturnType<typeof getMarkdown>) {
  return (md as any).stream.stats()
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

  it('does not deep-clone stream tokens without transform hooks', () => {
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

    const nodes = parseMarkdownToStructure(buildLargeAppendFriendlyDoc(40), md, {
      streamParse: true,
    }) as any[]

    expect(nodes).toHaveLength(40)
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
})
