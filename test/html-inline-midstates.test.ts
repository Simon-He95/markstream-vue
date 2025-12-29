import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import { collect, hasNode, textIncludes } from './utils/midstate-utils'

describe('html inline streaming mid-states', () => {
  const md = getMarkdown('html-inline-midstates')
  const mdCustom = getMarkdown('html-inline-custom', { customHtmlTags: ['thinking'] })
  const mdCustomMulti = getMarkdown('html-inline-custom-multi', { customHtmlTags: ['thinking', 'hint'] })

  it('suppresses partial opening tags in text tokens', () => {
    const nodes = parseMarkdownToStructure('x <span class="a"', md)
    const p = collect(nodes, 'paragraph')[0] as any
    expect(p).toBeTruthy()
    expect(textIncludes(p, 'x')).toBe(true)
    expect(textIncludes(p, '<span')).toBe(false)
  })

  it('suppresses partial opening tags without attrs', () => {
    const nodes = parseMarkdownToStructure('x <span', md)
    const p = collect(nodes, 'paragraph')[0] as any
    expect(p).toBeTruthy()
    expect(textIncludes(p, 'x')).toBe(true)
    expect(textIncludes(p, '<span')).toBe(false)
  })

  it('suppresses partial <font ...> while typing (legacy inline tag)', () => {
    const nodes = parseMarkdownToStructure('**<font color="red"', md)
    expect(textIncludes(nodes as any, '<font')).toBe(false)
  })

  it('suppresses partial opening tag prefixes like "<fo" while typing', () => {
    const nodes = parseMarkdownToStructure('x <fo', md)
    expect(textIncludes(nodes as any, '<fo')).toBe(false)
    expect(textIncludes(nodes as any, 'x')).toBe(true)
  })

  it('does not treat a dangling "*" line as a list item (common while typing "**...")', () => {
    const nodes = parseMarkdownToStructure('alpha\n*', md)
    expect(hasNode(nodes as any, 'list')).toBe(false)
    expect(textIncludes(nodes as any, '*')).toBe(false)
    expect(textIncludes(nodes as any, 'alpha')).toBe(true)
  })

  it('does not render partial thematic break prefixes "-"/"--" while typing "---"', () => {
    const n1 = parseMarkdownToStructure('alpha\n\n-\n', md)
    expect(textIncludes(n1 as any, '-')).toBe(false)
    expect(hasNode(n1 as any, 'list')).toBe(false)

    const n2 = parseMarkdownToStructure('alpha\n\n--', md)
    expect(textIncludes(n2 as any, '--')).toBe(false)

    const n3 = parseMarkdownToStructure('alpha\n\n---\n', md)
    expect(hasNode(n3 as any, 'thematic_break')).toBe(true)
  })

  it('does not render a dangling blockquote marker ">" while typing', () => {
    const n1 = parseMarkdownToStructure('alpha\n\n>\n', md)
    expect(hasNode(n1 as any, 'blockquote')).toBe(false)
    expect(textIncludes(n1 as any, '>')).toBe(false)

    const n2 = parseMarkdownToStructure('alpha\n\n> quote\n', md)
    expect(hasNode(n2 as any, 'blockquote')).toBe(true)
    expect(textIncludes(n2 as any, 'quote')).toBe(true)
  })

  it('supports custom inline tags for mid-state suppression', () => {
    const nodes = parseMarkdownToStructure('x <thinking foo="bar"', mdCustom)
    expect(textIncludes(nodes, '<thinking')).toBe(false)
  })

  it('suppresses partial opening tags when ">" appears inside quotes', () => {
    const nodes = parseMarkdownToStructure('x <a href="https://example.com?q=a>b', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '<a')).toBe(false)
    expect(hasNode(nodes, 'link')).toBe(false)
  })

  it('suppresses partial custom tags when adjacent to text', () => {
    const nodes = parseMarkdownToStructure('x<thinking foo="bar"', mdCustom)
    expect(textIncludes(nodes, '<thinking')).toBe(false)
    expect(textIncludes(nodes, 'x')).toBe(true)
  })

  it('suppresses partial tag when line starts with "<tag"', () => {
    const nodes = parseMarkdownToStructure('<span class="a"', md)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('suppresses partial closing when line starts with "</tag"', () => {
    const nodes = parseMarkdownToStructure('</sp', md)
    expect(textIncludes(nodes, '</sp')).toBe(false)
  })

  it('suppresses partial custom closing prefixes like "</think" while typing', () => {
    const nodes = parseMarkdownToStructure('</think', mdCustom)
    expect(textIncludes(nodes as any, '</think')).toBe(false)
  })

  it('allows html_inline once tag_open is complete', () => {
    const nodes = parseMarkdownToStructure('x <span class="a">hello', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
  })

  it('auto-closes custom tags as html_inline and keeps loading', () => {
    const nodes = parseMarkdownToStructure('x <thinking>hi', mdCustom, { customHtmlTags: ['thinking'] })
    expect(hasNode(nodes, 'thinking')).toBe(true)
    const thinking = collect(nodes, 'thinking')[0] as any
    expect(thinking.loading).toBe(true)
    expect(thinking.autoClosed).toBe(true)
    expect(thinking.content).toContain('hi')
  })

  it('suppresses partial opening tag when adjacent to text', () => {
    const nodes = parseMarkdownToStructure('x<span class="a"', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('parses html_inline when adjacent to text and tag_open is complete', () => {
    const nodes = parseMarkdownToStructure('x<span class="a">hello', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, 'hello')).toBe(true)
  })

  it('filters partial closing tags when tag is adjacent to text', () => {
    const nodes = parseMarkdownToStructure('x<span>hello</sp', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    expect(textIncludes(nodes, 'hello')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span>')).toBe(false)
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('filters partial closing tags from html_inline content', () => {
    const nodes = parseMarkdownToStructure('x <span>hello</sp', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    expect(textIncludes(nodes, 'hello')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span>')).toBe(false)
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('finalizes html_inline when closing tag completes', () => {
    const nodes = parseMarkdownToStructure('x <span>hello</span>', md)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html).toBeTruthy()
    expect(html.loading).toBe(false)
    expect(html.content).toContain('</span>')
  })
  it('filters partial closing tags from html_inline content with attrs', () => {
    const nodes = parseMarkdownToStructure('x <span style="color: red">我是 span 元素标签</', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    expect(textIncludes(nodes, 'x ')).toBe(true)
    expect(textIncludes(nodes, '我是 span 元素标签')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</')).toBe(false)
  })
  it('filters partial closing tags from html_inline content with attrs -1', () => {
    const nodes = parseMarkdownToStructure('x<span style="color: red">我是 span 元素标签', md)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '我是 span 元素标签')).toBe(true)
    expect(textIncludes(html.children, '</')).toBe(false)
  })

  it('suppresses bare closing prefix "</" while typing', () => {
    const nodes = parseMarkdownToStructure('x <span>hello</', md)
    expect(textIncludes(nodes, 'hello')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</')).toBe(false)
  })

  it('suppresses trailing "<" while typing', () => {
    const nodes = parseMarkdownToStructure('x <', md)
    const p = collect(nodes, 'paragraph')[0] as any
    expect(p).toBeTruthy()
    expect(textIncludes(p, 'x')).toBe(true)
    expect(textIncludes(p, '<')).toBe(false)
  })

  it('handles list item with partial closing tag', () => {
    const nodes = parseMarkdownToStructure('- x <span style="color: red">xxx</sp\n', md)
    // list mid-state tolerance: might be list or paragraph depending on parser rules
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('handles list item with partial opening tag', () => {
    const nodes = parseMarkdownToStructure('- x <span style="color: red"\n', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('handles list item with partial opening tag-1', () => {
    const nodes = parseMarkdownToStructure('- x<span style="color: red"\n', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('handles list item with partial opening tag-2', () => {
    const nodes = parseMarkdownToStructure('- x<span style="color: red">hihi', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(nodes, 'hihi')).toBe(true)
  })

  it('handles list item with partial opening tag-3', () => {
    const nodes = parseMarkdownToStructure('- x<span style="color: red">hihi</', md)
    expect(textIncludes(nodes, 'x')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(html.children, '</')).toBe(false)
    expect(textIncludes(nodes, 'hihi')).toBe(true)
  })

  it('handles table cell with partial opening tag', () => {
    const markdown = `| a | b |\n| - | - |\n| x <span class="a" | y |`
    const nodes = parseMarkdownToStructure(markdown, md)
    expect(hasNode(nodes, 'table')).toBe(true)
    expect(textIncludes(nodes, '<span')).toBe(false)
  })

  it('handles table cell with partial closing tag', () => {
    const markdown = `| a |\n| - |\n| x <span>y</sp |`
    const nodes = parseMarkdownToStructure(markdown, md)
    expect(hasNode(nodes, 'table')).toBe(true)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('handles table cell with partial closing tag -1', () => {
    const markdown = `| a |\n| - |\n| x<span>y</sp |`
    const nodes = parseMarkdownToStructure(markdown, md)
    expect(hasNode(nodes, 'table')).toBe(true)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('handles table cell with partial closing tag -2', () => {
    const markdown = `| a |\n| - |\n| x<span style="color: red">y |`
    const nodes = parseMarkdownToStructure(markdown, md)
    const html = collect(nodes, 'html_inline')[0] as any
    expect(html.loading).toBe(true)
    expect(textIncludes(html.children, '<span')).toBe(false)
    expect(textIncludes(nodes, 'x')).toBe(true)
    expect(hasNode(nodes, 'table')).toBe(true)
    expect(hasNode(nodes, 'html_inline')).toBe(true)
    expect(textIncludes(html.children, '</sp')).toBe(false)
  })

  it('i - parses multi-line <thinking> blocks with nested inline html', () => {
    const markdown = `<thinking>
✅ 获取用户当前输入：针对整体数据诊断分析

---

✅ 开始执行意图识别：整体分析

**<font color="red">不同管线维度异常原因分布饼状图</font>**
</thinking>

<thinking>
嗯，我需要帮助用户对他们的数据分析结果进行整体诊断。首先，我会回顾一下提供的数据表格和两个案例，理解各项指标的含义。

看到第一个案例是xxxxxxxxxxx，说明有多个问题存在。这个测试涉及14个场景，完成了19次测试。分数较测试数据。

</thinking>`

    // Ensure token stream does not contain orphan paragraph_close after fixes.
    const toks = mdCustom.parse(markdown, {}) as any[]
    const opens = toks.filter(t => t?.type === 'paragraph_open').length
    const closes = toks.filter(t => t?.type === 'paragraph_close').length
    expect(closes).toBe(opens)

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })

    expect(nodes.map(n => n.type)).toEqual(['thinking', 'thinking'])
    const thinkingNodes = collect(nodes, 'thinking') as any[]
    expect(thinkingNodes.length).toBe(2)
    for (const t of thinkingNodes) {
      expect(t.loading).toBe(false)
      expect(t.autoClosed).toBeFalsy()
    }
    expect(thinkingNodes[0].content).toContain('✅ 获取用户当前输入')
    expect(thinkingNodes[0].content).toContain('不同管线维度异常原因分布饼状图')
    expect(thinkingNodes[1].content).toContain('嗯，我需要帮助用户')

    // content should be inner only; wrapper tags stay in raw
    expect(thinkingNodes[0].content).not.toContain('<thinking')
    expect(thinkingNodes[0].content).not.toContain('</thinking')

    // Ensure thematic break line is preserved inside the extracted content
    // (it should render as a `thematic_break` node when re-parsing the inner markdown).
    expect(String(thinkingNodes[0].raw ?? '')).toContain('---')
    expect(String(thinkingNodes[0].content ?? '')).toContain('---')

    // Assert inner markdown (inside <thinking>) parses both thematic break and strong around <font>...</font>
    const innerNodes = parseMarkdownToStructure(String(thinkingNodes[0].content ?? ''), md)
    expect(hasNode(innerNodes as any, 'thematic_break')).toBe(true)
    expect(hasNode(innerNodes as any, 'strong')).toBe(true)
    const strong = collect(innerNodes as any, 'strong')[0] as any
    expect(strong).toBeTruthy()
    const font = (strong.children ?? []).find((c: any) => c?.type === 'html_inline' && c?.tag === 'font')
    expect(font).toBeTruthy()
  })

  it('thinking.content preserves common markdown blocks for re-render', () => {
    const markdown = `<thinking>
# H1 title

> quoted line

1. ordered one
2. ordered two

- bullet a
- bullet b

| a | b |
| - | - |
| 1 | 2 |

\`\`\`ts
const x = 1
\`\`\`

See [link](https://example.com).
</thinking>`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.length).toBe(1)
    expect(nodes[0]?.type).toBe('thinking')
    const thinking = nodes[0] as any
    expect(thinking.loading).toBe(false)

    const inner = parseMarkdownToStructure(String(thinking.content ?? ''), md)
    expect(hasNode(inner as any, 'heading')).toBe(true)
    expect(hasNode(inner as any, 'blockquote')).toBe(true)
    expect(hasNode(inner as any, 'list')).toBe(true)
    expect(hasNode(inner as any, 'table')).toBe(true)
    expect(hasNode(inner as any, 'code_block')).toBe(true)
    expect(hasNode(inner as any, 'link')).toBe(true)
  })

  it('thinking.content preserves nested list/blockquote mixing', () => {
    const markdown = `<thinking>
> quote level 1
> - item a
>   - nested a1
> - item b

- outer 1
  > inner quote
  > 1. ordered in quote
  > 2. ordered in quote

- outer 2
</thinking>`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.length).toBe(1)
    expect(nodes[0]?.type).toBe('thinking')

    const inner = parseMarkdownToStructure(String((nodes[0] as any).content ?? ''), md)
    expect(hasNode(inner as any, 'blockquote')).toBe(true)
    expect(hasNode(inner as any, 'list')).toBe(true)
    expect(textIncludes(inner as any, 'nested a1')).toBe(true)
    expect(textIncludes(inner as any, 'ordered in quote')).toBe(true)
  })

  it('streaming: unclosed <thinking> preserves unclosed fenced code (no stray fence chars)', () => {
    const part1 = `<thinking>
\`\`\`ts
const a = 1
`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)

    const inner = parseMarkdownToStructure(String((n1[0] as any).content ?? ''), md)
    // In mid-state, we should still have a code_block node and the dangling '`' should not appear.
    expect(hasNode(inner as any, 'code_block')).toBe(true)
    expect(textIncludes(inner as any, '\n`\n')).toBe(false)
  })

  it('thinking.content preserves math inline and block', () => {
    const markdown = `<thinking>
Inline math $a^2 + b^2 = c^2$ end.

$$
\int_0^1 x^2 \, dx
$$
</thinking>`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.length).toBe(1)
    expect(nodes[0]?.type).toBe('thinking')

    const inner = parseMarkdownToStructure(String((nodes[0] as any).content ?? ''), md)
    expect(hasNode(inner as any, 'math_inline')).toBe(true)
    expect(hasNode(inner as any, 'math_block')).toBe(true)
  })

  it('streaming: unclosed <thinking> preserves partial table text (no top-level table leak)', () => {
    const part1 = `<thinking>
| a | b |
| - |`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)
    expect(hasNode(n1 as any, 'table')).toBe(false)

    const inner = parseMarkdownToStructure(String((n1[0] as any).content ?? ''), md)
    // Incomplete table should remain as text, not disappear.
    expect(textIncludes(inner as any, '| a | b |')).toBe(true)
  })

  it('streaming: unclosed <thinking> preserves partial blockquote text (no top-level blockquote leak)', () => {
    const part1 = `<thinking>
> quoted starts
`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)
    expect(hasNode(n1 as any, 'blockquote')).toBe(false)

    const inner = parseMarkdownToStructure(String((n1[0] as any).content ?? ''), md)
    expect(hasNode(inner as any, 'blockquote')).toBe(true)
    expect(textIncludes(inner as any, 'quoted starts')).toBe(true)
  })

  it('streaming: unclosed <thinking> does not render dangling list marker "-" at end', () => {
    const part1 = `<thinking>
alpha
-`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)

    const inner = parseMarkdownToStructure(String((n1[0] as any).content ?? ''), md)
    expect(textIncludes(inner as any, '-')).toBe(false)
    expect(hasNode(inner as any, 'list')).toBe(false)
    expect(textIncludes(inner as any, 'alpha')).toBe(true)
  })

  it('does not merge following block into <thinking> (playground regression)', () => {
    const markdown = `<thinking>
- markstream-vue playground
- A Vue 3 component that renders Markdown string content as HTML, supporting custom components and advanced markdown features.
</thinking>

>>>I'll create a simple Electron + Vue chat application demo. Here's the structure:`

    const toks = mdCustom.parse(markdown, {}) as any[]
    expect(toks.map(t => t.type)).toContain('blockquote_open')

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes[0]?.type).toBe('thinking')
    expect(textIncludes(nodes[0] as any, '>>>')).toBe(false)
    expect(nodes.length).toBe(2)
  })

  it('handles multiple <thinking> blocks separated by other blocks', () => {
    const markdown = `<thinking>
first
</thinking>

>>> a blockquote line

<thinking>
second
</thinking>`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'blockquote', 'thinking'])
    const thinkingNodes = collect(nodes, 'thinking') as any[]
    expect(thinkingNodes.length).toBe(2)
    expect(thinkingNodes[0].loading).toBe(false)
    expect(thinkingNodes[1].loading).toBe(false)
    expect(thinkingNodes[0].content).toContain('first')
    expect(thinkingNodes[1].content).toContain('second')
  })

  it('handles <thinking> blocks separated by a list block', () => {
    const markdown = `<thinking>
first
</thinking>

- item 1
- item 2

<thinking>
second
</thinking>`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'list', 'thinking'])

    const thinkingNodes = collect(nodes, 'thinking') as any[]
    expect(thinkingNodes.length).toBe(2)
    expect(thinkingNodes[0].loading).toBe(false)
    expect(thinkingNodes[1].loading).toBe(false)
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('item 1')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('item 1')

    expect(nodes[1]?.type).toBe('list')
    expect(textIncludes(nodes[1] as any, 'item 1')).toBe(true)
    expect(textIncludes(nodes[1] as any, 'item 2')).toBe(true)
  })

  it('handles <thinking> blocks separated by a table block', () => {
    const markdown = `<thinking>
first
</thinking>

| a | b |
| - | - |
| 1 | 2 |

<thinking>
second
</thinking>`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'table', 'thinking'])

    const thinkingNodes = collect(nodes, 'thinking') as any[]
    expect(thinkingNodes.length).toBe(2)
    expect(thinkingNodes[0].loading).toBe(false)
    expect(thinkingNodes[1].loading).toBe(false)
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('| a |')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('| a |')

    expect(nodes[1]?.type).toBe('table')
    expect(textIncludes(nodes[1] as any, 'a')).toBe(true)
    expect(textIncludes(nodes[1] as any, '2')).toBe(true)
  })

  it('handles <thinking> blocks separated by mixed blocks (blockquote + list + table)', () => {
    const markdown = `<thinking>
first
</thinking>

>>> quoted line

- item 1

| a | b |
| - | - |
| 1 | 2 |

<thinking>
second
</thinking>`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'blockquote', 'list', 'table', 'thinking'])

    const thinkingNodes = collect(nodes, 'thinking') as any[]
    expect(thinkingNodes.length).toBe(2)
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('quoted line')
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('item 1')
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('| a |')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('quoted line')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('item 1')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('| a |')
  })

  it('handles multiple <thinking> blocks with extra text around them', () => {
    const markdown = `prefix text

<thinking>
first
</thinking>

middle text

<thinking>
second
</thinking>

suffix text`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })

    // text, thinking, text, thinking, text
    expect(nodes.map(n => n.type)).toEqual(['paragraph', 'thinking', 'paragraph', 'thinking', 'paragraph'])

    const thinkingNodes = collect(nodes, 'thinking') as any[]
    expect(thinkingNodes.length).toBe(2)
    expect(thinkingNodes[0].loading).toBe(false)
    expect(thinkingNodes[1].loading).toBe(false)
    expect(thinkingNodes[0].content).toContain('first')
    expect(thinkingNodes[1].content).toContain('second')

    // Ensure outside text is not swallowed into either thinking node.
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('prefix text')
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('middle text')
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('suffix text')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('prefix text')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('middle text')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('suffix text')
  })

  it('does not swallow trailing paragraph after multiple <thinking> blocks', () => {
    const markdown = `<thinking>
one
</thinking>

<thinking>
two
</thinking>

outside paragraph line`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'thinking', 'paragraph'])

    const thinkingNodes = collect(nodes, 'thinking') as any[]
    expect(thinkingNodes.length).toBe(2)
    expect(String(thinkingNodes[0].content ?? '')).not.toContain('outside paragraph line')
    expect(String(thinkingNodes[1].content ?? '')).not.toContain('outside paragraph line')
    expect(textIncludes(nodes[nodes.length - 1] as any, 'outside paragraph line')).toBe(true)
  })

  it('supports nested <thinking> tags inline (depth matching)', () => {
    const markdown = 'x <thinking>outer <thinking>inner</thinking> outer end</thinking> y'

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes[0]?.type).toBe('paragraph')

    const thinkingNodes = collect(nodes, 'thinking') as any[]
    // outer thinking + nested thinking
    expect(thinkingNodes.length).toBe(2)
    const [outer, inner] = thinkingNodes
    expect(outer.loading).toBe(false)
    expect(outer.autoClosed).toBeFalsy()
    expect(inner.loading).toBe(false)
    expect(inner.autoClosed).toBeFalsy()
    expect(outer.content).toContain('outer')
    expect(outer.content).toContain('outer end')
    expect(inner.content).toContain('inner')
  })

  it('supports multiple custom tags without swallowing following blocks', () => {
    const markdown = `<thinking>
alpha
</thinking>

<hint>
beta
</hint>

>>> gamma`

    const nodes = parseMarkdownToStructure(markdown, mdCustomMulti, { customHtmlTags: ['thinking', 'hint'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'hint', 'blockquote'])
    const thinkingNodes = collect(nodes, 'thinking') as any[]
    const hintNodes = collect(nodes, 'hint') as any[]
    expect(thinkingNodes.length).toBe(1)
    expect(hintNodes.length).toBe(1)
    expect(thinkingNodes[0].loading).toBe(false)
    expect(hintNodes[0].loading).toBe(false)
    expect(thinkingNodes[0].content).toContain('alpha')
    expect(hintNodes[0].content).toContain('beta')
  })

  it('streaming: unclosed <thinking> swallows inner <hint> until </thinking> arrives', () => {
    const part1 = `<thinking>
alpha

<hint>
beta
</hint>
`
    const n1 = parseMarkdownToStructure(part1, mdCustomMulti, { customHtmlTags: ['thinking', 'hint'] })
    const thinkingNodes1 = collect(n1 as any, 'thinking') as any[]
    expect(thinkingNodes1.length).toBe(1)
    expect(thinkingNodes1[0].loading).toBe(true)
    expect(textIncludes(n1 as any, 'beta')).toBe(true)

    const full = `${part1}</thinking>

<hint>
outside
</hint>`
    const n2 = parseMarkdownToStructure(full, mdCustomMulti, { customHtmlTags: ['thinking', 'hint'] })
    expect(n2[0]?.type).toBe('thinking')
    expect((n2[0] as any).loading).toBe(false)
    expect((n2[0] as any).content).toContain('alpha')
    expect((n2[0] as any).content).toContain('beta')
    // The "outside" hint must NOT be swallowed into the thinking node.
    const thinkingContent = String((n2[0] as any).content ?? '')
    const thinkingRaw = String((n2[0] as any).raw ?? '')
    expect(thinkingContent.includes('outside') || thinkingRaw.includes('outside')).toBe(false)
    expect(
      n2.slice(1).some((n: any) => n?.type === 'hint' && String(n.content ?? '').includes('outside')),
    ).toBe(true)
  })

  it('streaming: delayed </thinking> does not swallow following blockquote', () => {
    const part1 = `<thinking>
alpha
`
    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)

    const full = `${part1}</thinking>

>>> after`
    const n2 = parseMarkdownToStructure(full, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n2.map(n => n.type)).toEqual(['thinking', 'blockquote'])
    expect(textIncludes(n2[0] as any, '>>>')).toBe(false)
    expect(textIncludes(n2 as any, 'after')).toBe(true)
  })

  it('streaming: unclosed <thinking> can contain list content and finalizes on close', () => {
    const part1 = `<thinking>
- item 1
- item 2
`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)
    expect(textIncludes(n1 as any, 'item 1')).toBe(true)
    // list should not escape as a separate top-level node in this mid-state
    expect(hasNode(n1 as any, 'list')).toBe(false)

    const full = `${part1}</thinking>`
    const n2 = parseMarkdownToStructure(full, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n2.length).toBe(1)
    expect(n2[0]?.type).toBe('thinking')
    expect((n2[0] as any).loading).toBe(false)
    expect(String((n2[0] as any).content ?? '')).toContain('item 1')
    expect(String((n2[0] as any).content ?? '')).toContain('item 2')
    expect(hasNode(n2 as any, 'list')).toBe(false)
  })

  it('streaming: unclosed <thinking> preserves thematic break (hr) before close', () => {
    const part1 = `<thinking>
alpha

---

beta
`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)
    expect(String((n1[0] as any).content ?? '')).toContain('---')

    const innerNodes = parseMarkdownToStructure(String((n1[0] as any).content ?? ''), md)
    expect(hasNode(innerNodes as any, 'thematic_break')).toBe(true)
  })

  it('streaming: unclosed <thinking> does not leak partial closing tag into content', () => {
    const part1 = `<thinking>
alpha

      **<font color="red"` + `
</thinking`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)
    expect(String((n1[0] as any).content ?? '')).not.toContain('</thinking')
  })

  it('streaming: unclosed <thinking> can contain table content and finalizes on close', () => {
    const part1 = `<thinking>
| a | b |
| - | - |
| 1 | 2 |
`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)
    expect(textIncludes(n1 as any, '| a | b |')).toBe(true)
    // table should not escape as a separate top-level node in this mid-state
    expect(hasNode(n1 as any, 'table')).toBe(false)

    const full = `${part1}</thinking>

after`
    const n2 = parseMarkdownToStructure(full, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n2.map(n => n.type)).toEqual(['thinking', 'paragraph'])
    expect((n2[0] as any).loading).toBe(false)
    expect(String((n2[0] as any).content ?? '')).toContain('| a | b |')
    expect(String((n2[0] as any).content ?? '')).toContain('| 1 | 2 |')
    expect(String((n2[0] as any).content ?? '')).not.toContain('after')
    expect(textIncludes(n2.slice(1) as any, 'after')).toBe(true)
    expect(hasNode(n2 as any, 'table')).toBe(false)
  })

  it('streaming: unclosed <thinking> can contain a fenced code block and finalizes on close', () => {
    const part1 = `<thinking>
\`\`\`js
console.log(1)
\`\`\`
`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)
    expect(textIncludes(n1 as any, 'console.log(1)')).toBe(true)
    // fenced code block should not escape as a separate top-level node in this mid-state
    expect((n1 as any).some((n: any) => n?.type === 'code_block' || n?.type === 'fence')).toBe(false)

    const full = `${part1}</thinking>

after`
    const n2 = parseMarkdownToStructure(full, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n2.map(n => n.type)).toEqual(['thinking', 'paragraph'])
    expect((n2[0] as any).loading).toBe(false)
    expect(String((n2[0] as any).content ?? '')).toContain('```js')
    expect(String((n2[0] as any).content ?? '')).toContain('console.log(1)')
    expect(String((n2[0] as any).content ?? '')).not.toContain('after')
    expect(textIncludes(n2.slice(1) as any, 'after')).toBe(true)
    expect((n2 as any).some((n: any) => n?.type === 'code_block' || n?.type === 'fence')).toBe(false)
  })

  it('streaming: unclosed fence inside unclosed <thinking> finalizes when fence and tag close arrive', () => {
    const part1 = `<thinking>
\`\`\`js
console.log(1)
`

    const n1 = parseMarkdownToStructure(part1, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n1.length).toBe(1)
    expect(n1[0]?.type).toBe('thinking')
    expect((n1[0] as any).loading).toBe(true)
    expect(textIncludes(n1 as any, '```js')).toBe(true)
    expect(textIncludes(n1 as any, 'console.log(1)')).toBe(true)
    // fence should not escape as a separate top-level node during this mid-state
    expect((n1 as any).some((n: any) => n?.type === 'code_block' || n?.type === 'fence')).toBe(false)

    const full = `${part1}\`\`\`
</thinking>

after`
    const n2 = parseMarkdownToStructure(full, mdCustom, { customHtmlTags: ['thinking'] })
    expect(n2.map(n => n.type)).toEqual(['thinking', 'paragraph'])
    expect((n2[0] as any).loading).toBe(false)
    expect(String((n2[0] as any).content ?? '')).toContain('```js')
    expect(String((n2[0] as any).content ?? '')).toContain('console.log(1)')
    expect(String((n2[0] as any).content ?? '')).not.toContain('after')
    expect(textIncludes(n2.slice(1) as any, 'after')).toBe(true)
    expect((n2 as any).some((n: any) => n?.type === 'code_block' || n?.type === 'fence')).toBe(false)
  })

  it('streaming: closing </thinking> then list starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
- item 1
- item 2`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'list'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('item 1')
    expect(textIncludes(nodes[1] as any, 'item 1')).toBe(true)
    expect(textIncludes(nodes[1] as any, 'item 2')).toBe(true)
  })

  it('streaming: closing </thinking> then table starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
| a | b |
| - | - |
| 1 | 2 |`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'table'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('| a | b |')
    expect(textIncludes(nodes[1] as any, 'a')).toBe(true)
    expect(textIncludes(nodes[1] as any, '2')).toBe(true)
  })

  it('streaming: closing </thinking> then blockquote starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
>>> after`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'blockquote'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(textIncludes(nodes[1] as any, 'after')).toBe(true)
  })

  it('streaming: closing </thinking> then thematic break starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
---

after`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'thematic_break', 'paragraph'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(textIncludes(nodes[2] as any, 'after')).toBe(true)
  })

  it('streaming: closing </thinking> then fenced code (``` ) starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
\`\`\`js
console.log(1)
\`\`\``

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'code_block'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('console.log(1)')
    expect(String((nodes[1] as any).raw ?? '')).toContain('console.log(1)')
  })

  it('streaming: closing </thinking> then fenced code (~~~) starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
~~~js
console.log(1)
~~~`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'code_block'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('console.log(1)')
    expect(String((nodes[1] as any).raw ?? '')).toContain('console.log(1)')
  })

  it('streaming: closing </thinking> then task list starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
- [ ] todo 1
- [x] todo 2`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'list'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('todo 1')
    expect(textIncludes(nodes[1] as any, 'todo 1')).toBe(true)
    expect(textIncludes(nodes[1] as any, 'todo 2')).toBe(true)
  })

  it('streaming: closing </thinking> then indented blockquote starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
  >>> after`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'blockquote'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(textIncludes(nodes[1] as any, 'after')).toBe(true)
  })

  it('streaming: closing </thinking> then indented fenced code starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
  \`\`\`js
  console.log(1)
  \`\`\``

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'code_block'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('console.log(1)')
    expect(String((nodes[1] as any).raw ?? '')).toContain('console.log(1)')
  })

  it('streaming: closing </thinking> then indented table starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
  | a | b |
  | - | - |
  | 1 | 2 |`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'table'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('| a | b |')
    expect(textIncludes(nodes[1] as any, 'a')).toBe(true)
    expect(textIncludes(nodes[1] as any, '2')).toBe(true)
  })

  it('streaming: closing </thinking> then ordered list (1.) starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
1. first
2. second`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'list'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('first')
    expect(textIncludes(nodes[1] as any, 'first')).toBe(true)
    expect(textIncludes(nodes[1] as any, 'second')).toBe(true)
  })

  it('streaming: closing </thinking> then ordered list (1)) starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
1) first
2) second`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'list'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('first')
    expect(textIncludes(nodes[1] as any, 'first')).toBe(true)
    expect(textIncludes(nodes[1] as any, 'second')).toBe(true)
  })

  it('streaming: closing </thinking> then heading starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
## Title`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'heading'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('Title')
    expect(textIncludes(nodes[1] as any, 'Title')).toBe(true)
  })

  it('streaming: closing </thinking> then indented heading starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
  ## Title`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'heading'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('Title')
    expect(textIncludes(nodes[1] as any, 'Title')).toBe(true)
  })

  it('streaming: closing </thinking> then admonition container starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
::: tip
content
:::`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes[0]?.type).toBe('thinking')
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('content')

    const container = nodes[1] as any
    // Container tokenization can vary by plugin; accept either node type.
    expect(container?.type === 'admonition' || container?.type === 'container').toBe(true)
    expect(textIncludes(container, 'content')).toBe(true)
  })

  it('streaming: closing </thinking> then admonition warning starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
::: warning
warn content
:::`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes[0]?.type).toBe('thinking')
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('warn content')

    const container = nodes[1] as any
    expect(container?.type === 'admonition' || container?.type === 'container').toBe(true)
    expect(textIncludes(container, 'warn content')).toBe(true)
  })

  it('streaming: closing </thinking> then unclosed admonition mid-state does not get swallowed', () => {
    const markdown = `<thinking>
alpha
</thinking>
::: tip
partial content`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    const thinking = nodes.find((n: any) => n?.type === 'thinking') as any
    expect(thinking).toBeTruthy()
    expect(String(thinking.content ?? '')).toContain('alpha')
    expect(String(thinking.content ?? '')).not.toContain('partial content')

    // Mid-state tolerance: may produce container/admonition or fallback to paragraph.
    const rest = nodes.filter((n: any) => n?.type !== 'thinking')
    expect(rest.length).toBeGreaterThanOrEqual(1)
    expect(textIncludes(rest as any, 'partial content') || textIncludes(rest as any, ':::')).toBe(true)
  })

  it('streaming: CRLF after </thinking> then list starts immediately (boundary)', () => {
    const markdown = '<thinking>\nalpha\n</thinking>\r\n- item 1\r\n- item 2'

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'list'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('item 1')
    expect(textIncludes(nodes[1] as any, 'item 1')).toBe(true)
    expect(textIncludes(nodes[1] as any, 'item 2')).toBe(true)
  })

  it('streaming: CRLF after </thinking> then fenced code starts immediately (boundary)', () => {
    const markdown = '<thinking>\nalpha\n</thinking>\r\n```js\r\nconsole.log(1)\r\n```'

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'code_block'])
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('console.log(1)')
    expect(String((nodes[1] as any).raw ?? '')).toContain('console.log(1)')
  })

  it('streaming: CRLF after </thinking> then admonition starts immediately (boundary)', () => {
    const markdown = '<thinking>\nalpha\n</thinking>\r\n::: tip\r\ncontent\r\n:::'

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    const thinking = nodes.find((n: any) => n?.type === 'thinking') as any
    expect(thinking).toBeTruthy()
    expect(String(thinking.content ?? '')).toContain('alpha')
    expect(String(thinking.content ?? '')).not.toContain('content')

    const rest = nodes.filter((n: any) => n?.type !== 'thinking')
    const first = rest[0] as any
    // Container tokenization can vary by plugin; accept either node type.
    expect(first?.type === 'admonition' || first?.type === 'container' || first?.type === 'paragraph').toBe(true)
    expect(textIncludes(rest as any, 'content') || textIncludes(rest as any, ':::')).toBe(true)
  })

  it('streaming: closing </thinking> then footnote definition starts immediately (boundary)', () => {
    const markdown = `ref[^1]

<thinking>
alpha
</thinking>
[^1]: Footnote explanation`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    const thinking = nodes.find((n: any) => n?.type === 'thinking') as any
    expect(thinking).toBeTruthy()
    expect(String(thinking.content ?? '')).toContain('alpha')
    expect(String(thinking.content ?? '')).not.toContain('Footnote explanation')
    // Depending on enabled markdown-it plugins, this may become a footnote node or a paragraph.
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    expect(textIncludes(nodes.slice(1) as any, 'Footnote explanation') || textIncludes(nodes.slice(1) as any, '^1')).toBe(true)
  })

  it('streaming: closing </thinking> then definition list starts immediately (boundary)', () => {
    const markdown = `<thinking>
alpha
</thinking>
Term
: def`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes[0]?.type).toBe('thinking')
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
    expect(String((nodes[0] as any).content ?? '')).not.toContain('def')
    // Depending on enabled markdown-it plugins, this may become a definition_list node or a paragraph.
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    expect(textIncludes(nodes.slice(1) as any, 'def')).toBe(true)
  })

  it('streaming: </thinking> followed immediately by text is not swallowed', () => {
    const markdown = `<thinking>
alpha
</thinking>after`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes[0]?.type).toBe('thinking')
    expect((nodes[0] as any).loading).toBe(false)
    expect(String((nodes[0] as any).content ?? '')).not.toContain('after')
    expect(nodes.map(n => n.type)).toEqual(['thinking', 'paragraph'])
    expect(textIncludes(nodes.slice(1) as any, 'after')).toBe(true)
  })

  it('streaming: </thinking> followed immediately by another custom tag is not swallowed', () => {
    const markdown = `<thinking>
alpha
</thinking><hint>
outside
</hint>`

    const nodes = parseMarkdownToStructure(markdown, mdCustomMulti, { customHtmlTags: ['thinking', 'hint'] })
    expect(nodes[0]?.type).toBe('thinking')
    expect((nodes[0] as any).loading).toBe(false)
    expect(String((nodes[0] as any).content ?? '')).not.toContain('outside')
    const hintNodes = collect(nodes as any, 'hint') as any[]
    expect(hintNodes.some(n => String(n?.content ?? '').includes('outside'))).toBe(true)
  })

  it('streaming: closes custom tag with whitespace/case variants', () => {
    const markdown = `<thinking>
alpha
</ THINKING   >`

    const nodes = parseMarkdownToStructure(markdown, mdCustom, { customHtmlTags: ['thinking'] })
    expect(nodes.length).toBe(1)
    expect(nodes[0]?.type).toBe('thinking')
    expect((nodes[0] as any).loading).toBe(false)
    expect(String((nodes[0] as any).content ?? '')).toContain('alpha')
  })
})
