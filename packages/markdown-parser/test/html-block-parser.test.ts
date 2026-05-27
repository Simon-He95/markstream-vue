import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

function firstHtml(nodes: any[]) {
  return nodes.find(n => n.type === 'html_block')
}

describe('html_block parser', () => {
  it('marks unclosed <div> as loading and appends closing tag', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<div>hello', md)
    const html = firstHtml(nodes) as any
    expect(html).toBeDefined()
    expect(html.type).toBe('html_block')
    expect(html.tag).toBe('div')
    expect(html.loading).toBe(true)
    expect(html.content).toContain('</div>')
  })

  it('handles uppercase closing tag case-insensitively', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<DIV>Hi</DIV>', md)
    const html = firstHtml(nodes) as any
    expect(html.loading).toBe(false)
    expect(html.tag).toBe('div')
  })

  it('treats void tags as closed (no loading, no fake close)', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<br>', md)
    const html = firstHtml(nodes) as any
    expect(html.loading).toBe(false)
    expect(String(html.content)).not.toContain('</br>')
  })

  it('treats self-closing first tag as closed', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<img src="/x.png" />', md)
    const html = firstHtml(nodes) as any
    expect(html.loading).toBe(false)
    expect(String(html.content)).toContain('<img')
    expect(String(html.content)).not.toContain('</img>')
  })

  it('does not attempt to close comments/doctypes/PIs', () => {
    const md = getMarkdown()
    const a = firstHtml(parseMarkdownToStructure('<!-- comment -->', md)) as any
    const b = firstHtml(parseMarkdownToStructure('<!DOCTYPE html>', md)) as any
    const c = firstHtml(parseMarkdownToStructure('<?xml version="1.0"?>', md)) as any
    expect(a?.loading).toBe(false)
    expect(b?.loading).toBe(false)
    expect(c?.loading).toBe(false)
  })

  it('does not let HTML comments absorb following Markdown blocks', () => {
    const markdown = `<!-- 基础图片 -->
![alt](https://example.com/a.png)

## 标题

---

正文`

    const md = getMarkdown('html-comment-followed-by-markdown')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes.map(node => node.type)).toEqual([
      'html_block',
      'paragraph',
      'heading',
      'thematic_break',
      'paragraph',
    ])
    expect(String(nodes[0]?.raw ?? '').trim()).toBe('<!-- 基础图片 -->')
    expect(nodes[1]?.children?.[0]?.type).toBe('image')
    expect(nodes[1]?.children?.[0]?.src).toBe('https://example.com/a.png')
    expect(nodes[2]?.text).toBe('标题')
    expect(nodes[4]?.children?.[0]?.content).toBe('正文')
  })

  it('keeps outer same-tag html blocks loading until the matching outer close arrives', () => {
    const md = getMarkdown()
    const nodes = parseMarkdownToStructure('<div>outer<div>inner</div>rest', md, { final: false })
    const html = firstHtml(nodes) as any
    expect(html).toBeDefined()
    expect(html.type).toBe('html_block')
    expect(html.tag).toBe('div')
    expect(html.loading).toBe(true)
  })

  it('combines details blocks into a single container node with parsed children', () => {
    const markdown = `<details open>
<summary>Thinking...</summary>
这里是详情

首先。。。。
</details>
`

    const md = getMarkdown('html-block-details-container')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const html = firstHtml(nodes) as any
    const summary = html?.children?.[0]

    expect(nodes).toHaveLength(1)
    expect(html?.tag).toBe('details')
    expect(html?.attrs).toEqual([['open', '']])
    expect(String(html?.raw ?? '')).toBe(markdown)
    expect(String(html?.content ?? '')).toContain('<p>首先。。。。</p>')
    expect(summary?.tag).toBe('summary')
    expect(summary?.children?.[0]?.type).toBe('text')
    expect(summary?.children?.[0]?.content).toContain('Thinking')
    expect(html?.children?.[1]?.type).toBe('paragraph')
    expect(html?.children?.[2]?.type).toBe('paragraph')
  })

  it('keeps nested details grouped under the outer details container', () => {
    const markdown = `<details open>
<summary>outer</summary>
outer start

<details>
<summary>inner</summary>

inner body
</details>

after inner
</details>`

    for (const final of [false, true]) {
      const md = getMarkdown(`html-block-details-nested-container-${final}`)
      const nodes = parseMarkdownToStructure(markdown, md, { final }) as any[]
      const outer = firstHtml(nodes) as any
      const outerSummary = outer?.children?.find((child: any) => child?.type === 'html_block' && child?.tag === 'summary')
      const inner = outer?.children?.find((child: any) => child?.type === 'html_block' && child?.tag === 'details')

      expect(nodes).toHaveLength(1)
      expect(outer?.tag).toBe('details')
      expect(String(outer?.raw ?? '')).toBe(markdown)
      expect(outerSummary).toBeDefined()
      expect(inner).toBeDefined()
      expect(inner?.children?.[0]?.tag).toBe('summary')
      expect(String(inner?.content ?? '')).toContain('<p>inner body</p>')
    }
  })

  it('keeps complex markdown blocks inside details and preserves the closing newline', () => {
    const markdown = `<details open>
<summary>sum</summary>

- a
- b

> q

\`\`\`js
console.log(1)
\`\`\`

tail
</details>
`

    const md = getMarkdown('html-block-details-complex')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const html = firstHtml(nodes) as any

    expect(nodes).toHaveLength(1)
    expect(html?.tag).toBe('details')
    expect(String(html?.raw ?? '')).toBe(markdown)
    expect(String(html?.content ?? '')).toContain('<ul>')
    expect(String(html?.content ?? '')).toContain('<blockquote>')
    expect(String(html?.content ?? '')).toContain('data-lang="js"')
    expect(String(html?.content ?? '')).toContain('<p>tail</p>')
    expect(html?.children?.map((child: any) => child?.type === 'html_block' ? `${child?.type}:${child?.tag}` : child?.type))
      .toEqual(['html_block:summary', 'list', 'blockquote', 'code_block', 'paragraph'])
  })

  it('parses markdown inside summary into summary children', () => {
    const markdown = `<details open>
<summary>**sum** _x_</summary>

body
</details>
`

    const md = getMarkdown('html-block-details-summary-markdown')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const html = firstHtml(nodes) as any
    const summary = html?.children?.[0]
    const summaryChildren = summary?.children ?? []

    expect(nodes).toHaveLength(1)
    expect(summary?.tag).toBe('summary')
    expect(html?.attrs).toEqual([['open', '']])
    expect(summaryChildren?.[0]?.type).toBe('strong')
    expect(summaryChildren?.[0]?.children?.[0]?.content).toBe('sum')
    expect(summaryChildren?.[2]?.type).toBe('emphasis')
    expect(summaryChildren?.[2]?.children?.[0]?.content).toBe('x')
    expect(html?.children?.[1]?.children?.[0]?.content).toBe('body')
  })

  it('keeps opener content before and after summary as structured children', () => {
    const markdown = `<details open>
lead
<summary>sum</summary>
text
<div>inner</div>

para
</details>
`

    const md = getMarkdown('html-block-details-opener-mixed')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const html = firstHtml(nodes) as any

    expect(nodes).toHaveLength(1)
    expect(html?.attrs).toEqual([['open', '']])
    expect(html?.children?.map((child: any) => child?.type === 'html_block' ? `${child?.type}:${child?.tag}` : child?.type))
      .toEqual(['paragraph', 'html_block:summary', 'paragraph', 'html_block:div', 'paragraph'])
    expect(html?.children?.[0]?.children?.[0]?.content).toBe('lead')
    expect(html?.children?.[1]?.children?.[0]?.content).toBe('sum')
    expect(html?.children?.[2]?.children?.[0]?.content).toBe('text')
    expect(html?.children?.[3]?.tag).toBe('div')
    expect(html?.children?.[4]?.children?.[0]?.content).toBe('para')
  })

  it('does not absorb content after a self-contained details block', () => {
    const markdown = `<details style="color:gray;background-color: #f8f8f8;padding: 8px;border-radius: 4px;" open> <summary> Thinking... </summary> 好的，我现在需要处理用户的问题："你是谁"。首先，我要按照用户设定的规则来回答。用户要求先检查提供的上下文（context）中的信息，如果在里面找不到答案，再用 \n</details> \n\n我是通义千问，阿里巴巴集团旗下的超大规模语言模型。我能够帮助你回答问题、创作文字（如写故事、写公文、写邮件、写剧本等）、进行逻辑推理、编程等任务，并支持多语言交流。\n`

    const md = getMarkdown('html-block-details-self-contained')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('details')
    expect(nodes[1]?.type).toBe('paragraph')
  })

  it('self-contained details with no trailing content produces a single node', () => {
    const markdown = `<details open> <summary>S</summary> body \n</details>\n`

    const md = getMarkdown('html-block-self-contained-no-trailing')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('details')
    expect((nodes[0] as any)?.loading).toBe(false)
  })

  it('self-contained details followed by a heading keeps them separate', () => {
    const markdown = `<details open> <summary>S</summary> body \n</details>\n\n# Heading\n`

    const md = getMarkdown('html-block-self-contained-heading')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('details')
    expect(nodes[1]?.type).toBe('heading')
  })

  it('two consecutive self-contained details blocks stay separate', () => {
    const markdown = `<details open> <summary>A</summary> aaa \n</details>\n\n<details> <summary>B</summary> bbb \n</details>\n`

    const md = getMarkdown('html-block-self-contained-consecutive')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('details')
    expect(nodes[1]?.type).toBe('html_block')
    expect(nodes[1]?.tag).toBe('details')
  })

  it('self-contained details followed by a multi-line details block stay separate', () => {
    const markdown = `<details open> <summary>A</summary> aaa \n</details>\n\n<details>\n<summary>B</summary>\n\nbbb\n</details>\n`

    const md = getMarkdown('html-block-self-contained-then-multiline')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('details')
    expect(nodes[1]?.type).toBe('html_block')
    expect(nodes[1]?.tag).toBe('details')
    expect(String(nodes[1]?.content ?? '')).toContain('<p>bbb</p>')
  })

  it('self-contained details followed by a code block stay separate', () => {
    const markdown = '<details open> <summary>S</summary> body \n</details>\n\n```js\nconsole.log(1)\n```\n'

    const md = getMarkdown('html-block-self-contained-code')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('details')
    expect(nodes[1]?.type).toBe('code_block')
  })

  it('self-contained details in streaming mode does not absorb following content', () => {
    const markdown = `<details open> <summary>S</summary> body \n</details> \n\n我是通义千问\n`

    for (const final of [false, true]) {
      const md = getMarkdown(`html-block-self-contained-stream-${final}`)
      const nodes = parseMarkdownToStructure(markdown, md, { final }) as any[]

      expect(nodes).toHaveLength(2)
      expect(nodes[0]?.type).toBe('html_block')
      expect(nodes[0]?.tag).toBe('details')
      expect((nodes[0] as any)?.loading).toBe(false)
      expect(nodes[1]?.type).toBe('paragraph')
    }
  })

  it('self-contained details preserves attributes correctly', () => {
    const markdown = `<details style="background:#f8f8f8" open> <summary>S</summary> body \n</details>\n\npara\n`

    const md = getMarkdown('html-block-self-contained-attrs')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(2)
    const details = nodes[0] as any
    expect(details?.tag).toBe('details')
    expect(details?.attrs).toEqual([['style', 'background:#f8f8f8'], ['open', '']])
    expect(details?.children?.find((c: any) => c?.tag === 'summary')).toBeDefined()
    expect(nodes[1]?.type).toBe('paragraph')
  })

  it('self-contained details preserves summary children and body text', () => {
    const markdown = `<details open> <summary> Thinking... </summary> 好的 \n</details> \n\n我是通义千问\n`

    const md = getMarkdown('html-block-self-contained-children')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes).toHaveLength(2)
    const details = nodes[0] as any
    expect(details?.tag).toBe('details')
    expect(details?.loading).toBe(false)
    const summary = details?.children?.find((c: any) => c?.tag === 'summary')
    expect(summary).toBeDefined()
    expect(nodes[1]?.type).toBe('paragraph')
  })

  it('self-contained details followed by multiple paragraphs stays separate from all', () => {
    const markdown = `<details open> <summary>S</summary> body \n</details> \n\npara1\n\npara2\n`

    const md = getMarkdown('html-block-self-contained-multi-para')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]

    expect(nodes.length).toBeGreaterThanOrEqual(2)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('details')
    for (let k = 1; k < nodes.length; k++) {
      expect(nodes[k]?.type).not.toBe('html_block')
    }
  })
})
