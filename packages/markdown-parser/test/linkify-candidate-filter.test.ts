import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function flatten(nodes: any[]): any[] {
  const output: any[] = []
  for (const node of nodes ?? []) {
    output.push(node)
    if (Array.isArray(node?.children))
      output.push(...flatten(node.children))
    if (Array.isArray(node?.items))
      output.push(...flatten(node.items))
  }
  return output
}

function parse(input: string) {
  return parseMarkdownToStructure(input, getMarkdown('linkify-candidate-filter'), { final: true }) as any[]
}

function links(input: string) {
  return flatten(parse(input)).filter(node => node?.type === 'link')
}

describe('linkify candidate filter', () => {
  it('keeps native initialization on the first streaming frame and after reconfiguration', () => {
    const md = getMarkdown('stream-linkify-initialization')
    const linkify = md.linkify as any
    parseMarkdownToStructure('## Heading\n\nPlain text.', md, { final: false })
    expect(linkify.re.cache.link_fuzzy_search).toBeDefined()
    linkify.set({ fuzzyLink: true })
    expect(linkify.re.cache.link_fuzzy_search).toBeUndefined()
    parseMarkdownToStructure('## Heading\n\nPlain text. More text.', md, { final: false })
    expect(linkify.re.cache.link_fuzzy_search).toBeDefined()
  })

  it('skips native regex construction for prose and leaves public methods unchanged', () => {
    const md = getMarkdown('plain-screen')
    const linkify = md.linkify as any
    const test = linkify.test
    parseMarkdownToStructure('A sentence. Another sentence.\nNext line.', md, { final: true })
    expect(linkify.re.cache.link_fuzzy_search).toBeUndefined()
    expect(linkify.re.cache.schema_search).toBeUndefined()
    expect(linkify.test).toBe(test)
  })

  it('preserves replaced test callbacks on seed-free text', () => {
    const md = getMarkdown('custom-test')
    const linkify = md.linkify as any
    let calls = 0
    linkify.test = () => {
      calls++
      return false
    }
    parseMarkdownToStructure('Plain text.', md, { final: true })
    expect(calls).toBe(1)
  })

  it('bypasses screening when the matcher is replaced', () => {
    const md = getMarkdown('custom-match')
    const linkify = md.linkify as any
    linkify.match = linkify.match.bind(linkify)
    parseMarkdownToStructure('Plain text.', md, { final: true })
    expect(linkify.re.cache.link_fuzzy_search).toBeDefined()
  })

  it('preserves linkify being enabled after factory construction', () => {
    const md = getMarkdown('disabled-linkify', { markdownItOptions: { linkify: false } })
    expect(flatten(parseMarkdownToStructure('example.com', md, { final: true })).filter(node => node.type === 'link')).toHaveLength(0)
    md.options.linkify = true
    const found = flatten(parseMarkdownToStructure('example.com', md, { final: true })).filter(node => node.type === 'link')
    expect(found.map(node => node.href)).toEqual(['http://example.com'])
  })

  it('matches the native filter on every streaming prefix and final commit', () => {
    const fixtures = [
      'A sentence. Another sentence.\n\n**Bold** and `code`.',
      '//localhost/path and user@example.com, example.com.',
      '中文.example.com，文件 README.md 和 https://例子.测试/a。',
      '[example.com](https://target.test) and <a href="https://target.test">example.com</a> then example.org',
      '| name | value |\n| - | - |\n| text. | 12 |\n| next | https://example.com |',
      'Before.\r\n\r\n$$\nx+y\n$$\n\n::: warning\nNo links.\n:::',
      '[label][ref]\n\n[ref]: https://example.com\n',
    ]
    for (const source of fixtures) {
      const optimized = getMarkdown('screened')
      const native = getMarkdown('native')
      const linkify = native.linkify as any
      const test = linkify.test
      // A replaced test method retains the original candidate-filter path.
      linkify.test = (text: string) => test.call(linkify, text)
      for (let end = 1; end <= source.length; end++) {
        expect(parseMarkdownToStructure(source.slice(0, end), optimized, { final: false }))
          .toEqual(parseMarkdownToStructure(source.slice(0, end), native, { final: false }))
      }
      expect(parseMarkdownToStructure(source, optimized, { final: true }))
        .toEqual(parseMarkdownToStructure(source, native, { final: true }))
    }
  })

  it('invalidates the screen after schema, TLD, option and builder changes', () => {
    const configure = [
      (linkify: any) => linkify.add('issue', { validate: (text: string, pos: number) => /^\d+/.exec(text.slice(pos))?.[0].length ?? 0 }),
      (linkify: any) => linkify.tlds(['$']),
      (linkify: any) => linkify.set({ tlds: ['$'] }),
      (linkify: any) => { linkify.re.get_fuzzy_link_search = () => /(^| )(magic)/gi },
      (linkify: any) => {
        const Builder = Object.getPrototypeOf(linkify.re).constructor
        class CustomBuilder extends Builder {
          get_fuzzy_link_search() { return /(^| )(magic)/gi }
        }
        linkify.re = new CustomBuilder(linkify.re.opts)
      },
    ]
    for (const change of configure) {
      const optimized = getMarkdown('configured-screen')
      const native = getMarkdown('configured-native')
      const nativeLinkify = native.linkify as any
      const test = nativeLinkify.test
      nativeLinkify.test = (text: string) => test.call(nativeLinkify, text)
      for (const md of [optimized, native]) {
        parseMarkdownToStructure('Plain text.', md, { final: true })
        change(md.linkify)
      }
      for (const source of ['issue123', 'foo.', 'magic', '//localhost/path']) {
        expect(parseMarkdownToStructure(source, optimized, { final: true }))
          .toEqual(parseMarkdownToStructure(source, native, { final: true }))
      }
    }
  })

  it('preserves configuration changes made by a validator within the same rule run', () => {
    const optimized = getMarkdown('mutating-validator')
    const native = getMarkdown('native-mutating-validator')
    const nativeLinkify = native.linkify as any
    const test = nativeLinkify.test
    nativeLinkify.test = (text: string) => test.call(nativeLinkify, text)
    for (const md of [optimized, native]) {
      const linkify = md.linkify as any
      linkify.add('trigger:', {
        validate: () => {
          linkify.add('issue', {
            validate: () => 3,
            normalize: (match: any) => { match.url = 'https://example.com/issue123' },
          })
          return 0
        },
      })
    }
    const source = 'trigger:noop\n\nissue123'
    const expected = parseMarkdownToStructure(source, native, { final: true })
    expect(flatten(expected).some(node => node.href === 'https://example.com/issue123')).toBe(true)
    expect(parseMarkdownToStructure(source, optimized, { final: true })).toEqual(expected)
  })

  it('linkifies ordinary bare links', () => {
    const found = links('Visit example.com now.')

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('http://example.com')
    expect(found[0].text).toBe('example.com')
  })

  it('stops a bare link at a fullwidth closing parenthesis', () => {
    const input = '当前浏览器预览打开的是 **百度首页**（https://www.baidu.com/），搜索框里已有提示文字「林俊杰带女友现身纽约看台」。'
    const found = links(input)

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('https://www.baidu.com/')
    expect(found[0].text).toBe('https://www.baidu.com/')
    expect(flatten(parse(input)).filter(node => node?.type === 'text').map(node => node.content).join('')).toContain('），搜索框里已有提示文字「林俊杰带女友现身纽约看台」。')
  })

  it('truncates bare links at fullwidth closing parenthesis (linkify-it@6)', () => {
    // linkify-it@6 treats U+FF09 ） as a path terminator for bare URLs.
    // Percent-encoded, angle-bracket, and markdown-link forms still preserve it.
    for (const [input, expectedHref] of [
      ['https://example.com/a）b', 'https://example.com/a'],
      ['https://example.com/a%EF%BC%89b', 'https://example.com/a%EF%BC%89b'],
      ['<https://example.com/a）b>', 'https://example.com/a%EF%BC%89b'],
      ['（<https://example.com/a）b>）', 'https://example.com/a%EF%BC%89b'],
      ['[label](https://example.com/a）b)', 'https://example.com/a%EF%BC%89b'],
    ]) {
      const found = links(input)

      expect(found).toHaveLength(1)
      expect(found[0].href).toBe(expectedHref)
    }
  })

  it('truncates bare links at fullwidth closing parenthesis in wrapped context (linkify-it@6)', () => {
    const input = '（https://example.com/a（x）b）after'
    const found = links(input)

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('https://example.com/a')
    expect(found[0].text).toBe('https://example.com/a')
    expect(flatten(parse(input)).filter(node => node?.type === 'text').map(node => node.content).join('')).toContain('）after')
  })

  it('truncates bare links before a percent-encoded suffix in wrapped context (linkify-it@6)', () => {
    const found = links('（https://example.com/a（x）b）%20after')

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('https://example.com/a')
    expect(found[0].text).toBe('https://example.com/a')
  })

  it('handles multiple parenthesized bare links in one inline block', () => {
    const found = links(Array.from(
      { length: 32 },
      (_, index) => `（https://example.com/${index}）`,
    ).join(' '))

    expect(found).toHaveLength(32)
    expect(found.map(link => link.href)).toEqual(Array.from(
      { length: 32 },
      (_, index) => `https://example.com/${index}`,
    ))
  })

  it('truncates wrapped bare links at fullwidth closing parenthesis (linkify-it@6)', () => {
    const found = links('（https://one.test/） and https://two.test/a）b')

    expect(found).toHaveLength(2)
    expect(found.map(link => link.href)).toEqual([
      'https://one.test/',
      'https://two.test/a',
    ])
  })

  it('stops a wrapped bare link when the paragraph also contains inline code', () => {
    const input = '`note`（https://www.baidu.com/）'
    const found = links(input)

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('https://www.baidu.com/')
    expect(found[0].text).toBe('https://www.baidu.com/')
  })

  it('truncates bare links at fullwidth closing parenthesis after angle-bracket links (linkify-it@6)', () => {
    const found = links('<https://one.test/a（b> and https://two.test/c）d')

    expect(found).toHaveLength(2)
    expect(found.map(link => link.href)).toEqual([
      'https://one.test/a%EF%BC%88b',
      'https://two.test/c',
    ])
  })

  it('does not linkify bare links inside markdown link labels', () => {
    const found = links('[example.com](https://target.test)')

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('https://target.test')
    expect(found[0].text).toBe('example.com')
  })

  it('does not linkify bare links inside html anchors', () => {
    const found = links('<a href="https://target.test">example.com</a>')

    expect(found).toHaveLength(1)
    expect(found[0].href).toBe('https://target.test')
    expect(found[0].text).toBe('example.com')
  })

  it('still linkifies bare links after html anchors in the same inline token', () => {
    const found = links('<a href="https://target.test">example.com</a> and example.org')

    expect(found.map(link => link.href)).toEqual([
      'https://target.test',
      'http://example.org',
    ])
  })

  it('leaves paragraphs without bare links as text', () => {
    const nodes = parse('This is plain text without autolinks.')
    const found = flatten(nodes)

    expect(found.filter(node => node?.type === 'link')).toHaveLength(0)
    expect(found.filter(node => node?.type === 'text').map(node => node.content).join('')).toBe('This is plain text without autolinks.')
  })
})
