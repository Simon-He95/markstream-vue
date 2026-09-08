import { describe, expect, it } from 'vitest'
import { buildDiffPreviewPanes } from '../src/diff-preview'

describe('source diff line identity', () => {
  it('preserves repeated-line tie breaking and blank-line alignment', () => {
    const options = {
      originalCode: 'old\nrepeat\n\nrepeat\nend-old\n',
      updatedCode: 'new\nrepeat\nrepeat\n\nend-new\n',
    }
    const rows = (inline: boolean) => buildDiffPreviewPanes({ ...options, inline })
      .map(pane => pane.lines.map(line => [line.kind, line.code, line.number]))

    expect(rows(false)).toEqual([
      [['removed', 'old', 1], ['context', 'repeat', 2], ['removed', '', 3], ['context', 'repeat', 4], ['removed', 'end-old', 5], ['spacer', '', '']],
      [['added', 'new', 1], ['context', 'repeat', 2], ['spacer', '', ''], ['context', 'repeat', 3], ['added', '', 4], ['added', 'end-new', 5]],
    ])
    expect(rows(true)).toEqual([
      [['removed', 'old', 1], ['added', 'new', 1], ['context', 'repeat', 2], ['removed', '', 3], ['context', 'repeat', 3], ['removed', 'end-old', 5], ['added', '', 4], ['added', 'end-new', 5]],
    ])
  })

  it.each([false, true])('keeps long common suffixes in source order (inline=%s)', (inline) => {
    const suffix = Array.from({ length: 5000 }, (_, index) => `保留 ${index}`)
    const panes = buildDiffPreviewPanes({
      originalCode: ['before', ...suffix, ''].join('\n'),
      updatedCode: ['after', ...suffix, ''].join('\n'),
      inline,
      hideUnchangedRegions: false,
    })
    for (const pane of panes) {
      const context = pane.lines.filter(line => line.kind === 'context')
      expect(context.map(line => line.code)).toEqual(suffix)
      expect(context.map(line => line.number)).toEqual(suffix.map((_, index) => index + 2))
    }
  })
})
