import { describe, expect, it } from 'vitest'
import {
  clampD2PreviewHeight,
  D2_PREVIEW_MAX_HEIGHT,
  D2_PREVIEW_MIN_HEIGHT,
  estimateD2PreviewHeight,
} from '../src/utils/diagramHeight'

describe('estimateD2PreviewHeight', () => {
  it('counts labelled shapes as shapes', () => {
    // `client: Web Client` is how D2 labels a shape: the key is the shape, the
    // value its label. Counting those lines as directives reserved the floor
    // (240px) for the diagrams that need a reservation the most.
    expect(estimateD2PreviewHeight('client: Web Client\napi: API Service\nclient -> api'))
      .toBe(estimateD2PreviewHeight('client\napi\nclient -> api'))
  })

  it('keeps counting the documented directives as settings', () => {
    expect(estimateD2PreviewHeight('direction: right\na -> b'))
      .toBe(estimateD2PreviewHeight('a -> b'))
    expect(estimateD2PreviewHeight('shape: cylinder\nlabel: Server\nicon: https://example.com/i.svg\na'))
      .toBe(estimateD2PreviewHeight('a'))
  })

  it('ignores the contents of directive blocks', () => {
    const withoutBlocks = estimateD2PreviewHeight('a -> b')
    expect(estimateD2PreviewHeight('vars: {\n  d2-config: {\n    layout-engine: elk\n  }\n}\na -> b'))
      .toBe(withoutBlocks)
    expect(estimateD2PreviewHeight('style: {\n  fill: "#eee"\n}\na -> b'))
      .toBe(withoutBlocks)
    expect(estimateD2PreviewHeight('classes: { big: { style: { font-size: 40 } } }\na -> b'))
      .toBe(withoutBlocks)
  })

  it('counts container declarations and their children', () => {
    // Both the container and the shapes inside it occupy space.
    expect(estimateD2PreviewHeight('server: {\n  api\n  db\n}\nserver -> client'))
      .toBeGreaterThan(estimateD2PreviewHeight('server -> client'))
  })

  it('reserves more for a labelled stack than for a directive-only block', () => {
    const labelled = Array.from({ length: 8 }, (_, index) => `n${index}: Node ${index}`).join('\n')
    expect(estimateD2PreviewHeight(labelled)).toBeGreaterThan(D2_PREVIEW_MIN_HEIGHT)
  })

  it('stays inside the clamp range', () => {
    expect(estimateD2PreviewHeight('')).toBe(D2_PREVIEW_MIN_HEIGHT)
    expect(estimateD2PreviewHeight('# just a comment\n...'))
      .toBe(D2_PREVIEW_MIN_HEIGHT)
    expect(estimateD2PreviewHeight(Array.from({ length: 200 }, (_, index) => `n${index}: Node ${index}`).join('\n')))
      .toBe(D2_PREVIEW_MAX_HEIGHT)
  })
})

describe('clampD2PreviewHeight', () => {
  it('caps the reservation at the height the preview itself can occupy', () => {
    // The rendered preview is capped by --ms-size-code-max-height (500px), so a
    // larger reservation would trade the growth shift for a shrink shift.
    expect(clampD2PreviewHeight(9_000)).toBe(500)
    expect(D2_PREVIEW_MAX_HEIGHT).toBe(500)
    expect(clampD2PreviewHeight(1)).toBe(D2_PREVIEW_MIN_HEIGHT)
    expect(clampD2PreviewHeight(320)).toBe(320)
    expect(clampD2PreviewHeight(9_000, undefined, null)).toBe(9_000)
  })
})
