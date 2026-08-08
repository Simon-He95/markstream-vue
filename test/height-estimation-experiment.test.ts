import { describe, expect, it } from 'vitest'
import {
  clearHeightEstimationExperiment,
  estimateCodeBlockHeight,
  getHeightEstimationExperiment,
  getHeightEstimationRendererController,
  registerHeightEstimationRendererController,
  setHeightEstimationExperiment,
} from '../src/internal/heightEstimationExperiment'

describe('height estimation experiment internals', () => {
  it('stores config per custom id', () => {
    setHeightEstimationExperiment('test-height-exp', {
      enabled: true,
      textEstimation: true,
      codeBlockEstimation: false,
    })

    expect(getHeightEstimationExperiment('test-height-exp')).toEqual({
      enabled: true,
      textEstimation: true,
      codeBlockEstimation: false,
    })

    clearHeightEstimationExperiment('test-height-exp')
    expect(getHeightEstimationExperiment('test-height-exp')).toBeNull()
  })

  it('registers and removes renderer controllers', () => {
    const controller = {
      captureRestoreAnchor: () => ({ nodeIndex: 4, offsetWithinNodePx: 12 }),
      restoreAnchor: () => {},
      getAnchorDrift: () => 0,
      getReport: () => ({
        totalNodes: 1,
        measuredCount: 1,
        estimatedCount: 0,
        averageNodeHeight: 20,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        estimatedTotalHeight: 20,
        width: 320,
        nodes: [],
      }),
    }

    const cleanup = registerHeightEstimationRendererController('test-height-controller', controller)
    expect(getHeightEstimationRendererController('test-height-controller')).toBe(controller)
    cleanup()
    expect(getHeightEstimationRendererController('test-height-controller')).toBeNull()
  })

  it('estimates markdown code block height deterministically', () => {
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\ntwo\nthree',
        raw: '```ts\none\ntwo\nthree\n```',
      } as any,
      {
        rendererKind: 'markdown',
        showHeader: true,
      },
    )

    expect(estimated?.kind).toBe('code-block')
    expect(estimated?.rendererKind).toBe('markdown')
    expect(estimated?.contentHeight).toBeGreaterThan(0)
    expect(estimated?.height).toBeGreaterThan(estimated?.contentHeight ?? 0)
  })

  it('estimates standalone pre code blocks without shell header height', () => {
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\ntwo\nthree',
        raw: '```ts\none\ntwo\nthree\n```',
      } as any,
      {
        rendererKind: 'pre',
        showHeader: true,
      },
    )

    expect(estimated?.rendererKind).toBe('pre')
    expect(estimated?.contentHeight).toBe(84)
    expect(estimated?.height).toBe(84)
  })

  it('does not count a terminal newline as an extra ordinary code line', () => {
    const withoutTerminalNewline = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one',
        raw: '```ts\none\n```',
      } as any,
      {
        rendererKind: 'stream-diffs',
        showHeader: false,
      },
    )
    const withTerminalNewline = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\n',
        raw: '```ts\none\n```',
      } as any,
      {
        rendererKind: 'stream-diffs',
        showHeader: false,
      },
    )
    const withBlankLine = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\n\n',
        raw: '```ts\none\n\n```',
      } as any,
      {
        rendererKind: 'stream-diffs',
        showHeader: false,
      },
    )
    const loadingWithTerminalNewline = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\n',
        raw: '```ts\none\n',
        loading: true,
      } as any,
      {
        rendererKind: 'stream-diffs',
        showHeader: false,
      },
    )

    expect(withTerminalNewline?.contentHeight).toBe(withoutTerminalNewline?.contentHeight)
    expect(withBlankLine?.contentHeight).toBeGreaterThan(withTerminalNewline?.contentHeight ?? 0)
    expect(loadingWithTerminalNewline?.contentHeight).toBe(withBlankLine?.contentHeight)
  })

  it('includes the native surface padding in ordinary stream-diffs code block estimates', () => {
    const code = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`).join('\n')
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'js',
        code,
        raw: `\`\`\`js\n${code}`,
        loading: true,
      } as any,
      {
        rendererKind: 'stream-diffs',
        showHeader: false,
      },
    )

    expect(estimated?.contentHeight).toBe(448)
    expect(estimated?.height).toBe(448)
  })

  it('estimates split diff rows', () => {
    const node = {
      type: 'code_block',
      language: 'diff',
      code: 'same\nnew\ntail',
      raw: [
        'diff --git a/value.ts b/value.ts',
        'index 1234567..7654321 100644',
        '--- a/value.ts',
        '+++ b/value.ts',
        '@@ -1,3 +1,3 @@',
        ' same',
        '-old',
        '+new',
        ' tail',
        '',
      ].join('\n'),
      diff: true,
      originalCode: 'same\nold\ntail\n',
      updatedCode: 'same\nnew\ntail\n',
    } as any
    const split = estimateCodeBlockHeight(
      node,
      {
        rendererKind: 'stream-diffs',
        showHeader: false,
      },
    )

    expect(split?.contentHeight).toBe(54)
  })

  it('estimates split patch rows without source pairs', () => {
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'diff',
        code: '-old\n+new',
        raw: '-old\n+new\n',
        diff: true,
      } as any,
      {
        rendererKind: 'stream-diffs',
        showHeader: false,
      },
    )

    expect(estimated?.contentHeight).toBe(18)
  })

  it('caps stream-diffs estimate by max height', () => {
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: new Array(120).fill('console.log("x")').join('\n'),
        raw: '```ts\n...\n```',
      } as any,
      {
        rendererKind: 'stream-diffs',
        showHeader: true,
      },
    )

    expect(estimated?.contentHeight).toBe(500)
    expect(estimated?.height).toBe(540)
  })
})
