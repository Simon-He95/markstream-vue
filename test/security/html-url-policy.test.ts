import { describe, expect, it } from 'vitest'
import { sanitizeAttrs, sanitizeImageSrc } from '../../src/utils/htmlRenderer'

describe('html URL policy', () => {
  it('rejects script protocols with whitespace and control characters', () => {
    expect(sanitizeAttrs({ href: 'java\nscript:alert(1)' }).href).toBeUndefined()
    expect(sanitizeAttrs({ href: 'jav\tascript:alert(1)' }).href).toBeUndefined()
    expect(sanitizeAttrs({ href: 'java\u0000script:alert(1)' }).href).toBeUndefined()
    expect(sanitizeAttrs({ href: 'java\u0085script:alert(1)' }, 'safe', 'a').href).toBeUndefined()
    expect(sanitizeAttrs({ src: 'vb\rscript:msgbox(1)' }).src).toBeUndefined()
  })

  it('rejects URL payload variants', () => {
    const payloads = [
      ' javascript:alert(1)',
      '\njavascript:alert(1)',
      '\tjavascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'java\nscript:alert(1)',
      'java\u0000script:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:image/svg+xml,<svg onload=alert(1)>',
    ]

    for (const payload of payloads)
      expect(sanitizeAttrs({ href: payload }, 'safe', 'a').href).toBeUndefined()
  })

  it('rejects non-allowlisted absolute URL schemes', () => {
    const unsafe = [
      'file:///etc/passwd',
      'ftp://example.com/file',
      'blob:https://example.com/id',
      'filesystem:https://example.com/id',
      'intent://scan/#Intent;scheme=zxing;end',
      'chrome://settings',
    ]

    for (const value of unsafe)
      expect(sanitizeAttrs({ href: value }, 'safe', 'a').href).toBeUndefined()
  })

  it('allows common safe URL forms', () => {
    const safe = [
      'https://example.com',
      'http://example.com',
      'mailto:a@example.com',
      'tel:+123456789',
      '/docs',
      './relative',
      '../relative',
      '#section',
      '?q=1',
    ]

    for (const value of safe)
      expect(sanitizeAttrs({ href: value }, 'safe', 'a').href).toBe(value)
  })

  it('rejects protocol-relative URLs', () => {
    expect(sanitizeAttrs({ href: '//evil.example' }, 'safe', 'a').href).toBeUndefined()
    expect(sanitizeAttrs({ src: '//evil.example/x.png' }, 'safe', 'img').src).toBeUndefined()
    expect(sanitizeAttrs({ srcset: '//evil.example/x.png 1x' }, 'safe', 'img').srcset).toBeUndefined()
  })

  it('rejects backslash protocol-relative URL variants', () => {
    const values = [
      '\\\\evil.example/x',
      '\\/evil.example/x',
      '/\\evil.example/x',
    ]

    for (const value of values) {
      expect(sanitizeAttrs({ href: value }, 'safe', 'a').href).toBeUndefined()
      expect(sanitizeAttrs({ src: value }, 'safe', 'img').src).toBeUndefined()
      expect(sanitizeAttrs({ srcset: `${value} 1x` }, 'safe', 'img').srcset).toBeUndefined()
      expect(sanitizeImageSrc(value)).toBe('')
    }
  })

  it('applies URL protocols by attribute context', () => {
    expect(sanitizeAttrs({ href: 'mailto:a@example.com' }, 'safe', 'a').href).toBe('mailto:a@example.com')
    expect(sanitizeAttrs({ href: 'tel:+123456789' }, 'safe', 'a').href).toBe('tel:+123456789')
    expect(sanitizeAttrs({ src: 'mailto:a@example.com' }, 'safe', 'img').src).toBeUndefined()
    expect(sanitizeAttrs({ poster: 'tel:+123456789' }, 'safe', 'video').poster).toBeUndefined()
    expect(sanitizeAttrs({ action: 'mailto:a@example.com' }, 'trusted', 'form').action).toBeUndefined()
    expect(sanitizeAttrs({ data: 'tel:+123456789' }, 'trusted', 'object').data).toBeUndefined()
    expect(sanitizeAttrs({ src: 'https://example.com/a.png' }, 'safe', 'img').src).toBe('https://example.com/a.png')
    expect(sanitizeAttrs({ poster: 'https://example.com/poster.png' }, 'trusted', 'video').poster).toBe('https://example.com/poster.png')
  })

  it('rejects unsafe data documents but allows image data URLs', () => {
    expect(sanitizeAttrs({ href: 'data:text/html,<script>alert(1)</script>' }).href).toBeUndefined()
    expect(sanitizeAttrs({ src: 'data:text/html,<script>alert(1)</script>' }).src).toBeUndefined()
    expect(sanitizeAttrs({ href: 'data:image/png;base64,iVBORw0KGgo=' }, 'safe', 'a').href).toBeUndefined()
    expect(sanitizeAttrs({ href: 'data:image/svg+xml,<svg onload=alert(1)>' }, 'safe', 'a').href).toBeUndefined()
    expect(sanitizeAttrs({ src: 'data:image/png;base64,iVBORw0KGgo=' }, 'safe', 'iframe').src).toBeUndefined()
    expect(sanitizeAttrs({ src: 'data:image/svg+xml,<svg onload=alert(1)>' }, 'safe', 'img').src).toBeUndefined()
    expect(sanitizeAttrs({ src: 'data:image/png;base64,iVBORw0KGgo=' }, 'safe', 'img').src).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('rejects unsafe srcset candidates', () => {
    expect(sanitizeAttrs({ srcset: 'cover.png 1x, javascript:alert(1) 2x' }, 'safe', 'img').srcset).toBeUndefined()
    expect(sanitizeAttrs({ srcset: 'javascript:alert(1) 1x, data:text/html,<svg> 2x' }, 'safe', 'img').srcset).toBeUndefined()
    expect(sanitizeAttrs({ srcset: 'data:image/png;base64,iVBORw0KGgo= 1x' }, 'safe', 'img').srcset).toBeUndefined()
    expect(sanitizeAttrs({ srcset: 'cover.png 1x, cover@2x.png 2x' }, 'safe', 'img').srcset).toBe('cover.png 1x, cover@2x.png 2x')
  })

  it('keeps empty URL attrs and hardens target blank rel', () => {
    expect(sanitizeAttrs({ href: '' }, 'safe', 'a').href).toBe('')
    const rel = sanitizeAttrs({ href: 'https://x.com', target: '_blank', rel: 'opener' }, 'safe', 'a').rel?.split(/\s+/) ?? []
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
    expect(rel).not.toContain('opener')
  })

  it('drops ping from sanitized anchor attrs', () => {
    expect(
      sanitizeAttrs({
        href: 'https://example.com',
        ping: 'https://attacker.example/collect',
      }, 'safe', 'a').ping,
    ).toBeUndefined()
  })
})
