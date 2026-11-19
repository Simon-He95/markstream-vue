import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const md = getMarkdown('final-loading-placeholders')

function childrenOf(input: string, final: boolean) {
  const nodes = parseMarkdownToStructure(input, md, { final }) as any[]
  expect(nodes).toHaveLength(1)
  return (nodes[0] as any).children as any[]
}

function describeNode(node: any): string {
  if (node?.type === 'text')
    return `text(${node.content})`
  if (node?.type === 'image')
    return `image(src=${node.src},loading=${node.loading})`
  if (node?.type === 'link')
    return `link(loading=${node.loading})`
  return String(node?.type)
}

function collectKeys(nodes: any[]): string[] {
  const keys: string[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object')
      return
    keys.push(...Object.keys(node))
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        value.forEach(walk)
      else if (value && typeof value === 'object')
        walk(value)
    }
  }
  nodes.forEach(walk)
  return keys
}

function findLoading(nodes: any[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if ((node?.type === 'image' || node?.type === 'link') && node.loading)
      out.push(describeNode(node))
    if (Array.isArray(node?.children))
      out.push(...findLoading(node.children))
    if (Array.isArray(node?.items))
      out.push(...findLoading(node.items))
    if (Array.isArray(node?.rows))
      out.push(...node.rows.flatMap((row: any) => findLoading(row?.cells ?? [])))
  }
  return out
}

function findFirst(nodes: any[], predicate: (node: any) => boolean): any {
  for (const node of nodes) {
    if (!node || typeof node !== 'object')
      continue
    if (predicate(node))
      return node
    for (const key of ['children', 'items']) {
      const found = Array.isArray(node[key]) ? findFirst(node[key], predicate) : undefined
      if (found)
        return found
    }
  }
  return undefined
}

function findLinks(nodes: any[]): any[] {
  const out: any[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object')
      return
    if (node.type === 'link')
      out.push(node)
    if (Array.isArray(node.children))
      node.children.forEach(walk)
    if (Array.isArray(node.items))
      node.items.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

/**
 * A link may only be clickable when its label names its own destination, so a
 * reader cannot be sent somewhere the visible text does not say.
 */
function labelNamesOwnDestination(link: any) {
  const text = String(link.text ?? '')
  const href = String(link.href ?? '')
  if (!text || !href)
    return true
  const shape = (value: string) => {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `http://${value}`)
      return url.protocol === 'mailto:'
        ? `mailto:${url.pathname}`
        : `${url.host}${url.pathname}${url.search}${url.hash}`
    }
    catch {
      return null
    }
  }
  const label = shape(text)
  return label === null || label === shape(href)
}

/** The text a reader sees: text content, a link label once, math with its delimiters. */
function visibleTextOf(nodes: any[]): string {
  let out = ''
  const walk = (node: any) => {
    if (!node || typeof node !== 'object')
      return
    if (node.type === 'text')
      out += String(node.content ?? '')
    else if (node.type === 'math_inline')
      out += `$${String(node.content ?? '')}$`
    else if (node.type === 'inline_code')
      out += String(node.code ?? node.raw ?? '')
    else if (node.type === 'image')
      out += '' // Renders as an image, not as text.
    else if (Array.isArray(node.children))
      node.children.forEach(walk)
    else if (node.type === 'link')
      out += String(node.text ?? '')
    if (Array.isArray(node.items))
      node.items.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

describe('a final parse never leaves a loading image or link', () => {
  // Every one of these used to keep a placeholder that spun forever: the URL is
  // grabbed by linkify (a space is not allowed in a destination) or the
  // destination never closed, so nothing could resolve it once the parse ended.
  const cases = [
    '![a](https://e.com/a b.png)',
    '![a](https://e.com/a b.png) tail',
    'see ![a](https://e.com/a b.png) end',
    '[a](https://e.com/a b.png)',
    'see [a](https://e.com/a b.png) end',
    '![a](javascript:alert(1))',
    '![a](data:text/html;base64,AA)',
    '[guide](http://s',
    '[x](http://s "t',
    '[www.trusted.com/login] (<https://www.trusted.com>@evil.com',
    'text [x](http://s z',
    '- [x](http://s',
    '| h |\n|---|\n| [x](http://s |',
    '**![a](https://e.com/a b.png)** ok',
    '> ![a](https://e.com/a b.png)',
    '::: tip\n[a *em*](http://s\n:::',
  ]

  it.each(cases)('keeps %j free of loading nodes', (input) => {
    const final = parseMarkdownToStructure(input, md, { final: true }) as any[]
    expect(findLoading(final)).toEqual([])
  })

  it('shows the source of a space-separated destination instead of a link', () => {
    expect(childrenOf('![a](https://e.com/a b.png)', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '![a](https://e.com/a b.png)' }),
    ])
    expect(childrenOf('[a](https://e.com/a b.png)', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '[a](https://e.com/a b.png)' }),
    ])
  })

  it('keeps the placeholder for the same sources while streaming', () => {
    for (const input of ['![a](https://e.com/a b', '[a](https://e.com/a b', '[guide](http://s']) {
      const stream = parseMarkdownToStructure(input, md, { final: false }) as any[]
      expect(findLoading(stream).length, input).toBeGreaterThan(0)
    }
  })

  it('keeps the image inside an unfinished link instead of hiding it', () => {
    // LinkNode renders only `text` while a link is loading, so before this the
    // image was invisible behind the spinner.
    const children = childrenOf('[![img](a.png)]( http://s', true)
    expect(children.map(child => child.type)).toEqual(['text', 'image', 'text'])
    expect(children[0]).toMatchObject({ content: '[' })
    expect(children[1]).toMatchObject({ type: 'image', src: 'a.png', loading: false })
    expect(children[2]).toMatchObject({ content: '](http://s' })

    const streaming = parseMarkdownToStructure('[![img](a.png)]( http://s', md, { final: false }) as any[]
    expect(streaming[0].children[0]).toMatchObject({ type: 'link', loading: true })
  })

  it('keeps an autolink a link instead of rewriting it to source', () => {
    // A container parse can lose an autolink's label and hand it over loading.
    // `<url>` delimits its own destination, so the link is complete: the final
    // parse must not turn it into source text or leave a spinner behind.
    const nodes = parseMarkdownToStructure('::: tip\n<https://example.com>\n:::', md, { final: true }) as any[]
    const link = nodes[0].children[0].children[0]
    expect(link).toMatchObject({
      type: 'link',
      href: 'https://example.com',
      loading: false,
      markup: 'autolink',
      text: 'https://example.com',
    })
    expect(link.children).toEqual([
      expect.objectContaining({ type: 'text', content: 'https://example.com' }),
    ])
  })

  it.each([
    '![a](https://e.com/a.png)',
    '![a](<b c>)',
    '![a](b "t")',
    '![a](data:image/png;base64,AA)',
    '![a](file:///C:/x.png)',
    'see ![a](https://e.com/a.png) end',
    '[![a](https://e.com/i.png)](https://e.com/l)',
  ])('still resolves the real image %j', (input) => {
    for (const final of [false, true]) {
      const images: any[] = []
      const walk = (nodes: any[]) => {
        for (const node of nodes) {
          if (node?.type === 'image')
            images.push(node)
          if (Array.isArray(node?.children))
            walk(node.children)
        }
      }
      walk(parseMarkdownToStructure(input, md, { final }) as any[])
      expect(images.length, input).toBe(1)
      expect(images[0].loading, input).toBe(false)
      expect(String(images[0].src), input).not.toBe('')
    }
  })

  it('shows a validator-rejected target as its source instead of loading forever', () => {
    // `javascript:` is blocked by `validateLink`, so the image keeps `src: ''`
    // and there is nothing to load; markdown-it renders it as literal text. The
    // raw source also carries a trailing text that the recovery swallowed.
    expect(childrenOf('![a](javascript:alert(1))', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '![a](javascript:alert(1))' }),
    ])
    expect(childrenOf('![a](data:text/html;base64,AA)', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '![a](data:text/html;base64,AA)' }),
    ])
    expect(childrenOf('![a](javascript:alert(1)) tail', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '![a](javascript:alert(1)) tail' }),
    ])
  })

  it('keeps the destination of a validator-rejected link, not just its label', () => {
    // Dropping to the label alone lost the destination and the syntax around it:
    // `![a](ftp://e.com/a.png` rendered as `!a`, and a closed target kept a stray
    // `)`. markdown-it with this package's validator renders the source, so the
    // reader must see exactly that.
    const cases = [
      '![a](ftp://e.com/a.png',
      '[a](ftp://e.com/a.png',
      '[a](ftp://e.com/a.png)',
      '[a](javascript:alert(1))',
      '[a](data:text/html;base64,AA)',
      '![a](javascript:alert(1))',
      'see ![a](ftp://e.com/a.png end',
      '- [a](ftp://e.com/a.png)',
      '**[a](ftp://e.com/a.png)**',
    ]

    for (const input of cases) {
      const final = parseMarkdownToStructure(input, md, { final: true }) as any[]
      expect(visibleTextOf(final), input).toBe(input.replace(/^[-*]+\s/, '').replace(/\*\*/g, ''))
      // Nothing rejected may become clickable or keep a placeholder alive.
      expect(findFirst(final, node => node.type === 'link'), input).toBeUndefined()
      expect(findFirst(final, node => node.type === 'image'), input).toBeUndefined()
      expect(findLoading(final), input).toEqual([])
    }

    // A rejected destination that is still arriving shows the same source while
    // streaming instead of a bare label.
    for (const input of ['![a](ftp://e.com/a.png', '[a](ftp://e.com/a.png']) {
      const stream = parseMarkdownToStructure(input, md, { final: false }) as any[]
      expect(visibleTextOf(stream), input).toBe(input)
      expect(findLoading(stream), input).toEqual([])
    }
  })

  it('does not invent link syntax around a rejected destination', () => {
    // A bare URL that linkify matched has its own text as the label; printing
    // `[url](url)` would be syntax the document never had.
    const prose = 'Download the release from ftp://ftp.gnu.org/gnu/bash/bash-5.2.tar.gz here.'
    for (const final of [false, true]) {
      const nodes = parseMarkdownToStructure(prose, md, { final }) as any[]
      expect(visibleTextOf(nodes), `final=${final}`).toBe(prose)
      expect(findLinks(nodes), `final=${final}`).toEqual([])
    }
    expect(visibleTextOf(parseMarkdownToStructure('see <ftp://e.com/x> end', md, { final: true }) as any[]))
      .toBe('see ftp://e.com/x end')

    // The space in front of the paren means the source never wrote link syntax,
    // so the destination is all that is missing from the text.
    for (const final of [false, true]) {
      const nodes = parseMarkdownToStructure('[a] (ftp://e.com/x)', md, { final }) as any[]
      expect(visibleTextOf(nodes), `final=${final}`).toBe('[a] (ftp://e.com/x)')
      expect(findLinks(nodes), `final=${final}`).toEqual([])
    }

    // A folded token cannot tell a closed paren from a missing one when a title
    // follows, so the reconstruction must not add a paren the source may lack.
    expect(visibleTextOf(parseMarkdownToStructure('[a](ftp://e.com/x "t"', md, { final: true }) as any[]))
      .toBe('[a](ftp://e.com/x "t"')
    expect(visibleTextOf(parseMarkdownToStructure('[a](ftp://e.com/x)', md, { final: true }) as any[]))
      .toBe('[a](ftp://e.com/x)')
  })

  it('keeps the closing quote of a title that a fragment parse never saw as source', () => {
    // A container or emphasis child is parsed without the surrounding inline
    // source, so the cleanup cannot read the quote back from `raw`; the folded
    // link token records whether the source closed the title instead.
    const container = parseMarkdownToStructure('::: tip\n[x](https://ok.com "title"\n:::', md, { final: true }) as any[]
    expect(container[0].children[0].children).toEqual([
      expect.objectContaining({ type: 'text', content: '[x](https://ok.com "title"' }),
    ])

    const strong = parseMarkdownToStructure('**[x](https://ok.com "title"**', md, { final: true }) as any[]
    expect(strong[0].children[0].children).toEqual([
      expect.objectContaining({ type: 'text', content: '[x](https://ok.com "title"' }),
    ])

    // An unterminated title must not gain a quote it never had.
    const unterminated = parseMarkdownToStructure('::: tip\n[x](http://s "t\n:::', md, { final: true }) as any[]
    expect(unterminated[0].children[0].children).toEqual([
      expect.objectContaining({ type: 'text', content: '[x](http://s "t' }),
    ])
  })

  it('does not leak the fold-time title flag into a final node', () => {
    // Both fold through the synthetic link token with `loading: false`, which is
    // where the hint used to reach the node handed to consumers.
    for (const input of ['[see] (<https://a.com>)', '[x] (http://s)']) {
      const nodes = parseMarkdownToStructure(input, md, { final: true }) as any[]
      expect(collectKeys(nodes), input).not.toContain('titleClosed')
    }
  })

  it('never turns a folded autolink tail into a clickable link', () => {
    // The recovery used to fold `[label](` + `<url>` + trailing text into one
    // link, so a trusted-looking label pointed at the `@evil.com` origin. With
    // the space in front of the paren there is no link syntax to fold: the
    // label and the URL each keep a link to their own destination, and the
    // trailing `@evil.com` stays text.
    const input = '[www.trusted.com/login] (<https://www.trusted.com>@evil.com'
    const children = childrenOf(input, true)
    for (const link of findLinks(children)) {
      expect(link, input).not.toMatchObject({ href: expect.stringContaining('@evil.com') })
      expect(labelNamesOwnDestination(link), `${input} => ${link.text} | ${link.href}`).toBe(true)
    }
    const visible = visibleTextOf(children)
    expect(visible, input).toContain('@evil.com')
    expect(visible, input).not.toContain('](https://www.trusted.com@evil.com')
  })

  it('keeps a complete detected URL a link, but only with its own text', () => {
    // A linkify match is a complete URL, so it stays a link with `loading`
    // cleared instead of being rebuilt as `[url](url)`.
    const children = childrenOf('See the [docs for *streaming*](https://example.com/guide', true)
    expect(children.map(child => child.type)).toEqual(['text', 'emphasis', 'text', 'link'])
    expect(children[3]).toMatchObject({
      type: 'link',
      href: 'https://example.com/guide',
      loading: false,
      markup: 'linkify',
      text: 'https://example.com/guide',
    })
    expect(JSON.stringify(children)).not.toContain(']([https://example.com/guide')

    // A container parse hands over an autolink whose label was lost; the label
    // an autolink implies is its href, never the neighbouring text.
    const container = parseMarkdownToStructure('::: tip\n<https://example.com>\n:::', md, { final: true }) as any[]
    expect(container[0].children[0].children[0]).toMatchObject({
      type: 'link',
      loading: false,
      markup: 'autolink',
      text: 'https://example.com',
    })
  })

  it('shows a container link whose label was lost once, without a fabricated []', () => {
    const container = parseMarkdownToStructure('::: tip\n[a *em*](http://s\n:::', md, { final: true }) as any[]
    const children = container[0].children[0].children
    expect(children.map((child: any) => child.type)).toEqual(['text', 'emphasis', 'text', 'link'])
    expect(children[3]).toMatchObject({ loading: false, href: 'http://s' })
    const visible = children.map((child: any) => {
      if (child.type === 'text')
        return child.content
      if (child.type === 'emphasis')
        return child.children.map((inner: any) => inner.content).join('')
      if (child.type === 'link')
        return child.text
      return ''
    }).join('')
    expect(visible).toBe('[a em](http://s')
  })

  it('does not duplicate the label bracket or invent a closing quote', () => {
    // The opening bracket is already source text in front of the image.
    const imageLabel = childrenOf('See [![logo](a.png)]( http://s', true)
    expect(imageLabel.map(child => child.type)).toEqual(['text', 'image', 'text'])
    expect(imageLabel[0]).toMatchObject({ content: 'See [' })
    expect(imageLabel[1]).toMatchObject({ src: 'a.png', loading: false })
    expect(imageLabel[2]).toMatchObject({ content: '](http://s' })

    // The title never closed, so the source text must not close it either.
    expect(childrenOf('[x](http://s "t', true)).toEqual([
      expect.objectContaining({ type: 'text', content: '[x](http://s "t' }),
    ])
  })

  it('renders an unclosed destination the way markdown-it does', () => {
    // markdown-it 14 gives up on the image (nothing can close its destination)
    // and linkifies the URL on its own, so the reader sees the source prefix
    // followed by one link. Expected text below is markdown-it's textContent.
    const cases = [
      { input: '![a $x$](https://e.com/a.png', text: '![a $x$](https://e.com/a.png', href: 'https://e.com/a.png', label: 'https://e.com/a.png' },
      { input: '![](https://e.com/a.png', text: '![](https://e.com/a.png', href: 'https://e.com/a.png', label: 'https://e.com/a.png' },
      { input: '![a](www.e.com/a.png', text: '![a](www.e.com/a.png', href: 'http://www.e.com/a.png', label: 'www.e.com/a.png' },
      { input: '![a](mailto:x@example.com', text: '![a](mailto:x@example.com', href: 'mailto:x@example.com', label: 'mailto:x@example.com' },
      { input: '![a](<https://e.com/a.png', text: '![a](<https://e.com/a.png', href: 'https://e.com/a.png', label: 'https://e.com/a.png' },
      { input: '![$x$](https://e.com/a.png', text: '![$x$](https://e.com/a.png', href: 'https://e.com/a.png', label: 'https://e.com/a.png' },
      // The link has no image in front of it; the fold used to give its label
      // the destination's normalized href and print it twice.
      { input: '[a](www.e.com/a.png', text: '[a](www.e.com/a.png', href: 'http://www.e.com/a.png', label: 'www.e.com/a.png' },
      { input: '![a](www.e.com/a.png "title', text: '![a](www.e.com/a.png "title', href: 'http://www.e.com/a.png', label: 'www.e.com/a.png' },
      { input: 'see ![a](www.e.com/a.png end', text: 'see ![a](www.e.com/a.png end', href: 'http://www.e.com/a.png', label: 'www.e.com/a.png' },
      // The label spells the destination the way the source did: an address
      // gains `mailto:`, a non-ASCII host is punycode in the href.
      { input: '![a](user@example.com', text: '![a](user@example.com', href: 'mailto:user@example.com', label: 'user@example.com' },
      { input: '![a](例子.com', text: '![a](例子.com', href: 'http://xn--fsqu00a.com', label: '例子.com' },
    ]

    for (const { input, text, href, label } of cases) {
      const final = parseMarkdownToStructure(input, md, { final: true }) as any[]
      expect(visibleTextOf(final), input).toBe(text)
      // The destination stays a link, with the URL as the source spelled it.
      const link = findFirst(final, node => node.type === 'link')
      expect(link, input).toMatchObject({ loading: false, markup: 'linkify', href, text: label })
    }
  })

  it('keeps the placeholder for an unclosed destination while streaming', () => {
    for (const input of [
      '![a](www.e.com/a.png',
      '[a](www.e.com/a.png',
      '![a $x$](https://e.com/a.png',
      '![a](<https://e.com/a.png',
    ]) {
      const stream = parseMarkdownToStructure(input, md, { final: false }) as any[]
      expect(findLoading(stream).length, input).toBeGreaterThan(0)
    }
  })

  it('never makes an undecodable punycode destination clickable', () => {
    // `xn--attacker` is not valid punycode, so the label the tokenizer decodes
    // from it is unprintable. Selecting that as the label would put a link with
    // control characters in front of the reader.
    for (const input of ['[例子.com](xn--attacker.com', '![例子.com](xn--attacker.com']) {
      const final = parseMarkdownToStructure(input, md, { final: true }) as any[]
      expect(findFirst(final, node => node.type === 'link'), input).toBeUndefined()
    }
  })

  it('never points a source label at another host', () => {
    // A non-ASCII label and a punycode destination only spell one URL when the
    // label's own host encodes to the destination's host. `xn--evil.com` is not
    // the encoding of `登录`, so the label may not become a link to it.
    for (const input of [
      '[登录] (HTTP://XN--EVIL.COM',
      '[例子.com] (HTTP://XN--EVIL.COM',
      '![登录] (HTTP://XN--EVIL.COM',
    ]) {
      const final = parseMarkdownToStructure(input, md, { final: true }) as any[]
      for (const link of findLinks(final)) {
        // A link is fine as long as it shows the destination it leads to: the
        // space means the label was never its text.
        expect(labelNamesOwnDestination(link), `${input} => ${link.text} | ${link.href}`).toBe(true)
        expect(link.text, input).not.toBe('登录')
      }
    }
  })

  it('does not accept an alternate numeric spelling of the same host', () => {
    // `0x7f.1` and `2130706433` are `127.0.0.1` to `URL`, so normalizing alone
    // would keep these links and show a reader an address they cannot read.
    for (const input of [
      '[0x7f.1]](http://127.0.0.1',
      '[2130706433]](http://127.0.0.1',
    ]) {
      const final = parseMarkdownToStructure(input, md, { final: true }) as any[]
      expect(findFirst(final, node => node.type === 'link'), input).toBeUndefined()
    }
  })

  it('matches a cold final parse when the stream was parsed incrementally', () => {
    for (const input of [
      '![a](https://e.com/a b.png)',
      '[a](https://e.com/a b.png)',
      '[guide](http://s',
      '[![img](a.png)]( http://s',
      '![a](https://e.com/a.png)',
    ]) {
      const warm = getMarkdown(`warm-${input.length}`)
      for (let i = 1; i <= input.length; i++)
        parseMarkdownToStructure(input.slice(0, i), warm, { final: false })
      const warmFinal = parseMarkdownToStructure(input, warm, { final: true }) as any[]
      const coldFinal = parseMarkdownToStructure(input, getMarkdown(`cold-${input.length}`), { final: true }) as any[]
      expect(warmFinal, input).toEqual(coldFinal)
    }
  })
})
