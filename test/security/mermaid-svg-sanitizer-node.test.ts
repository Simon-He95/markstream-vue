/**
 * @vitest-environment node
 */

import { isBrokenMermaidSvg, sanitizeMermaidSvg, toSafeMermaidSvgMarkup } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('mermaid SVG sanitizer without DOMParser', () => {
  it('treats non-empty SVG as unknown and unsafe', () => {
    const originalDOMParser = (globalThis as any).DOMParser
    delete (globalThis as any).DOMParser

    try {
      const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'

      expect(sanitizeMermaidSvg(svg)).toBeNull()
      expect(toSafeMermaidSvgMarkup(svg)).toBe('')
      expect(isBrokenMermaidSvg(svg)).toBe(true)
    }
    finally {
      if (originalDOMParser === undefined)
        delete (globalThis as any).DOMParser
      else
        (globalThis as any).DOMParser = originalDOMParser
    }
  })
})
