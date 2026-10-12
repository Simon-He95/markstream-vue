import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import { links, textIncludes } from './utils/midstate-utils'

const md = getMarkdown('t')

const MARKDOWN = `**Markdown链接**：  
1. [GitHub官网](https://github.com)  
2. [知乎 - 有问题就会有答案](https://www.zhihu.com)  
3. **加粗链接**：[Google](https://www.google.com)  
4. 嵌套格式的链接：[*斜体链接*](https://example.com)  

**普通链接**：  
1. https://www.wikipedia.org  
2. http://example.com/path?query=test  
3. 纯文本URL：https://markdown-guide.readthedocs.io
`

describe('link parsing', () => {
  it('parses inline and bare links into link nodes', () => {
    const nodes = parseMarkdownToStructure(MARKDOWN, md)
    // Flatten paragraph children for assertions
    const allLinkNodes: any[] = []
    const collect = (n: any) => {
      if (!n)
        return
      if (n.type === 'link')
        allLinkNodes.push(n)
      if (Array.isArray(n.children)) {
        for (const c of n.children) collect(c)
      }
      if (Array.isArray(n.items)) {
        for (const it of n.items) collect(it)
      }
    }
    for (const n of nodes) collect(n)

    // Some links may initially be loading (href empty) but should include texts
    const texts = allLinkNodes.map(l => l.text?.toString() || '')

    expect(texts).toContain('GitHub官网')
    expect(texts).toContain('知乎 - 有问题就会有答案')
    expect(texts).toContain('Google')
    expect(texts).toContain('https://www.wikipedia.org')
    expect(texts).toContain('http://example.com/path?query=test')
    expect(texts).toContain('https://markdown-guide.readthedocs.io')

    // The parser may keep emphasis markup in link.text (e.g. "*斜体链接*"),
    // so accept either the raw form or verify the nested emphasis child contains the plain text.
    // The parser may keep emphasis markup in link.text or emit nested emphasis nodes.
    // Accept any of these by inspecting the link nodes with the tolerant helper.
    const foundItalic = allLinkNodes.some(l =>
      textIncludes(l, '斜体链接') || textIncludes(l, '*斜体链接*') || textIncludes(l, '_斜体链接_'),
    )
    expect(foundItalic).toBe(true)

    // Check for bare URLs rendered as text nodes inside paragraphs
    const containsBare = nodes.some((n: any) => {
      return textIncludes(n, 'https://www.wikipedia.org') || textIncludes(n, 'http://example.com/path?query=test') || textIncludes(n, 'https://markdown-guide.readthedocs.io')
    })
    expect(containsBare).toBe(true)
  })

  it('test the link tag', () => {
    const nodes = parseMarkdownToStructure(`<a href="https://example.com">Example</a>`, md) as any
    const p = nodes[0]
    const children = p.children
    expect(children.length).toBe(1)
    const link = p.children[0]
    expect(link.type).toBe('link')
    expect(link.href).toBe('https://example.com')
    expect(link.text).toBe('Example')
    expect(link.children[0].type).toBe('text')
    expect(link.children[0].content).toBe('Example')
  })

  it('test the intermediate state of the link tag', () => {
    const nodes = parseMarkdownToStructure(`<a href="https://example.com">`, md) as any
    expect(nodes.length).toBe(1)
  })

  it('parses link with parentheses and CJK brackets as a single link', () => {
    const special = '[【名称】(test).mp4](https://github.com/Simon-He95/markstream-vueer)'
    const nodes = parseMarkdownToStructure(special, md)

    // Flatten and collect link nodes
    const links: any[] = []
    const walk = (n: any) => {
      if (!n)
        return
      if (n.type === 'link')
        links.push(n)
      if (Array.isArray(n.children))
        n.children.forEach(walk)
      if (Array.isArray(n.items))
        n.items.forEach(walk)
    }
    nodes.forEach(walk)
    // Expect only a single link node in the paragraph without stray text nodes
    expect(links.length).toBe(1)
    expect(links[0].href).toBe('https://github.com/Simon-He95/markstream-vueer')
    // Ensure the full visible text is preserved inside the link
    // Accept either direct text aggregation or nested children text
    const text = links[0].text || ''
    const childText = (links[0].children || [])
      .map((c: any) => (c.content ?? c.text ?? ''))
      .join('')
    expect(text || childText).toBe('【名称】(test).mp4')

    // Also assert the paragraph has exactly one child which is the link
    const para = nodes.find((n: any) => n.type === 'paragraph') as any
    expect(para).toBeTruthy()
    expect(Array.isArray(para.children)).toBe(true)
    expect(para.children.length).toBe(1)
    expect(para.children[0].type).toBe('link')
  })

  it('parses link with parentheses and emphasis and ListNode', () => {
    const special = '- **[Link (Test 1)](https://simonhe.me/)**'
    const nodes = parseMarkdownToStructure(special, md)
    expect(nodes[0]).toMatchInlineSnapshot(`
      {
        "items": [
          {
            "children": [
              {
                "children": [
                  {
                    "children": [
                      {
                        "attrs": [
                          [
                            "href",
                            "https://simonhe.me/",
                          ],
                        ],
                        "children": [
                          {
                            "center": false,
                            "content": "Link (Test 1)",
                            "raw": "Link (Test 1)",
                            "type": "text",
                          },
                        ],
                        "href": "https://simonhe.me/",
                        "loading": false,
                        "markup": "",
                        "raw": "[Link (Test 1)](https://simonhe.me/)",
                        "text": "Link (Test 1)",
                        "title": null,
                        "type": "link",
                      },
                    ],
                    "raw": "**Link (Test 1)**",
                    "type": "strong",
                  },
                ],
                "raw": "**[Link (Test 1)](https://simonhe.me/)**",
                "type": "paragraph",
              },
            ],
            "raw": "**[Link (Test 1)](https://simonhe.me/)**",
            "type": "list_item",
          },
        ],
        "ordered": false,
        "raw": "**[Link (Test 1)](https://simonhe.me/)**",
        "start": undefined,
        "type": "list",
      }
    `)
  })

  it('parses link with parentheses and emphasis', () => {
    const special = '**[Link (Test 2)](https://simonhe.me/)**'
    const nodes = parseMarkdownToStructure(special, md)
    expect(nodes[0]).toMatchInlineSnapshot(`
      {
        "children": [
          {
            "children": [
              {
                "attrs": [
                  [
                    "href",
                    "https://simonhe.me/",
                  ],
                ],
                "children": [
                  {
                    "center": false,
                    "content": "Link (Test 2)",
                    "raw": "Link (Test 2)",
                    "type": "text",
                  },
                ],
                "href": "https://simonhe.me/",
                "loading": false,
                "markup": "",
                "raw": "[Link (Test 2)](https://simonhe.me/)",
                "text": "Link (Test 2)",
                "title": null,
                "type": "link",
              },
            ],
            "raw": "**Link (Test 2)**",
            "type": "strong",
          },
        ],
        "raw": "**[Link (Test 2)](https://simonhe.me/)**",
        "type": "paragraph",
      }
    `)
  })

  it('parses emphasized link with asterisk inside list item', () => {
    const special = '- [*DR (Danmarks Radio)*](https://www.dr.dk/nyheder)'
    const nodes = parseMarkdownToStructure(special, md)

    // Collect link nodes
    const links: any[] = []
    const walk = (n: any) => {
      if (!n)
        return
      if (n.type === 'link')
        links.push(n)
      if (Array.isArray(n.children))
        n.children.forEach(walk)
      if (Array.isArray(n.items))
        n.items.forEach(walk)
    }
    nodes.forEach(walk)

    expect(links.length).toBe(1)
    expect(links[0].href).toBe('https://www.dr.dk/nyheder')
    // The parser may keep emphasis markup in link.text or emit nested emphasis nodes.
    // Accept either form by using the tolerant helper.
    const found
      = textIncludes(links[0], 'DR (Danmarks Radio)')
        || textIncludes(links[0], '*DR (Danmarks Radio)*')
        || textIncludes(links[0], '_DR (Danmarks Radio)_')
    expect(found).toBe(true)
  })

  it('parses URL with inline trailing text (no newline)', () => {
    const mdText = `第一个气泡（无换行）：
http://127.0.0.1:8001/upload/20251118/4737bbe0-c42e-11f0-8471-37360564882d.docx  请在文档末尾增加一段示例内容`
    const nodes = parseMarkdownToStructure(mdText, md)

    expect(
      textIncludes(
        nodes,
        'http://127.0.0.1:8001/upload/20251118/4737bbe0-c42e-11f0-8471-37360564882d.docx',
      ),
    ).toBe(true)
    expect(textIncludes(nodes, '请在文档末尾增加一段示例内容')).toBe(true)
  })

  it('parses URL followed by newline and trailing text', () => {
    const mdText = `第二个气泡（有换行）：
  http://127.0.0.1:8001/upload/20251118/4737bbe0-c42e-11f0-8471-37360564882d.docx  
  请在文档末尾增加一段示例内容`
    const nodes = parseMarkdownToStructure(mdText, md)

    expect(
      textIncludes(
        nodes,
        'http://127.0.0.1:8001/upload/20251118/4737bbe0-c42e-11f0-8471-37360564882d.docx',
      ),
    ).toBe(true)
    expect(textIncludes(nodes, '请在文档末尾增加一段示例内容')).toBe(true)

    // Ensure a hard line break node is present for the newline between URL and trailing text
    let foundHardBreak = false
    const walk = (n: any) => {
      if (!n)
        return
      if (n.type === 'hardbreak')
        foundHardBreak = true
      if (Array.isArray(n.children))
        n.children.forEach(walk)
      if (Array.isArray(n.items))
        n.items.forEach(walk)
    }
    nodes.forEach(walk)
    expect(foundHardBreak).toBe(true)
  })

  it('parses Danish list item with parenthetical URL', () => {
    const special = '- **Kilde:**\u202FGrammatip – “Tekstretter” (https://www.grammatip.com/tekstretter) – her beskrives, hvordan værktøjet automatisk markerer fejl, giver fejltyper, leverer farvekodet feedback, giver lærerne et samlet overblik og muligheden for at tilpasse, hvilke fejl eleven skal se.'
    const nodes = parseMarkdownToStructure(special, md)

    // Find the paragraph node inside the list item
    let para: any = null
    const findPara = (n: any) => {
      if (!n)
        return
      if (n.type === 'paragraph') {
        para = n
        return
      }
      if (Array.isArray(n.children))
        n.children.forEach(findPara)
      if (Array.isArray(n.items))
        n.items.forEach(findPara)
    }
    nodes.forEach(findPara)
    expect(para).toBeTruthy()

    // Flatten paragraph descendants into ordered tokens, marking links specially
    const tokens: string[] = []
    const flatten = (n: any) => {
      if (!n)
        return
      if (n.type === 'link') {
        tokens.push(`<LINK:${n.href || n.text || ''}>`)
        return
      }
      if (n.type === 'text') {
        tokens.push(n.content || n.text || '')
        return
      }
      if (Array.isArray(n.children)) {
        for (const c of n.children) flatten(c)
      }
    }
    flatten(para)

    // There should be at least one link token with the expected href
    const linkIndex = tokens.findIndex(t => t.startsWith('<LINK:'))
    expect(linkIndex).toBeGreaterThanOrEqual(0)
    const linkToken = tokens[linkIndex]
    expect(linkToken).toContain('https://www.grammatip.com/tekstretter')

    // Check text immediately before the link contains the title/context
    const before = tokens[linkIndex - 1] || ''
    const hasBefore = before.includes('Tekstretter') || before.includes('Grammatip') || before.includes('Kilde')
    expect(hasBefore).toBe(true)

    // Check text immediately after the link contains the trailing explanation
    const afterTokens = tokens.slice(linkIndex + 1)
    const afterFull = afterTokens.join('').trim()
    const expectedAfter = ') – her beskrives, hvordan værktøjet automatisk markerer fejl, giver fejltyper, leverer farvekodet feedback, giver lærerne et samlet overblik og muligheden for at tilpasse, hvilke fejl eleven skal se.'
    expect(afterFull).toBe(expectedAfter)
  })

  it('does not include ！ suffix in linkify/autolink bare URLs', () => {
    const cjkBang = '图表URL: https://www.baidu.com/img/flexible/logo/pc/result.png！文字文字'
    const nodes1 = parseMarkdownToStructure(cjkBang, md)
    const l1 = links(nodes1)
    expect(l1.length).toBe(1)
    expect(l1[0].href).toBe('https://www.baidu.com/img/flexible/logo/pc/result.png')
    expect(l1[0].text).toBe('https://www.baidu.com/img/flexible/logo/pc/result.png')
    expect(textIncludes(nodes1, '！文字文字')).toBe(true)
    expect(textIncludes(l1[0], '！')).toBe(false)

    const angle = '<https://www.baidu.com/img/flexible/logo/pc/result.png！文字文字>'
    const nodes3 = parseMarkdownToStructure(angle, md)
    const l3 = links(nodes3)
    expect(l3.length).toBe(1)
    expect(l3[0].href).toBe('https://www.baidu.com/img/flexible/logo/pc/result.png')
    expect(l3[0].text).toBe('https://www.baidu.com/img/flexible/logo/pc/result.png')
    expect(textIncludes(nodes3, '！文字文字')).toBe(true)
    expect(textIncludes(l3[0], '！')).toBe(false)
  })

  it('keeps ASCII ! when it is part of the URL', () => {
    const mdText = [
      'https://example.com/a!b',
      'https://example.com/?q=!',
      'https://example.com/#!',
      '<https://example.com/a!b>',
    ].join('\n')
    const nodes = parseMarkdownToStructure(mdText, md)
    const ls = links(nodes)
    const hrefs = ls.map((l: any) => String(l.href || ''))
    expect(hrefs).toContain('https://example.com/a!b')
    expect(hrefs).toContain('https://example.com/?q=!')
    expect(hrefs).toContain('https://example.com/#!')
  })

  it('does not merge punctuation ! into explicit markdown links', () => {
    const nodes = parseMarkdownToStructure('[x](https://example.com/#)!', md)
    const ls = links(nodes)
    expect(ls.length).toBe(1)
    expect(ls[0].href).toBe('https://example.com/#')
    expect(ls[0].text).toBe('x')
    expect(textIncludes(nodes, '!')).toBe(true)
  })

  it('respects customMarkdownIt validateLink: rejects javascript: and renders as plain text', () => {
    const mdSafe = getMarkdown('validate-link-test')
    mdSafe.set?.({ validateLink: (url: string) => !/^\s*javascript:/i.test(url.trim()) })
    const nodes = parseMarkdownToStructure('[click me](javascript:alert(1))', mdSafe, { final: true })
    const ls = links(nodes)
    expect(ls.length).toBe(0)
    expect(textIncludes(nodes, 'click me')).toBe(true)
    // No link node may have javascript: href (paragraph.raw may still hold original source)
    const anyBadHref = ls.some((l: any) => String(l.href || '').toLowerCase().includes('javascript:'))
    expect(anyBadHref).toBe(false)
  })

  it('respects customMarkdownIt validateLink: allows https when validateLink returns true', () => {
    const mdSafe = getMarkdown('validate-link-allow')
    mdSafe.set?.({ validateLink: (url: string) => url.startsWith('https://') })
    const nodes = parseMarkdownToStructure('[safe](https://example.com) [unsafe](http://example.com)', mdSafe, { final: true })
    const ls = links(nodes)
    expect(ls.length).toBe(1)
    expect(ls[0].href).toBe('https://example.com')
    expect(ls[0].text).toBe('safe')
    expect(textIncludes(nodes, 'unsafe')).toBe(true)
  })
})
