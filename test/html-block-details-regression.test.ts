import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

function expectDetailsContainer(markdown: string, name: string) {
  for (const final of [false, true]) {
    const md = getMarkdown(`${name}-${final}`)
    const nodes = parseMarkdownToStructure(markdown, md, { final }) as any[]

    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type).toBe('html_block')
    expect(nodes[0]?.tag).toBe('details')
    expect(String(nodes[0]?.raw ?? '')).toBe(markdown)
  }
}

describe('html block details regression', () => {
  it('keeps details as one container node while rendering trailing blocks into html children content', () => {
    const markdown = `<details style="color:gray;background-color: #f8f8f8;padding: 8px;border-radius: 4px;" open> <summary> Thinking... </summary>
好的，我需要帮用户生成首次病程记录。首先得仔细阅读提供的入院记录内容，确保所有信息都被正确提取。这里是详情

首先。。。。
</details>
`

    expectDetailsContainer(markdown, 'html-block-details-regression')

    const md = getMarkdown('html-block-details-regression-structure')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const details = nodes[0]
    const summary = details?.children?.[0]
    const introParagraph = details?.children?.[1]

    expect(String(details?.content ?? '')).toContain('<p>首先。。。。</p>')
    expect(details?.attrs).toEqual([
      ['style', 'color:gray;background-color: #f8f8f8;padding: 8px;border-radius: 4px;'],
      ['open', ''],
    ])
    expect(details?.children).toHaveLength(3)
    expect(summary?.type).toBe('html_block')
    expect(summary?.tag).toBe('summary')
    expect(summary?.attrs).toBeUndefined()
    expect(summary?.children?.[0]?.type).toBe('text')
    expect(summary?.children?.[0]?.content).toContain('Thinking')
    expect(introParagraph?.type).toBe('paragraph')
    expect(introParagraph?.children?.[0]?.content).toContain('这里是详情')
    expect(details?.children?.[2]?.type).toBe('paragraph')
    expect(details?.children?.[2]?.children?.[0]?.content).toBe('首先。。。。')
  })

  it('keeps the blank line paragraph inside details while streaming before the closing tag arrives', () => {
    const chunks = [
      `<details style="color:gray;background-color: #f8f8f8;padding: 8px;border-radius: 4px;" open> <summary> Thinking... </summary>
好的，我需要帮用户生成首次病程记录。首先得仔细阅读提供的入院记录内容，确保所有信息都被正确提取。这里是详情

`,
      `首先。。。。
`,
      '</details>',
    ]

    const md = getMarkdown('html-block-details-streaming')
    let markdown = ''

    for (let i = 0; i < chunks.length; i++) {
      markdown += chunks[i]
      const final = i === chunks.length - 1
      const nodes = parseMarkdownToStructure(markdown, md, { final }) as any[]
      const hasTrailingParagraph = markdown.includes('首先。。。。')

      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.type).toBe('html_block')
      expect(nodes[0]?.tag).toBe('details')

      if (!final) {
        expect(nodes[0]?.loading).toBe(true)
        if (hasTrailingParagraph) {
          expect(String(nodes[0]?.content ?? '')).toContain('<p>首先。。。。</p>')
          expect(nodes[0]?.children?.[0]?.tag).toBe('summary')
          expect(nodes[0]?.children?.[1]?.type).toBe('paragraph')
          expect(nodes[0]?.children?.[2]?.type).toBe('paragraph')
        }
        else {
          expect(String(nodes[0]?.content ?? '')).not.toContain('<p>首先。。。。</p>')
          expect(nodes[0]?.children?.[0]?.tag).toBe('summary')
          expect(nodes[0]?.children?.[1]?.type).toBe('paragraph')
          expect(nodes[0]?.children ?? []).toHaveLength(2)
        }
      }

      if (final) {
        expect(nodes[0]?.loading).toBe(false)
        expect(String(nodes[0]?.content ?? '')).toContain('<p>首先。。。。</p>')
        expect(String(nodes[0]?.raw ?? '')).toBe(markdown)
      }
    }
  })

  it('keeps nested details blocks grouped under the outer details container', () => {
    const markdown = `<details open>
<summary>outer</summary>
outer start

<details>
<summary>inner</summary>

inner body
</details>

after inner
</details>`

    expectDetailsContainer(markdown, 'html-block-details-nested')

    const md = getMarkdown('html-block-details-nested-structure')
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    const outer = nodes[0]
    const outerSummary = outer?.children?.find((child: any) => child?.type === 'html_block' && child?.tag === 'summary')
    const inner = outer?.children?.find((child: any) => child?.type === 'html_block' && child?.tag === 'details')
    const trailingParagraph = outer?.children?.find((child: any) => child?.type === 'paragraph' && child?.children?.[0]?.content === 'after inner')

    expect(outerSummary).toBeDefined()
    expect(inner).toBeDefined()
    expect(inner?.children?.[0]?.tag).toBe('summary')
    expect(String(inner?.content ?? '')).toContain('<p>inner body</p>')
    expect(trailingParagraph?.children?.[0]?.content).toBe('after inner')
  })

  it('keeps complex markdown children inside details and preserves the trailing closing newline', () => {
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
    const details = nodes[0]

    expect(nodes).toHaveLength(1)
    expect(details?.tag).toBe('details')
    expect(String(details?.raw ?? '')).toBe(markdown)
    expect(String(details?.content ?? '')).toContain('<ul>')
    expect(String(details?.content ?? '')).toContain('<blockquote>')
    expect(String(details?.content ?? '')).toContain('data-lang="js"')
    expect(String(details?.content ?? '')).toContain('<p>tail</p>')
    expect(details?.children?.map((child: any) => child?.type === 'html_block' ? `${child?.type}:${child?.tag}` : child?.type))
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
    const details = nodes[0]
    const summary = details?.children?.[0]
    const summaryChildren = summary?.children ?? []

    expect(nodes).toHaveLength(1)
    expect(details?.tag).toBe('details')
    expect(summary?.tag).toBe('summary')
    expect(details?.attrs).toEqual([['open', '']])
    expect(summaryChildren?.[0]?.type).toBe('strong')
    expect(summaryChildren?.[0]?.children?.[0]?.content).toBe('sum')
    expect(summaryChildren?.[2]?.type).toBe('emphasis')
    expect(summaryChildren?.[2]?.children?.[0]?.content).toBe('x')
    expect(details?.children?.[1]?.children?.[0]?.content).toBe('body')
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
    const details = nodes[0]

    expect(nodes).toHaveLength(1)
    expect(details?.tag).toBe('details')
    expect(details?.attrs).toEqual([['open', '']])
    expect(details?.children?.map((child: any) => child?.type === 'html_block' ? `${child?.type}:${child?.tag}` : child?.type))
      .toEqual(['paragraph', 'html_block:summary', 'paragraph', 'html_block:div', 'paragraph'])
    expect(details?.children?.[0]?.children?.[0]?.content).toBe('lead')
    expect(details?.children?.[1]?.children?.[0]?.content).toBe('sum')
    expect(details?.children?.[2]?.children?.[0]?.content).toBe('text')
    expect(details?.children?.[3]?.tag).toBe('div')
    expect(details?.children?.[4]?.children?.[0]?.content).toBe('para')
  })
})
