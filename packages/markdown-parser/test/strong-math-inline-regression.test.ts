import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('parseMarkdownToStructure - strong around multiple inline math spans', () => {
  it('keeps a long strong span intact when it contains adjacent escaped-paren math', () => {
    const md = getMarkdown('strong-multiple-inline-math')
    const input = '**图 1: (a) 在模型 \\(y=\\)\\(\\langle z,\\theta^{\\star}\\rangle^{2}\\exp(-\\langle z,\\theta^{\\star}\\rangle^{2})\\) 下，算法 1 的 \\((\\log d,\\log n,\\tt a c c(}d,n))\\) 等高线图，该模型的生成指数为 \\(s^{\\star}\\,=\\,4\\)（示例 2.2）。这里 \\(\\mathsf{a c c}(d,n)\\) 是神经元权重与未知信号 \\(\\theta^{\\star}\\) 之间对齐的最大 8 个值的平均值。这些等高线的斜率都接近 2，表明对于 \\(s^{\\star}=4\\)，样本复杂度为 \\(n\\approx d^{2}\\)。 (b) 我们的算法在不同生成指数 \\(s^{\\star}\\) 和稀疏水平 \\(k\\) 下实现的样本复杂度范式，说明了实现计算-统计权衡的成功。**'

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    const paragraph = nodes[0] as any
    expect(paragraph.type).toBe('paragraph')
    expect(paragraph.children).toHaveLength(1)

    const strong = paragraph.children[0]
    expect(strong.type).toBe('strong')
    expect(strong.children[0]).toMatchObject({
      type: 'text',
      content: '图 1: (a) 在模型 ',
    })

    const mathContents = strong.children
      .filter((child: any) => child.type === 'math_inline')
      .map((child: any) => child.content)

    expect(mathContents).toEqual([
      'y=',
      '\\langle z,\\theta^{\\star}\\rangle^{2}\\exp(-\\langle z,\\theta^{\\star}\\rangle^{2})',
      '(\\log d,\\log n,\\tt a c c(}d,n))',
      's^{\\star}\\,=\\,4',
      '\\mathsf{a c c}(d,n)',
      '\\theta^{\\star}',
      's^{\\star}=4',
      'n\\approx d^{2}',
      's^{\\star}',
      'k',
    ])

    const textContent = strong.children
      .filter((child: any) => child.type === 'text')
      .map((child: any) => child.content)
      .join('')

    expect(textContent).toBe('图 1: (a) 在模型  下，算法 1 的  等高线图，该模型的生成指数为 （示例 2.2）。这里  是神经元权重与未知信号  之间对齐的最大 8 个值的平均值。这些等高线的斜率都接近 2，表明对于 ，样本复杂度为 。 (b) 我们的算法在不同生成指数  和稀疏水平  下实现的样本复杂度范式，说明了实现计算-统计权衡的成功。')
    expect(textContent).not.toContain('**')
  })

  it('keeps a caption strong when the first math span is a coordinate tuple', () => {
    const md = getMarkdown('strong-coordinate-tuple-inline-math')
    const input = '**图 2: \\((d,n)\\) 和 \\((\\log d,\\log n)\\) 的散点图。在 (a) 中，我们绘制 \\(n\\) 与 \\(d\\) 的关系，在 (b) 中，我们绘制 \\(\\log n\\) 与 \\(\\log d\\) 的关系。如 (b) 所示，我们选择 \\(n\\) 和 \\(d\\) 使其在对数后形成均匀间隔的网格。**'

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    const paragraph = nodes[0] as any
    expect(paragraph.type).toBe('paragraph')
    expect(paragraph.children).toHaveLength(1)

    const strong = paragraph.children[0]
    expect(strong.type).toBe('strong')

    const mathContents = strong.children
      .filter((child: any) => child.type === 'math_inline')
      .map((child: any) => child.content)

    expect(mathContents).toEqual([
      '(d,n)',
      '(\\log d,\\log n)',
      'n',
      'd',
      '\\log n',
      '\\log d',
      'n',
      'd',
    ])

    const textContent = strong.children
      .filter((child: any) => child.type === 'text')
      .map((child: any) => child.content)
      .join('')

    expect(textContent).toBe('图 2:  和  的散点图。在 (a) 中，我们绘制  与  的关系，在 (b) 中，我们绘制  与  的关系。如 (b) 所示，我们选择  和  使其在对数后形成均匀间隔的网格。')
    expect(textContent).not.toContain('**')
    expect(textContent).not.toContain('((d,n))')
  })

  it('keeps strong intact when the first child is inline math', () => {
    const md = getMarkdown('strong-starts-with-inline-math')
    const nodes = parseMarkdownToStructure('**\\(x\\) 开头 math 后面文字 \\(y\\)**', md, { final: true })
    const paragraph = nodes[0] as any

    expect(paragraph.children).toHaveLength(1)
    expect(paragraph.children[0].type).toBe('strong')
    expect(paragraph.children[0].children.map((child: any) => child.type)).toEqual([
      'math_inline',
      'text',
      'math_inline',
    ])
  })

  it('keeps richer inline content inside strong after inline math', () => {
    const md = getMarkdown('strong-rich-inline-after-math')
    const input = '**前缀 \\(x\\) *斜体* [链接](https://example.com) `code` <span>html</span> \\(y\\) 结束**'
    const nodes = parseMarkdownToStructure(input, md, { final: true })
    const paragraph = nodes[0] as any
    const strong = paragraph.children[0]

    expect(paragraph.children).toHaveLength(1)
    expect(strong.type).toBe('strong')
    expect(strong.children.map((child: any) => child.type)).toEqual([
      'text',
      'math_inline',
      'text',
      'emphasis',
      'text',
      'link',
      'text',
      'inline_code',
      'text',
      'html_inline',
      'text',
      'math_inline',
      'text',
    ])

    const link = strong.children.find((child: any) => child.type === 'link')
    expect(link).toMatchObject({
      href: 'https://example.com',
      text: '链接',
      loading: false,
    })
    expect(strong.children.filter((child: any) => child.type === 'link')).toHaveLength(1)
    expect(strong.children.at(-1).content).toBe(' 结束')
  })
})
