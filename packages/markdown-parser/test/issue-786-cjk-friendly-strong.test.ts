import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

// Issue #786: Chinese/Japanese/Korean text has no space between words and
// punctuation, so `**`/`*` markers sit directly next to CJK punctuation
// (`「」《》。，`). CommonMark counts that punctuation as Unicode punctuation and
// refuses the run, which either pairs the wrong markers with each other or
// leaves the markers visible. The parser now applies the `markdown-cjk-friendly`
// flanking rules, so every expected span below matches
// `markdown-it` + `markdown-it-cjk-friendly` output for the same input.

function collectText(value: any): string {
  if (!value || typeof value !== 'object')
    return ''
  if (value.type === 'text')
    return String(value.content ?? '')
  if (Array.isArray(value))
    return value.map(collectText).join('')
  return collectText(value.children)
}

function inlineChildren(nodes: any[]): any[] {
  return nodes[0]?.children ?? []
}

function strongTexts(nodes: any[]): string[] {
  return inlineChildren(nodes)
    .filter((child: any) => child.type === 'strong')
    .map((child: any) => collectText(child))
}

// [markdown, expected strong spans, expected rendered html]
const REPORTED_CASES: Array<[string, string[], string]> = [
  ['说明**「A」**。和**「B」**。', ['「A」', '「B」'], '说明<strong>「A」</strong>。和<strong>「B」</strong>。'],
  ['依据**《民法典》**第五条和**《合同法》**第六条', ['《民法典》', '《合同法》'], '依据<strong>《民法典》</strong>第五条和<strong>《合同法》</strong>第六条'],
  ['**快。**Pi 的底层', ['快。'], '<strong>快。</strong>Pi 的底层'],
]

describe('issue 786: CJK punctuation directly next to emphasis markers', () => {
  it.each(REPORTED_CASES)('pairs every marker on the line for %s', (markdown, expectedStrong, expectedHtml) => {
    for (const final of [true, false]) {
      const md = getMarkdown(`issue-786-${final}-${markdown}`)
      const nodes = parseMarkdownToStructure(markdown, md, { final }) as any[]

      expect(md.render(markdown).trim()).toBe(`<p>${expectedHtml}</p>`)
      expect(collectText(nodes)).toBe(expectedHtml.replace(/<\/?strong>/g, ''))
      expect(strongTexts(nodes)).toEqual(expectedStrong)
      // No marker survives as literal text anywhere in the paragraph.
      expect(collectText(nodes)).not.toContain('*')
    }
  })

  it.each([
    ['了**「法」**：', '了<strong>「法」</strong>：'],
    ['了**《法》**后', '了<strong>《法》</strong>后'],
    ['见**《法》**第3条', '见<strong>《法》</strong>第3条'],
    ['说明**“A”**。', '说明<strong>“A”</strong>。'],
    ['了*《法》*：', '了<em>《法》</em>：'],
    ['日本語**「テスト」**です。', '日本語<strong>「テスト」</strong>です。'],
    ['한국어**「테스트」**입니다.', '한국어<strong>「테스트」</strong>입니다.'],
    ['**かな。**かな', '<strong>かな。</strong>かな'],
    ['**「A」**和*「B」*', '<strong>「A」</strong>和<em>「B」</em>'],
    ['**粗**、**体**', '<strong>粗</strong>、<strong>体</strong>'],
  ])('closes the span on CJK punctuation for %s', (markdown, expectedHtml) => {
    const md = getMarkdown(`issue-786-close-${markdown}`)

    expect(md.render(markdown).trim()).toBe(`<p>${expectedHtml}</p>`)
    const nodes = parseMarkdownToStructure(markdown, md, { final: true }) as any[]
    expect(collectText(nodes)).toBe(expectedHtml.replace(/<\/?(strong|em)>/g, ''))
  })

  // The amended flanking rules differ from CommonMark only for runs next to a CJK
  // character, so non-CJK documents must parse byte-for-byte as before.
  it.each([
    ['**foo**', '<p><strong>foo</strong></p>'],
    ['*foo bar*', '<p><em>foo bar</em></p>'],
    ['snake_case_name', '<p>snake_case_name</p>'],
    ['foo_bar_baz', '<p>foo_bar_baz</p>'],
    ['2 * 3 * 4', '<p>2 * 3 * 4</p>'],
    ['a*b*c', '<p>a<em>b</em>c</p>'],
    ['5*6*78', '<p>5<em>6</em>78</p>'],
    ['*a*_b_*c*', '<p><em>a</em><em>b</em><em>c</em></p>'],
    ['_a_', '<p><em>a</em></p>'],
    ['__a__', '<p><strong>a</strong></p>'],
    ['**a**,**b**', '<p><strong>a</strong>,<strong>b</strong></p>'],
    ['`code**not**bold`', '<p><code>code**not**bold</code></p>'],
  ])('keeps the CommonMark result for %s', (markdown, expectedHtml) => {
    const md = getMarkdown(`issue-786-ascii-${markdown}`)

    expect(md.render(markdown).trim()).toBe(expectedHtml)
  })

  it('keeps spans that already paired around CJK punctuation', () => {
    const md = getMarkdown('issue-786-already-paired')

    expect(md.render('中文**加粗**和*斜体*').trim()).toBe('<p>中文<strong>加粗</strong>和<em>斜体</em></p>')
    expect(md.render('这是**重点**，那是**次点**。').trim()).toBe('<p>这是<strong>重点</strong>，那是<strong>次点</strong>。</p>')
    expect(md.render('（**字**）').trim()).toBe('<p>（<strong>字</strong>）</p>')
  })
})
