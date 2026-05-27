import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('sanitizeHtmlContent', () => {
  it('removes dangerous attrs, unsafe urls, and blocked tags', () => {
    const html = sanitizeHtmlContent('<div onclick="evil()">Hello <img src="x" onerror="evil()"><a href="javascript:alert(1)" title="ok">Link</a><script>alert(1)</script></div>')

    expect(html).toContain('<div>Hello <img src="x"><a title="ok">Link</a></div>')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('uses the safe HTML policy by default', () => {
    const html = sanitizeHtmlContent('<div>Safe</div><iframe src="https://example.com"></iframe><object data="/x"></object><style>body{color:red}</style><form><button>Submit</button></form><input value="x"><select><option>One</option></select><dialog>Modal</dialog>')

    expect(html).toBe('<div>Safe</div>')
  })

  it('escapes unknown tags and removes style in safe mode', () => {
    const html = sanitizeHtmlContent('<unknown-tag style="position:fixed">Hello</unknown-tag><span style="color:red">World</span>')

    expect(html).toContain('&lt;unknown-tag style="position:fixed"&gt;Hello&lt;/unknown-tag&gt;')
    expect(html).toContain('<span>World</span>')
    expect(html).not.toContain('<span style=')
  })

  it('keeps safe mode on a minimal allowlist instead of broad standard html', () => {
    const html = sanitizeHtmlContent('<details><summary>More</summary><p>Body</p></details><video src="clip.mp4"></video><canvas></canvas><html><body>Document</body></html>')

    expect(html).toContain('<details><summary>More</summary><p>Body</p></details>')
    expect(html).toContain('&lt;video src="clip.mp4"&gt;&lt;/video&gt;')
    expect(html).toContain('&lt;canvas&gt;&lt;/canvas&gt;')
    expect(html).toContain('&lt;html&gt;&lt;body&gt;Document&lt;/body&gt;&lt;/html&gt;')
  })

  it('sanitizes srcset candidates instead of treating the whole value as one URL', () => {
    const safeHtml = sanitizeHtmlContent('<img src="cover.jpg" srcset="cover-1x.jpg 1x, cover-2x.jpg 2x">')
    const unsafeHtml = sanitizeHtmlContent('<img src="cover.jpg" srcset="javascript:alert(1) 1x, cover-2x.jpg 2x">')

    expect(safeHtml).toContain('srcset="cover-1x.jpg 1x, cover-2x.jpg 2x"')
    expect(unsafeHtml).toBe('<img src="cover.jpg">')
  })

  it('hardens raw html anchors that open a new tab in safe mode', () => {
    const html = sanitizeHtmlContent('<a href="https://example.com" target="_blank" rel="opener nofollow">Link</a>')

    expect(html).toContain('<a href="https://example.com" target="_blank" rel="nofollow noopener noreferrer">Link</a>')
    expect(html).not.toContain('rel="opener')
  })

  it('drops ping from raw HTML anchors', () => {
    const html = sanitizeHtmlContent('<a href="https://example.com" ping="https://attacker.example/collect">x</a>', 'safe')

    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('ping=')
  })

  it('can preserve broader HTML tags for trusted content', () => {
    const html = sanitizeHtmlContent('<iframe src="https://example.com"></iframe><style>body{color:red}</style><span style="color:red">Styled</span><video src="clip.mp4"></video><html><body>Doc</body></html><script>alert(1)</script>', 'trusted')

    expect(html).toContain('<iframe src="https://example.com"></iframe>')
    expect(html).toContain('<style>body{color:red}</style>')
    expect(html).toContain('<span style="color:red">Styled</span>')
    expect(html).toContain('<video src="clip.mp4"></video>')
    expect(html).toContain('<html><body>Doc</body></html>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('can escape HTML instead of rendering it', () => {
    const html = sanitizeHtmlContent('<iframe src="https://example.com">x</iframe>', 'escape')

    expect(html).toBe('&lt;iframe src=&quot;https://example.com&quot;&gt;x&lt;/iframe&gt;')
  })

  it('preserves whitespace around safe inline html', () => {
    const html = sanitizeHtmlContent('Hello <span data-safe="1">world</span> !')

    expect(html).toBe('Hello <span data-safe="1">world</span> !')
  })
})
