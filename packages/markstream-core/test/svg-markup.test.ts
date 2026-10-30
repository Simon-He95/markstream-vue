import { describe, expect, it } from 'vitest'
import { extractRenderedSvg, toSafeSvgMarkup } from '../src'

describe('shared SVG markup', () => {
  it('preserves the viewBox and renderer root class while removing executable SVG content', () => {
    const safe = toSafeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="alert(1)"><script>alert(1)</script><a href="https://example.com"><text>Chart</text></a></svg>', 'markstream-d2-root-svg')
    const root = new DOMParser().parseFromString(safe, 'image/svg+xml').documentElement
    expect(root.getAttribute('viewBox')).toBe('0 0 20 10')
    expect(root.classList.contains('markstream-d2-root-svg')).toBe(true)
    expect(root.hasAttribute('onload')).toBe(false)
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://example.com')
    expect(root.textContent).toBe('Chart')
  })

  it('rejects non-SVG markup and preserves allowed image URLs', () => {
    expect(toSafeSvgMarkup('<div>Not a chart</div>')).toBe('')
    const safe = toSafeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/image.png" /></svg>')
    expect(safe).toContain('https://example.com/image.png')
  })

  it('accepts the SVG output shapes used by the diagram renderers', () => {
    const svg = '<svg></svg>'
    expect(extractRenderedSvg(svg)).toBe(svg)
    expect(extractRenderedSvg({ svg })).toBe(svg)
    expect(extractRenderedSvg({ data: svg })).toBe(svg)
  })
})
