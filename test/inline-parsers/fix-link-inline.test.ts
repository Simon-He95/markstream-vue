import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

const md = getMarkdown('fix-link-inline')

function collectLinks(nodes: any[]) {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n)
      return
    if (n.type === 'link')
      out.push(n)
    if (Array.isArray(n.children))
      n.children.forEach(walk)
    if (Array.isArray(n.items))
      n.items.forEach(walk)
    if (n.type === 'table') {
      n.rows.forEach(walk)
      n.header.cells.forEach(walk)
    }
    else if (n.type === 'table_row') {
      n.cells.forEach(walk)
    }
  }
  nodes.forEach(walk)
  return out
}

function collectTarget(nodes: any[], targetType: string) {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n)
      return
    if (n.type === targetType)
      out.push(n)
    if (Array.isArray(n.children))
      n.children.forEach(walk)
    if (Array.isArray(n.items))
      n.items.forEach(walk)
    if (n.type === 'table') {
      n.rows.forEach(walk)
      n.header.cells.forEach(walk)
    }
    else if (n.type === 'table_row') {
      n.cells.forEach(walk)
    }
  }
  nodes.forEach(walk)
  return out
}

describe('inline parser fixes (link mid-states)', () => {
  it('handles loading link [x](http://a as loading link node', () => {
    const nodes = parseMarkdownToStructure('[x](http://a', md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(l.text).toBe('x')
    // loading should be true for unclosed parenthesis
    expect(Boolean(l.loading)).toBe(true)
    // href may be present or empty depending on tokenizer, but if present contains the partial href
    if (l.href)
      expect(String(l.href)).toContain('http')
  })

  it('does not treat [*x as a finalized link', () => {
    const nodes = parseMarkdownToStructure('[*x', md)
    const links = collectLinks(nodes as any[])
    // Should not create a link from just '[*x'
    expect(links.length).toBe(0)
  })

  it('parses finalized link [x](http://a) as non-loading link', () => {
    const nodes = parseMarkdownToStructure('[x](http://a)', md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(l.loading).toBeFalsy()
    expect(String(l.href)).toContain('http://a')
  })

  it('simple inline link', () => {
    const nodes = parseMarkdownToStructure('[OpenAI](https://openai.com)', md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(l.loading).toBeFalsy()
    expect(String(l.href)).toContain('https://openai.com')
    expect(l.text).toBe('OpenAI')
  })

  it('inline link with a *title* (tooltip)', () => {
    const nodes = parseMarkdownToStructure('[OpenAI](https://openai.com "OpenAI – AI research")', md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(l.loading).toBeFalsy()
    expect(String(l.href)).toContain('https://openai.com')
    expect(l.text).toBe('OpenAI')
    // title may be stored on `title` or inside attributes depending on tokenizer
    if ('title' in l)
      expect(String((l as any).title)).toContain('OpenAI – AI research')
    else if (l.attrs && l.attrs.title)
      expect(String(l.attrs.title)).toContain('OpenAI – AI research')
  })

  it('**Bold** link', () => {
    const nodes = parseMarkdownToStructure('**[OpenAI](https://openai.com)**', md)
    const strong = (nodes[0] as any).children[0]
    const link = strong.children[0]
    expect(strong.type).toBe('strong')
    expect(strong.raw).toBe('**OpenAI**')
    expect(strong.children[0]).toBeDefined()
    expect(link.type).toBe('link')
    expect(link.text).toBe('OpenAI')
    expect(link.loading).toBeFalsy()
    expect(String(link.href)).toContain('https://openai.com')
  })

  it('*Italic* link', () => {
    const nodes = parseMarkdownToStructure('*[OpenAI](https://openai.com)*', md)
    const emphasis = (nodes[0] as any).children[0]
    const link = emphasis.children[0]
    expect(emphasis.type).toBe('emphasis')
    expect(emphasis.raw).toBe('*OpenAI*')
    expect(emphasis.children[0]).toBeDefined()
    expect(link.type).toBe('link')
    expect(link.text).toBe('OpenAI')
    expect(link.loading).toBeFalsy()
    expect(String(link.href)).toContain('https://openai.com')
  })

  it('***Bold + Italic*** link', () => {
    const nodes = parseMarkdownToStructure('***[OpenAI](https://openai.com)***', md)
    const wrapper = (nodes[0] as any).children[0]
    // markdown parsers may represent triple-asterisk as strong->emphasis or emphasis->strong
    expect(wrapper).toBeDefined()
    // If wrapper is strong, its first child should be emphasis which contains the link
    if (wrapper.type === 'strong') {
      const emphasis = wrapper.children[0]
      expect(emphasis).toBeDefined()
      expect(emphasis.type).toBe('emphasis')
      const link = emphasis.children[0]
      expect(link).toBeDefined()
      expect(link.type).toBe('link')
      expect(link.text).toBe('OpenAI')
      expect(link.loading).toBeFalsy()
      expect(String(link.href)).toContain('https://openai.com')
    }
    else if (wrapper.type === 'emphasis') {
      // If wrapper is emphasis, its first child may be strong which contains the link
      const strong = wrapper.children[0]
      expect(strong).toBeDefined()
      expect(strong.type).toBe('strong')
      const link = strong.children[0]
      expect(link).toBeDefined()
      expect(link.type).toBe('link')
      expect(link.text).toBe('OpenAI')
      expect(link.loading).toBeFalsy()
      expect(String(link.href)).toContain('https://openai.com')
    }
    else {
      // Fallback: try to find link anywhere under wrapper
      const walk = (n: any): any => {
        if (!n)
          return null
        if (n.type === 'link')
          return n
        if (Array.isArray(n.children)) {
          for (const c of n.children) {
            const found = walk(c)
            if (found)
              return found
          }
        }
        return null
      }
      const link = walk(wrapper)
      expect(link).toBeDefined()
      expect(link.type).toBe('link')
      expect(link.text).toBe('OpenAI')
      expect(String(link.href)).toContain('https://openai.com')
    }
  })

  it('link inside a heading', () => {
    const nodes = parseMarkdownToStructure('## Learn more at [OpenAI](https://openai.com)', md)
    const heading = nodes[0] as any
    expect(heading).toBeDefined()
    expect(heading.type).toBe('heading')
    // heading children should contain the link somewhere
    const link = collectLinks(heading.children || [])[0] as any

    expect(link).toBeDefined()
    expect(link.type).toBe('link')
    expect(link.text || link.children?.[0]?.content).toBeDefined()
    // text content should include OpenAI
    const text = link.text || link.children?.[0]?.content || ''
    expect(String(text)).toContain('OpenAI')
    expect(String(link.href)).toContain('https://openai.com')
  })

  it('link inside a blockquote', () => {
    const nodes = parseMarkdownToStructure('> Check out the docs: [OpenAI API](https://platform.openai.com/docs)', md)
    const blockquote = nodes[0] as any
    expect(blockquote).toBeDefined()
    expect(blockquote.type).toBe('blockquote')
    const link = collectLinks(blockquote.children || [])[0] as any

    expect(link).toBeDefined()
    expect(link.type).toBe('link')
    const text = link.text || link.children?.[0]?.content || ''
    expect(String(text)).toContain('OpenAI API')
    expect(String(link.href)).toContain('https://platform.openai.com/docs')
  })

  it('link inside a list', () => {
    const nodes = parseMarkdownToStructure('- Official site: [OpenAI](https://openai.com)', md)
    const listNode = nodes[0] as any
    expect(listNode).toBeDefined()
    // lists may be represented as 'list' with items or 'list_item' children; search recursively

    const link = collectLinks(listNode.children || listNode.items || [])[0] as any
    expect(link).toBeDefined()
    expect(link.type).toBe('link')
    const text = link.text || link.children?.[0]?.content || ''
    expect(String(text)).toContain('OpenAI')
    expect(String(link.href)).toContain('https://openai.com')
  })

  it('numbered list with links', () => {
    const nodes = parseMarkdownToStructure('1. First: [OpenAI](https://openai.com)', md)
    const listNode = nodes[0] as any
    expect(listNode).toBeDefined()

    const link = collectLinks(listNode.children || listNode.items || [])[0] as any
    expect(link).toBeDefined()
    expect(link.type).toBe('link')
    const text = link.text || link.children?.[0]?.content || ''
    expect(String(text)).toContain('OpenAI')
    expect(String(link.href)).toContain('https://openai.com')
  })

  it('link inside a table', () => {
    const tableMd = `| Service | URL                         |
|---------|-----------------------------|
| OpenAI  | [openai.com](https://openai.com) |
| ChatGPT | [chat.openai.com](https://chat.openai.com) |`

    const nodes = parseMarkdownToStructure(tableMd, md)
    const links = collectLinks(nodes as any[])
    // expect at least two links from the two table cells
    expect(links.length).toBeGreaterThanOrEqual(2)
    const hrefs = links.map((l: any) => String(l.href))
    expect(hrefs.some((h: string) => h.includes('https://openai.com'))).toBe(true)
    expect(hrefs.some((h: string) => h.includes('https://chat.openai.com'))).toBe(true)
  })

  it('**Bold link inside a table**', () => {
    const tableMd = `| Service | URL                                 |
|---------|-------------------------------------|
| OpenAI  | **[openai.com](https://openai.com)** |
| ChatGPT | **[chat.openai.com](https://chat.openai.com)** |`

    const nodes = parseMarkdownToStructure(tableMd, md)
    const strongs = collectTarget(nodes as any[], 'strong')
    expect(strongs.length).toBeGreaterThanOrEqual(2)
    const links = collectLinks(strongs as any[])
    expect(links.length).toBeGreaterThanOrEqual(2)
    const hrefs = links.map((l: any) => String(l.href))
    expect(hrefs.some((h: string) => h.includes('https://openai.com'))).toBe(true)
    expect(hrefs.some((h: string) => h.includes('https://chat.openai.com'))).toBe(true)
  })

  it('link with **escaped parentheses** in the URL', () => {
    const mdText = '[Google Maps](https://www.google.com/maps/place/Statue+of+Liberty+(New+York)/)'
    const nodes = parseMarkdownToStructure(mdText, md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(l.text).toBe('Google Maps')
    const hrefStr = String(l.href)
    expect(hrefStr).toContain('https://www.google.com/maps')
    // parentheses may be preserved or percent-encoded; ensure key parts exist
    expect(hrefStr).toMatch(/Statue/i)
    expect(hrefStr).toMatch(/New\s*York|New\+York|New%20York/i)
  })

  it('autolink (bare URL)', () => {
    const nodes = parseMarkdownToStructure('<https://openai.com>', md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    // href should contain the URL
    expect(String(l.href)).toContain('https://openai.com')
    // text may be on `text` or children content
    const text = l.text || l.children?.[0]?.content || ''
    expect(String(text)).toBe('https://openai.com')
  })

  it('reference‑style link', () => {
    const mdText = `Visit the [OpenAI website][openai].

[openai]: https://openai.com "OpenAI – AI research"`
    const nodes = parseMarkdownToStructure(mdText, md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    // href should point to OpenAI
    expect(String(l.href)).toContain('https://openai.com')
    // text should include the label used
    const text = l.text || l.children?.[0]?.content || ''
    expect(String(text)).toBe('OpenAI website')
    expect(String(l.title)).toBe('OpenAI – AI research')
    expect(l.loading).toBeFalsy()
  })

  it('reference‑style link **inside bold**', () => {
    const mdText = `**See the [OpenAI docs][docs] for details.**

[docs]: https://platform.openai.com/docs`
    const nodes = parseMarkdownToStructure(mdText, md)
    const strong = (nodes[0] as any).children?.find((c: any) => c.type === 'strong')
    expect(strong).toBeDefined()
    const link = (strong.children || []).find((c: any) => c.type === 'link')
    expect(link).toBeDefined()
    expect(String(link.href)).toBe('https://platform.openai.com/docs')
    const text = link.text || link.children?.[0]?.content || ''
    expect(String(text)).toBe('OpenAI docs')
  })

  it('image that is also a link', () => {
    const mdText = '[![OpenAI logo](https://openai.com/content/images/2022/05/openai-avatar.png)](https://openai.com)'
    const nodes = parseMarkdownToStructure(mdText, md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(String(l.href)).toContain('https://openai.com')
    const hasImageChild = (Array.isArray(l.children) && l.children.some((c: any) => c.type === 'image'))
      || (Array.isArray((l as any).items) && (l as any).items.some((c: any) => c.type === 'image'))
    expect(hasImageChild).toBe(true)
  })

  it('link inside **inline code** (displayed as code, not clickable)', () => {
    const mdText = '`[OpenAI](https://openai.com)`'
    const nodes = parseMarkdownToStructure(mdText, md)
    // ensure no links are parsed
    const links = collectLinks(nodes as any[])
    expect(links.length).toBe(0)
    // ensure an inline_code node exists and contains the raw code
    const inline = (nodes[0] as any).children?.find((c: any) => c.type === 'inline_code')
    expect(inline).toBeDefined()
    expect(inline.code || inline.raw).toContain('[OpenAI](https://openai.com)')
  })

  it('link inside a **code block** (fenced) – not rendered as a link', () => {
    const mdText = '```\n[OpenAI](https://openai.com)\n```'
    const nodes = parseMarkdownToStructure(mdText, md)
    // No link nodes should be produced from code block content
    const links = collectLinks(nodes as any[])
    expect(links.length).toBe(0)
    // The raw code should still appear somewhere in the node tree
    const serialized = JSON.stringify(nodes)
    expect(serialized).toContain('[OpenAI](https://openai.com)')
  })

  it('link inside **HTML** (raw HTML allowed in many Markdown flavours)', () => {
    const mdText = '<p>Visit <a href="https://openai.com">OpenAI</a> for more info.'
    const nodes = parseMarkdownToStructure(mdText, md)
    // Some tokenizers may emit an HTML node, others may parse the anchor into link nodes.
    const links = collectLinks(nodes as any[])
    if (links.length > 0) {
      const l = links[0]
      expect(String(l.href)).toContain('https://openai.com')
      const text = l.text || l.children?.[0]?.content || ''
      expect(String(text)).toContain('OpenAI')
    }
    else {
      // fallback: ensure raw HTML is present in serialized output
      const serialized = JSON.stringify(nodes)
      expect(serialized).toContain('<a href=\\"https://openai.com\\">OpenAI</a>')
    }
  })

  it('link with **emoji** and bold', () => {
    const mdText = '**🚀 [Launch OpenAI](https://openai.com)**'
    const nodes = parseMarkdownToStructure(mdText, md)
    // expect a strong node wrapping the emoji+link
    const strong = (nodes[0] as any).children?.find((c: any) => c.type === 'strong')
    expect(strong).toBeDefined()
    expect(strong)
    // link may be a direct child of strong
    const link = (strong.children || []).find((c: any) => c.type === 'link')
    expect(link).toBeDefined()
    expect(String(link.href)).toContain('https://openai.com')
    const text = link.text || link.children?.[0]?.content || ''
    // ensure link text contains expected word
    expect(String(text)).toContain('Launch')
  })

  it('link inside a **definition list** (GitHub‑flavoured Markdown)', () => {
    const mdText = 'Term  \n: Definition with a link to the [OpenAI site](https://openai.com).'
    const nodes = parseMarkdownToStructure(mdText, md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(String(l.href)).toContain('https://openai.com')
    const text = l.text || l.children?.[0]?.content || ''
    expect(String(text)).toContain('OpenAI')
  })

  it('link with **multiple titles** (only the first title is used)', () => {
    const mdText = `[OpenAI](https://openai.com "First title" "Second title")`
    const nodes = parseMarkdownToStructure(mdText, md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(String(l.href)).toContain('https://openai.com')
    const text = l.text || l.children?.[0]?.content || ''
    expect(String(text)).toBe('OpenAI')
    const titleVal = ('title' in l) ? (l as any).title : (l.attrs && l.attrs.title)
    // Only assert title behavior if a non-empty title is present
    if (titleVal && String(titleVal).length > 0) {
      expect(String(titleVal)).toBe('First title')
      expect(String(titleVal)).not.toContain('Second title')
    }
  })

  it('link inside a **nested list**', () => {
    const mdText = `- Main item
  1. Sub‑item with a link: [OpenAI](https://openai.com)
  2. Another sub‑item`
    const nodes = parseMarkdownToStructure(mdText, md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links.find((x: any) => String(x.href) === 'https://openai.com')
    expect(l).toBeDefined()
    expect(String(l.href)).toContain('https://openai.com')
    const text = l.text || l.children?.[0]?.content || ''
    expect(String(text)).toContain('OpenAI')
  })

  it('link with **non‑ASCII characters**', () => {
    const mdText = `[Åbent bibliotek](https://example.com/åbent)`
    const nodes = parseMarkdownToStructure(mdText, md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(String(l.href)).toContain('https://example.com')
    // href may percent-encode non-ASCII; check for key path segment presence in either form
    const hrefStr = String(l.href)
    expect(hrefStr).toMatch(/åbent|%C3%A5bent|%E5%93%81/i)
    const text = l.text || l.children?.[0]?.content || ''
    expect(String(text)).toContain('Åbent')
  })

  it('link inside a **footnote** (CommonMark footnote syntax)', () => {
    const mdText = `Here is a reference[^1].

[^1]: See the [OpenAI documentation](https://platform.openai.com/docs).`
    const nodes = parseMarkdownToStructure(mdText, md)
    const footnote = nodes[1] as any
    expect(footnote.type).toBe('footnote')
    const footnotAnchor = footnote.children[0].children.slice(-1)[0]
    expect(footnotAnchor.type).toBe('footnote_anchor')
    expect(footnotAnchor.id).toBe('1')
    const links = collectLinks(footnote.children)
    const l = links[0]
    expect(links.length).toBeGreaterThan(0)
    expect(l.loading).toBe(false)
    expect(l.href).toBe('https://platform.openai.com/docs')
    expect(String(l.text || l.children?.[0]?.content || '')).toContain('OpenAI documentation')
  })

  it('link with **HTML entity** in the link text', () => {
    const nodes = parseMarkdownToStructure('[OpenAI &amp; ChatGPT](https://openai.com)', md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(l.loading).toBeFalsy()
    expect(String(l.href)).toContain('https://openai.com')
    const text = l.text || l.children?.[0]?.content || ''
    expect(String(text)).toContain('OpenAI')
    expect(String(text)).toContain('ChatGPT')
    // Allow either decoded '&' or the HTML entity '&amp;'
    expect(String(text)).toMatch(/&amp;|&/)
  })

  it('link with **line break** inside the link text (using `<br>`)', () => {
    const nodes = parseMarkdownToStructure('[OpenAI<br>Platform](https://platform.openai.com)', md)
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(l.loading).toBeFalsy()
    expect(String(l.href)).toContain('https://platform.openai.com')
    const text = l.text || l.children?.[0]?.content || ''
    // Ensure both parts of the link text are present
    expect(String(text)).toContain('OpenAI')
    expect(String(text)).toContain('Platform')
    // Allow the parser to represent the <br> as a literal tag, a newline, or other whitespace
    expect(String(text)).toMatch(/OpenAI[\s\S]*Platform/)
  })

  it('**Bold image link** (image wrapped in bold and also a link)', () => {
    const mdText = '**[![OpenAI logo](https://openai.com/content/images/2022/05/openai-avatar.png)](https://openai.com)**'
    const nodes = parseMarkdownToStructure(mdText, md)
    // Look for strong nodes that may wrap the link
    const strongs = collectTarget(nodes as any[], 'strong')
    expect(strongs.length).toBeGreaterThanOrEqual(1)
    const links = collectLinks(strongs as any[])
    // There should be at least one link inside the strong wrapper
    expect(links.length).toBeGreaterThan(0)
    const l = links[0]
    expect(String(l.href)).toContain('https://openai.com')
    const hasImageChild = (Array.isArray(l.children) && l.children.some((c: any) => c.type === 'image'))
      || (Array.isArray((l as any).items) && (l as any).items.some((c: any) => c.type === 'image'))
    expect(hasImageChild).toBe(true)
  })

  it('link inside a **table header**', () => {
    const tableMd = `| **Service** | **URL** |
|-------------|----------|
| OpenAI      | [openai.com](https://openai.com) |`

    const nodes = parseMarkdownToStructure(tableMd, md)
    const links = collectLinks(nodes as any[])
    // link should be found in the table body
    expect(links.length).toBeGreaterThan(0)
    const hrefs = links.map((l: any) => String(l.href))
    expect(hrefs.some((h: string) => h.includes('https://openai.com'))).toBe(true)

    // ensure header cells exist and include the bold header text
    const tables = collectTarget(nodes as any[], 'table')
    expect(tables.length).toBeGreaterThan(0)
    const header = (tables[0] as any).header
    expect(header).toBeDefined()
    const headerTexts = header.cells.map((c: any) => {
      if (c.children)
        return c.children.map((ch: any) => ch.content || ch.raw || '').join('')
      return String(c.raw || '')
    }).join(' | ')
    expect(String(headerTexts)).toContain('Service')
    expect(String(headerTexts)).toContain('URL')
  })

  it('parses 3 adjacent links on the same line as 3 link nodes', () => {
    const markdown = '[citation](http://url1)  [citation](http://url1) [citation](http://url1)'
    const nodes = parseMarkdownToStructure(markdown, md)
    const links = collectLinks(nodes as any[])
    expect(links).toHaveLength(3)
    expect(links.map((l: any) => l.href)).toEqual(['http://url1', 'http://url1', 'http://url1'])
  })

  it('does not leak partial href like "(htt" into text nodes in streaming mid-state', () => {
    const markdown = '[citation](htt'
    const nodes = parseMarkdownToStructure(markdown, md, { final: false })
    const links = collectLinks(nodes as any[])
    expect(links.length).toBeGreaterThan(0)
    expect(Boolean(links[0].loading)).toBe(true)

    const texts = collectTarget(nodes as any[], 'text').map((t: any) => String(t.content ?? ''))
    expect(texts.join('')).not.toContain('(htt')
  })

  it('never renders "(http" as text during char-by-char streaming for multiple links', () => {
    const full = '[citation](http://url1)  [citation](http://url1) [citation](http://url1)'
    for (let i = 1; i <= full.length; i++) {
      const chunk = full.slice(0, i)
      const nodes = parseMarkdownToStructure(chunk, md, { final: false })
      const texts = collectTarget(nodes as any[], 'text').map((t: any) => String(t.content ?? '')).join('')
      // If this fails, include the chunk to make the failing prefix obvious.
      expect(texts, `prefix(${i}): ${chunk}`).not.toContain('(http')
    }
  })

  it('keeps streaming markdown images as image loading nodes instead of flipping to links', () => {
    const full = '![Picture](https://imzbf.github.io/md-editor-rt/imgs/mark_emoji.gif)'

    const earlyNodes = parseMarkdownToStructure(full.slice(0, 2), md, { final: false })
    expect(collectTarget(earlyNodes as any[], 'image')).toHaveLength(1)
    expect(collectLinks(earlyNodes as any[])).toHaveLength(0)

    for (const chunk of [full.slice(0, 20), full.slice(0, 60)]) {
      const nodes = parseMarkdownToStructure(chunk, md, { final: false })
      const images = collectTarget(nodes as any[], 'image')
      const links = collectLinks(nodes as any[])

      expect(images.length, chunk).toBe(1)
      expect(images[0].loading, chunk).toBe(true)
      expect(images[0].alt, chunk).toBe('Picture')
      expect(links, chunk).toHaveLength(0)
    }

    const finalNodes = parseMarkdownToStructure(full, md, { final: true })
    const finalImages = collectTarget(finalNodes as any[], 'image')
    const finalLinks = collectLinks(finalNodes as any[])

    expect(finalImages).toHaveLength(1)
    expect(finalImages[0].loading).toBe(false)
    expect(finalImages[0].src).toBe('https://imzbf.github.io/md-editor-rt/imgs/mark_emoji.gif')
    expect(finalImages[0].alt).toBe('Picture')
    expect(finalLinks).toHaveLength(0)
  })

  it('parses a Windows file URL image as an image instead of exclamation text and a link', () => {
    const markdown = '![示例图片](file:///C:/Users/demo/Pictures/sample-image.png)'
    for (const final of [false, true]) {
      const nodes = parseMarkdownToStructure(markdown, md, { final })
      const images = collectTarget(nodes as any[], 'image')
      const links = collectLinks(nodes as any[])

      expect(images, `final: ${final}`).toHaveLength(1)
      expect(images[0].src).toBe('file:///C:/Users/demo/Pictures/sample-image.png')
      expect(images[0].alt).toBe('示例图片')
      expect(links, `final: ${final}`).toHaveLength(0)
    }

    for (let index = 2; index <= markdown.length; index++) {
      const prefix = markdown.slice(0, index)
      const nodes = parseMarkdownToStructure(prefix, md, { final: false })

      expect(collectTarget(nodes as any[], 'image'), prefix).toHaveLength(1)
      expect(collectLinks(nodes as any[]), prefix).toHaveLength(0)
    }

    const escapedNodes = parseMarkdownToStructure(`\\${markdown}`, md, { final: true })
    expect(collectTarget(escapedNodes as any[], 'image')).toHaveLength(0)
    expect(collectLinks(escapedNodes as any[])).toHaveLength(1)

    const rejectingMd = getMarkdown('reject-windows-file-image', {
      markdownItOptions: {
        validateLink: () => false,
      },
    })
    // A rejected destination has no src to load: it keeps the placeholder while
    // streaming, and a final parse shows the source, as markdown-it renders it.
    const rejectedStreamingNodes = parseMarkdownToStructure(markdown, rejectingMd, { final: false })
    const rejectedStreamingImages = collectTarget(rejectedStreamingNodes as any[], 'image')
    expect(rejectedStreamingImages).toHaveLength(1)
    expect(rejectedStreamingImages[0]).toMatchObject({ src: '', loading: true })

    const rejectedNodes = parseMarkdownToStructure(markdown, rejectingMd, { final: true })
    expect(collectTarget(rejectedNodes as any[], 'image')).toHaveLength(0)
    expect(collectLinks(rejectedNodes as any[])).toHaveLength(0)
    expect(collectTarget(rejectedNodes as any[], 'text').map((node: any) => node.content)).toEqual([markdown])
  })

  it('does not turn escaped exclamation plus link into an image mid-state', () => {
    const nodes = parseMarkdownToStructure('\\![Picture](https://imzbf.github.io/md-editor-rt/imgs/mark_emoji.gif', md, { final: false })
    const images = collectTarget(nodes as any[], 'image')
    const links = collectLinks(nodes as any[])
    const texts = collectTarget(nodes as any[], 'text').map((t: any) => String(t.content ?? '')).join('')

    expect(images).toHaveLength(0)
    expect(links).toHaveLength(1)
    expect(texts).toContain('!')
  })

  it('keeps nested image links as loading links when the outer link has just started', () => {
    const veryEarlyMarkdown = '[![P'
    const veryEarlyNodes = parseMarkdownToStructure(veryEarlyMarkdown, md, { final: false })
    const veryEarlyImages = collectTarget(veryEarlyNodes as any[], 'image')
    const veryEarlyLinks = collectLinks(veryEarlyNodes as any[])
    const veryEarlyTexts = collectTarget(veryEarlyNodes as any[], 'text')

    expect(veryEarlyImages).toHaveLength(1)
    expect(veryEarlyLinks).toHaveLength(1)
    expect(veryEarlyLinks[0].loading).toBe(true)
    expect(veryEarlyLinks[0].href).toBe('')
    expect(veryEarlyLinks[0].children[0].type).toBe('image')
    expect(veryEarlyTexts).toHaveLength(0)

    const hrefEarlyMarkdown = '[![Picture](https://img'
    const hrefEarlyNodes = parseMarkdownToStructure(hrefEarlyMarkdown, md, { final: false })
    const hrefEarlyImages = collectTarget(hrefEarlyNodes as any[], 'image')
    const hrefEarlyLinks = collectLinks(hrefEarlyNodes as any[])
    const hrefEarlyTexts = collectTarget(hrefEarlyNodes as any[], 'text')

    expect(hrefEarlyImages).toHaveLength(1)
    expect(hrefEarlyLinks).toHaveLength(1)
    expect(hrefEarlyLinks[0].loading).toBe(true)
    expect(hrefEarlyLinks[0].href).toBe('')
    expect(hrefEarlyLinks[0].children[0].type).toBe('image')
    expect(hrefEarlyTexts).toHaveLength(0)

    const earlyMarkdown = '[![Picture](https://img)'
    const earlyNodes = parseMarkdownToStructure(earlyMarkdown, md, { final: false })
    const earlyImages = collectTarget(earlyNodes as any[], 'image')
    const earlyLinks = collectLinks(earlyNodes as any[])
    const earlyTexts = collectTarget(earlyNodes as any[], 'text')

    expect(earlyImages).toHaveLength(1)
    expect(earlyLinks).toHaveLength(1)
    expect(earlyLinks[0].loading).toBe(true)
    expect(earlyLinks[0].href).toBe('')
    expect(earlyLinks[0].children).toHaveLength(1)
    expect(earlyLinks[0].children[0].type).toBe('image')
    expect(earlyTexts).toHaveLength(0)

    const markdown = '[![Picture](https://img)]('
    const nodes = parseMarkdownToStructure(markdown, md, { final: false })
    const images = collectTarget(nodes as any[], 'image')
    const links = collectLinks(nodes as any[])
    const texts = collectTarget(nodes as any[], 'text')

    expect(images).toHaveLength(1)
    expect(links).toHaveLength(1)
    expect(links[0].loading).toBe(true)
    expect(links[0].href).toBe('')
    expect(links[0].children).toHaveLength(1)
    expect(links[0].children[0].type).toBe('image')
    expect(texts).toHaveLength(0)
  })

  it('preserves text before a nested image link while the outer link is incomplete', () => {
    const markdown = 'prefix [![Picture](https://img)'
    const nodes = parseMarkdownToStructure(markdown, md, { final: false })
    const images = collectTarget(nodes as any[], 'image')
    const links = collectLinks(nodes as any[])
    const texts = collectTarget(nodes as any[], 'text').map((t: any) => String(t.content ?? ''))

    expect(images).toHaveLength(1)
    expect(links).toHaveLength(1)
    expect(links[0].loading).toBe(true)
    expect(links[0].children).toHaveLength(1)
    expect(links[0].children[0].type).toBe('image')
    expect(texts.join('')).toBe('prefix ')
  })

  it('preserves text before very early nested image links', () => {
    const markdown = 'prefix [![P'
    const nodes = parseMarkdownToStructure(markdown, md, { final: false })
    const images = collectTarget(nodes as any[], 'image')
    const links = collectLinks(nodes as any[])
    const texts = collectTarget(nodes as any[], 'text').map((t: any) => String(t.content ?? ''))

    expect(images).toHaveLength(1)
    expect(links).toHaveLength(1)
    expect(links[0].loading).toBe(true)
    expect(links[0].children[0].type).toBe('image')
    expect(texts.join('')).toBe('prefix ')
  })

  it('does not turn escaped outer brackets before images into nested image links', () => {
    for (const markdown of [
      '\\[![P',
      '\\[![Picture](https://img',
      '\\[![Picture](https://img)',
      '\\[![Picture](https://img)](',
      '\\[![Picture](https://img)](https://outer',
    ]) {
      const nodes = parseMarkdownToStructure(markdown, md, { final: false })
      const images = collectTarget(nodes as any[], 'image')
      const links = collectLinks(nodes as any[])
      const texts = collectTarget(nodes as any[], 'text').map((t: any) => String(t.content ?? '')).join('')

      expect(images.length, markdown).toBe(1)
      expect(links.length, markdown).toBe(0)
      expect(texts, markdown).toContain('[')
    }
  })

  it('preserves prefix text for escaped outer brackets before images', () => {
    const markdown = 'prefix \\[![Picture](https://img'
    const nodes = parseMarkdownToStructure(markdown, md, { final: false })
    const images = collectTarget(nodes as any[], 'image')
    const links = collectLinks(nodes as any[])
    const texts = collectTarget(nodes as any[], 'text').map((t: any) => String(t.content ?? '')).join('')

    expect(images).toHaveLength(1)
    expect(links).toHaveLength(0)
    expect(texts).toBe('prefix [')
  })

  it('still allows double escaped outer bracket sequences to form real nested image links', () => {
    const markdown = '\\\\[![Picture](https://img'
    const nodes = parseMarkdownToStructure(markdown, md, { final: false })
    const images = collectTarget(nodes as any[], 'image')
    const links = collectLinks(nodes as any[])
    const texts = collectTarget(nodes as any[], 'text').map((t: any) => String(t.content ?? '')).join('')

    expect(images).toHaveLength(1)
    expect(links).toHaveLength(1)
    expect(links[0].loading).toBe(true)
    expect(links[0].children[0].type).toBe('image')
    expect(texts).toBe('\\')
  })

  it('keeps nested image links as loading links while the outer href streams', () => {
    const markdown = '[![Picture](https://img)](https://outer'
    const nodes = parseMarkdownToStructure(markdown, md, { final: false })
    const images = collectTarget(nodes as any[], 'image')
    const links = collectLinks(nodes as any[])
    const texts = collectTarget(nodes as any[], 'text')

    expect(images).toHaveLength(1)
    expect(links).toHaveLength(1)
    expect(links[0].loading).toBe(true)
    expect(links[0].href).toBe('https://outer')
    expect(links[0].children).toHaveLength(1)
    expect(links[0].children[0].type).toBe('image')
    expect(texts).toHaveLength(0)
  })
})
