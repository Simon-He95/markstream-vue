/**
 * @vitest-environment jsdom
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isBrokenMermaidSvg, sanitizeMermaidSvg, toSafeMermaidSvgMarkup, toSafeSvgElement } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

const mermaidSvgFixtureDir = join(process.cwd(), 'test/fixtures/mermaid-svg')

function readMermaidSvgFixtures() {
  return readdirSync(mermaidSvgFixtureDir)
    .filter(name => name.endsWith('.svg'))
    .map(name => ({
      name,
      svg: readFileSync(join(mermaidSvgFixtureDir, name), 'utf8'),
    }))
}

describe('mermaid SVG sanitizer', () => {
  it('removes executable SVG markup', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10" onload="alert(1)">
        <script>alert(1)</script>
        <a href="javascript:alert(1)">
          <text style="background:url(javascript:alert(1))">x</text>
        </a>
        <image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" />
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i)
    expect(svg).not.toMatch(/javascript:/i)
    expect(svg).not.toMatch(/vbscript:/i)
    expect(svg).not.toMatch(/data:text\/html/i)
    expect(svg).not.toMatch(/expression\s*\(/i)
    expect(svg).not.toMatch(/@import/i)
  })

  it('removes foreignObject active HTML content in strict sanitizer', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <foreignObject>
          <iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>
        </foreignObject>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/foreignObject/i)
    expect(svg).not.toMatch(/iframe/i)
    expect(svg).not.toMatch(/srcdoc/i)
    expect(svg).not.toMatch(/script/i)
  })

  it('strips foreignObject output while preserving renderable SVG children', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <foreignObject><div>label</div></foreignObject>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/foreignObject/i)
    expect(svg).toMatch(/<rect/i)
  })

  it('preserves Mermaid foreignObject label text as safe SVG text', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 100 50">
        <g class="label" transform="translate(10, 10)">
          <foreignObject width="80" height="24">
            <div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">八戒叫阵火云洞</span></div>
          </foreignObject>
        </g>
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/foreignObject/i)
    expect(svg).toMatch(/<text/i)
    expect(svg).toContain('八戒叫阵火云洞')
  })

  it('removes non-SVG tags from Mermaid output', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <video src="https://example.com/a.mp4"></video>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/video/i)
    expect(svg).toMatch(/<rect/i)
  })

  it('removes dangerous style tag content', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <style>@import url(javascript:alert(1));</style>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toContain('<style')
    expect(svg).not.toMatch(/@import/i)
    expect(svg).not.toMatch(/javascript:/i)
  })

  it('removes external CSS imports from SVG style elements', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <style>
          @import url(https://attacker.test/x.css);
          .x { background: url(javascript:alert(1)); }
        </style>
        <rect class="x" width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toContain('<style')
    expect(svg).not.toMatch(/@import/i)
    expect(svg).not.toMatch(/javascript:/i)
  })

  it('removes CSS escape-obfuscated url functions and protocols', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <style>
          .x { background: u\\72l(https://attacker.example/x.png); }
          .y { background: url(java\\73cript:alert(1)); }
          @imp\\6Frt url(https://attacker.example/x.css);
        </style>
        <rect class="x" width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toContain('<style')
    expect(svg).not.toMatch(/attacker\.example/i)
    expect(svg).not.toMatch(/javascript:/i)
  })

  it('preserves safe SVG style tags in sanitized Mermaid output', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <style onload="alert(1)">.node rect { fill: #fff; stroke: #333; }</style>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).toContain('<style')
    expect(svg).toContain('fill')
    expect(svg).toContain('stroke')
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i)
  })

  it('removes dangerous style URLs', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <style>.x { background: url(javascript:alert(1)); }</style>
        <rect width="10" height="10" style="background:url(javascript:alert(1))" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toContain('<style')
    expect(svg).not.toMatch(/\sstyle=/i)
    expect(svg).not.toMatch(/javascript:/i)
  })

  it('removes unsafe SVG href attributes', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink">
        <use xlink:href="javascript:alert(1)" />
        <image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" />
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/xlink:href=/i)
    expect(svg).not.toMatch(/data:text\/html/i)
  })

  it('preserves linked Mermaid visual children while sanitizing href', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <a href="javascript:alert(1)">
          <text>x</text>
          <rect width="10" height="10" />
        </a>
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).toMatch(/<a/i)
    expect(svg).toMatch(/<text/i)
    expect(svg).toMatch(/<rect/i)
    expect(svg).not.toMatch(/href=/i)
    expect(svg).not.toMatch(/javascript:/i)
  })

  it('hardens SVG anchor target blank rel', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <a href="https://example.com" target="_blank" rel="opener">
          <text>x</text>
        </a>
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).toContain('target="_blank"')
    expect(svg).toMatch(/rel="[^"]*noopener[^"]*"/)
    expect(svg).toMatch(/rel="[^"]*noreferrer[^"]*"/)
    expect(svg).not.toMatch(/\bopener\b/i)
  })

  it('removes data SVG CSS URLs but preserves internal paint servers', () => {
    const unsafe = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <rect style="fill:url(data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E)" />
        <rect width="10" height="10" />
      </svg>
    `)
    const safe = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <defs>
          <linearGradient id="g"><stop offset="0%" /></linearGradient>
        </defs>
        <rect fill="url(#g)" width="10" height="10" />
      </svg>
    `)

    expect(unsafe).toBeTruthy()
    expect(unsafe).not.toMatch(/data:image\/svg\+xml/i)
    expect(unsafe).not.toMatch(/\sstyle=/i)
    expect(safe).toBeTruthy()
    expect(safe).toMatch(/url\(#g\)/)
  })

  it('uses SVG tag and attribute context when sanitizing URL attributes', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <image href="mailto:a@example.com" />
        <image src="data:image/png;base64,AAAA" />
        <use href="https://evil.example/sprite.svg#x" />
        <use href="#local-symbol" />
        <a href="mailto:a@example.com"><text>x</text></a>
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/<image[^>]+mailto:/i)
    expect(svg).toMatch(/<image[^>]+data:image\/png/i)
    expect(svg).not.toMatch(/<use[^>]+https:/i)
    expect(svg).toMatch(/<use[^>]+#local-symbol/i)
    expect(svg).toMatch(/<a[^>]+mailto:/i)
  })

  it('allows local SVG references but rejects external paint-server URLs', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <defs><linearGradient id="g" /></defs>
        <rect fill="url(#g)" width="10" height="10" />
        <rect stroke="url(https://evil.test/g)" width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).toMatch(/url\(#g\)/)
    expect(svg).not.toContain('https://evil.test')
  })

  it('rejects external use references', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <use href="https://evil.test/icon#x" />
        <use href="#local-icon" />
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toContain('https://evil.test')
    expect(svg).toMatch(/<use[^>]+#local-icon/i)
  })

  it('rejects image href with SVG data URL but allows bitmap data URL', () => {
    const svg = sanitizeMermaidSvg(`
      <svg viewBox="0 0 10 10">
        <image href="data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E" />
        <image href="data:image/png;base64,iVBORw0KGgo=" />
        <rect width="10" height="10" />
      </svg>
    `)

    expect(svg).toBeTruthy()
    expect(svg).not.toMatch(/data:image\/svg\+xml/i)
    expect(svg).toContain('data:image/png')
  })

  it.each(readMermaidSvgFixtures())('preserves renderable Mermaid SVG fixture $name', ({ svg }) => {
    const sanitized = sanitizeMermaidSvg(svg)

    expect(sanitized).toBeTruthy()
    expect(sanitized).toContain('<svg')
    expect(sanitized).toMatch(/<(?:path|rect|text|line|polygon|polyline|circle|ellipse)\b/i)
    expect(sanitized).not.toMatch(/<script/i)
    expect(sanitized).not.toMatch(/\son[a-z]+\s*=/i)
    expect(sanitized).not.toMatch(/javascript:/i)
    expect(sanitized).not.toMatch(/vbscript:/i)
    expect(sanitized).not.toMatch(/data:text\/html/i)

    if (svg.match(/<linearGradient/i))
      expect(sanitized).toMatch(/<linearGradient/i)
    if (svg.match(/<radialGradient/i))
      expect(sanitized).toMatch(/<radialGradient/i)
    if (svg.match(/<stop/i))
      expect(sanitized).toMatch(/<stop/i)
    if (svg.match(/<clipPath/i))
      expect(sanitized).toMatch(/<clipPath/i)
    if (svg.match(/<mask/i))
      expect(sanitized).toMatch(/<mask/i)
    if (svg.match(/<pattern/i))
      expect(sanitized).toMatch(/<pattern/i)
    if (svg.match(/<style/i))
      expect(sanitized).toMatch(/<style/i)
  })

  it('detects broken Mermaid SVG output', () => {
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')).toBe(false)
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 0 10"><rect width="10" height="10" /></svg>')).toBe(true)
    expect(isBrokenMermaidSvg('<svg viewBox="0 0 10 10"><rect width="NaN" height="10" /></svg>')).toBe(true)
    expect(isBrokenMermaidSvg('<div></div>')).toBe(true)
  })

  it('does not throw when SVG parsing fails', () => {
    const OriginalDOMParser = globalThis.DOMParser

    class ThrowingDOMParser {
      parseFromString() {
        throw new Error('parse failed')
      }
    }

    globalThis.DOMParser = ThrowingDOMParser as unknown as typeof DOMParser
    try {
      expect(() => sanitizeMermaidSvg('<not-svg')).not.toThrow()
      expect(sanitizeMermaidSvg('<not-svg')).toBeNull()
      expect(isBrokenMermaidSvg('<not-svg')).toBe(true)
    }
    finally {
      globalThis.DOMParser = OriginalDOMParser
    }
  })

  it('parses once when converting SVG markup to a safe element', () => {
    const OriginalDOMParser = globalThis.DOMParser
    let parseCount = 0

    class CountingDOMParser {
      private parser = new OriginalDOMParser()

      parseFromString(markup: string, type: DOMParserSupportedType) {
        parseCount++
        return this.parser.parseFromString(markup, type)
      }
    }

    globalThis.DOMParser = CountingDOMParser as unknown as typeof DOMParser
    try {
      const el = toSafeSvgElement<SVGElement>('<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>')
      expect(el).toBeTruthy()
      expect(parseCount).toBe(1)
    }
    finally {
      globalThis.DOMParser = OriginalDOMParser
    }
  })

  it.each([
    '<svg><use href="javascript:alert(1)" /></svg>',
    '<svg><image href="javascript:alert(1)" /></svg>',
  ])('treats SVG nodes without safe href as non-renderable %#', (svg) => {
    const sanitized = toSafeMermaidSvgMarkup(svg)

    expect(sanitized).not.toContain('javascript:')
    expect(isBrokenMermaidSvg(sanitized)).toBe(true)
  })
})
