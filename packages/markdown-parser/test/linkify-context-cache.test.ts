import { describe, expect, it } from 'vitest'
import { inferLinkifyDemotionContext } from '../src/parser/linkifyHeuristics'

describe('linkify context cache', () => {
  it('keeps filename and ticker matching consistent across ASCII and Unicode text', () => {
    const text = 'DOCUMENT LIST and exchanges: assets.dev'
    const expected = { explicitFilename: true, filename: true, marketTicker: true }
    expect(inferLinkifyDemotionContext(text)).toEqual(expected)
    expect(inferLinkifyDemotionContext(`${text} 中文`)).toEqual(expected)
    expect(inferLinkifyDemotionContext('FILE\u00A0names: assets.dev')).toMatchObject({ explicitFilename: true, filename: true })
    expect(inferLinkifyDemotionContext('Files: notes.md and symbolſ: 600000.SH')).toMatchObject({ marketTicker: true })
    expect(inferLinkifyDemotionContext('profile names for docsify and pathfinder')).toEqual({
      explicitFilename: false,
      filename: false,
      marketTicker: false,
    })
  })

  it('preserves context inference across repeated hits and eviction', () => {
    const texts = [
      'Ordinary text',
      '文件名：README.md',
      '附件：report.pdf',
      '路径：src/index.ts',
      '股票代码：600000.SH',
      'Files: notes.md',
      'Exchange: NYSE',
      '文件名：'.repeat(5000),
    ]
    const expected = texts.map(text => ({ ...inferLinkifyDemotionContext(text) }))
    for (let i = 0; i < 2100; i++) {
      inferLinkifyDemotionContext(`unique context ${i}`)
      expect(inferLinkifyDemotionContext(texts[0])).toEqual(expected[0])
    }
    expect(texts.map(text => inferLinkifyDemotionContext(text))).toEqual(expected)
  })
})
