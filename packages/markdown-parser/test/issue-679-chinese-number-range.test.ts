import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const ISSUE_SAMPLE = '**农村家庭**为儿子娶媳妇：普遍 **60万~100万元**，按2024年收入算，**要不吃不喝工作26~43年**'

function parse(src: string, final = true) {
  return parseMarkdownToStructure(src, getMarkdown(`issue-679-${Math.random()}`), { final })
}

function childrenOf(src: string, final = true) {
  return parse(src, final)[0].children as any[]
}

function rawText(src: string, final = true): string {
  return childrenOf(src, final).map((c: any) => c.raw ?? c.content ?? '').join('')
}

describe('issue 679: tilde in Chinese number ranges', () => {
  it.each([true, false])('keeps range tildes as text when final=%s', (final) => {
    const nodes = parseMarkdownToStructure(ISSUE_SAMPLE, getMarkdown(`issue-679-${final}`), { final })
    const children = nodes[0].children as any[]

    expect(JSON.stringify(nodes)).not.toContain('"type":"subscript"')
    expect(children.filter(child => child.type === 'strong')).toMatchObject([
      { raw: '**农村家庭**' },
      { raw: '**60万~100万元**' },
      { raw: '**要不吃不喝工作26~43年**' },
    ])
  })

  it.each([true, false])('still parses explicit subscript markup when final=%s', (final) => {
    const nodes = parseMarkdownToStructure('Chemical formula H~2~O', getMarkdown('issue-679-subscript'), { final })

    expect(nodes[0].children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'subscript', raw: '~2~' }),
    ]))
  })

  it.each([true, false])('keeps Chinese digits+ranges intact when final=%s', (final) => {
    expect(rawText('规模在1.5亿~2亿之间', final)).toBe('规模在1.5亿~2亿之间')
    expect(rawText('运营26~43年', final)).toBe('运营26~43年')
  })

  // Regression guard for the "next ~ pairs with a far-away ~" family of bugs:
  // the first marker must not swallow text just because another marker exists
  // later in the same paragraph.
  it.each([
    '价格~5元，其他~6元',
    '电话~123456，分机~654321',
    '第~1章讲原理，第~2章讲实现',
    '价格~5元，其他~6元，还有~7元',
  ])('keeps %s as plain text', (src) => {
    expect(JSON.stringify(parse(src))).not.toContain('"type":"subscript"')
    expect(rawText(src)).toBe(src)
  })

  it('parses ASCII subscripts after Han chars (值~max~, 空格~x~)', () => {
    const src = '速度~max~值，空格~x~ 测试~y~'
    const raws = childrenOf(src)
      .filter((c: any) => c.type === 'subscript')
      .map((c: any) => c.raw)
    expect(raws).toEqual(['~max~', '~x~', '~y~'])
  })

  it('parses plain ASCII subscripts (H~2~O, P~1~, x~n~)', () => {
    const nodes = parse('H~2~O, P~1~, x~n~+y~n~')
    const types = JSON.stringify(nodes)
    expect(types).toContain('"type":"subscript"')
    const raws = childrenOf('H~2~O, P~1~, x~n~+y~n~')
      .filter((c: any) => c.type === 'subscript')
      .map((c: any) => c.raw)
    expect(raws).toEqual(['~2~', '~1~', '~n~', '~n~'])
  })

  it('does not break explicit ASCII subscript after letters (C~2~H~5~OH)', () => {
    // ASCII subscripts directly after a letter keep working; digits before
    // `~` read as number ranges and stay plain text (see 1~2~3 case).
    const raws = childrenOf('C~2~H~5~OH')
      .filter((c: any) => c.type === 'subscript')
      .map((c: any) => c.raw)
    expect(raws).toEqual(['~2~', '~5~'])
  })

  it('keeps digit-led ~ pairs plain (10~23~)', () => {
    // `10~23~` reads like a numeric range chain, not a subscript.
    const nodes = parse('10~23~')
    expect(JSON.stringify(nodes)).not.toContain('"type":"subscript"')
  })

  it('does not parse ~ pairs spanning ASCII digits as subscript (1~2~3)', () => {
    // `1~2~3` reads like a numeric range chain, not a subscript.
    const nodes = parse('1~2~3')
    expect(JSON.stringify(nodes)).not.toContain('"type":"subscript"')
  })

  it('keeps sup caret ranges plain in Chinese text', () => {
    const src = '型号A^2，型号B^3'
    expect(JSON.stringify(parse(src))).not.toContain('"type":"superscript"')
    expect(rawText(src)).toBe(src)
  })

  it('still parses ASCII superscripts (x^2^, 10^23^)', () => {
    const raws = childrenOf('x^2^+10^23^')
      .filter((c: any) => c.type === 'superscript')
      .map((c: any) => c.raw)
    expect(raws).toEqual(['^2^', '^23^'])
  })

  it('keeps mark== pairs with Chinese ranges plain (==5元，其他==)', () => {
    const src = '价格==5元，其他==6元'
    expect(JSON.stringify(parse(src))).not.toContain('"type":"highlight"')
    expect(rawText(src)).toBe(src)
  })

  it('still parses short explicit ==mark== highlight', () => {
    const raws = childrenOf('价格==5元==，其他==6元==')
      .filter((c: any) => c.type === 'highlight')
      .map((c: any) => c.raw)
    expect(raws).toEqual(['==5元==', '==6元=='])
  })

  it('still parses Chinese ==高亮== highlight', () => {
    const nodes = parse('这是==重要==内容')
    expect(JSON.stringify(nodes)).toContain('"type":"highlight"')
  })

  it('keeps ins++ with Chinese range plain (++5元，其他++)', () => {
    const src = '价格++5元，其他++6元'
    expect(JSON.stringify(parse(src))).not.toContain('"type":"insert"')
    expect(rawText(src)).toBe(src)
  })

  it('still parses short explicit ++ins++ insert', () => {
    const raws = childrenOf('价格++5元++，其他++6元++')
      .filter((c: any) => c.type === 'insert')
      .map((c: any) => c.raw)
    expect(raws).toEqual(['++5元++', '++6元++'])
  })

  it('keeps inline hash tags plain (#1方案和#2方案)', () => {
    const src = '我们支持#1方案和#2方案'
    expect(JSON.stringify(parse(src))).not.toContain('"type":"heading"')
    expect(rawText(src)).toBe(src)
  })
})
