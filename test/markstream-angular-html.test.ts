import { describe, expect, it } from 'vitest'
import {
  renderMarkdownNodeToHtml,
  renderMarkdownToHtml,
  renderNestedMarkdownToHtml,
} from '../packages/markstream-angular/src/renderMarkdownHtml'
import { sanitizeHtmlContent as sanitizeHtmlFragment } from '../packages/markstream-angular/src/sanitizeHtmlContent'

describe('markstream-angular html renderer', () => {
  it('renders markdown content into stable html for baseline blocks', () => {
    const html = renderMarkdownToHtml({
      content: `# Angular\n\n- one\n- two\n\n\`\`\`ts\nconst value = 1\n\`\`\``,
      final: true,
    })

    expect(html).toContain('<h1>Angular</h1>')
    expect(html).toContain('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
    expect(html).toContain('data-markstream-code-block="1"')
    expect(html).toContain('data-markstream-language="ts"')
    expect(html).toContain('class="language-ts"')
    expect(html).toContain('const value = 1')
  })

  it('preserves diff metadata on code fences for advanced enhancers', () => {
    const html = renderMarkdownToHtml({
      content: `\`\`\`diff ts
-const value = 1
+const value: number = 1
\`\`\``,
      final: true,
    })

    expect(html).toContain('data-markstream-diff="1"')
    expect(html).toContain('data-markstream-original="')
    expect(html).toContain('data-markstream-updated="')
    expect(html).toContain('data-markstream-language="ts"')
  })

  it('renders nested custom nodes with merged classes', () => {
    const html = renderNestedMarkdownToHtml(
      {
        nodes: [
          {
            type: 'thinking',
            tag: 'thinking',
            raw: '',
            attrs: [['class', 'preset']],
            children: [
              {
                type: 'paragraph',
                raw: '',
                children: [
                  { type: 'text', raw: '', content: 'Inner ' },
                  {
                    type: 'strong',
                    raw: '',
                    children: [{ type: 'text', raw: '', content: 'bold' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        customHtmlTags: ['thinking'],
        customNodeClass: 'thinking-node__nested',
      },
    )

    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('data-markstream-custom-tag="thinking"')
    expect(html).toContain('class="markstream-nested-custom markstream-nested-custom--thinking thinking-node__nested preset"')
  })

  it('escapes incomplete html nodes instead of trusting partial markup', () => {
    const html = renderMarkdownNodeToHtml(
      {
        type: 'html_inline',
        raw: '',
        content: '<span>partial',
        loading: true,
        autoClosed: false,
      } as any,
    )

    expect(html).toBe('&lt;span&gt;partial')
  })

  it('preserves safe html structures like details and summary', () => {
    const html = renderMarkdownToHtml({
      content: `<details>\n<summary>More</summary>\n<p>Body</p>\n</details>`,
      final: true,
    })

    expect(html).toContain('<details>')
    expect(html).toContain('<summary>')
    expect(html).toContain('More')
    expect(html).toContain('<p>Body</p>')
    expect(html).toContain('</details>')
  })

  it('keeps top-level thinking nodes intact while streaming html output', () => {
    const html = renderMarkdownToHtml({
      content: '<thinking>我们需要给出一个全面的回答',
      final: false,
      customHtmlTags: ['thinking'],
    })

    expect(html).toContain('data-markstream-custom-tag="thinking"')
    expect(html).toContain('全面的回答')
    expect(html).not.toContain('&lt;thinking&gt;')
  })

  it('emits math source and render shells so KaTeX can refresh incrementally', () => {
    const html = renderMarkdownToHtml({
      content: '$x = a$\n\n$$f(x) = x^2$$',
      final: true,
    })

    expect(html).toContain('markstream-nested-math__source')
    expect(html).toContain('markstream-nested-math__render')
    expect(html).toContain('markstream-nested-math-block__source')
    expect(html).toContain('markstream-nested-math-block__render')
  })

  it('keeps softbreak text visible and renders references like the runtime renderer', () => {
    const html = renderMarkdownToHtml({
      content: '第一行\n第二行[3]',
      final: true,
    })

    expect(html).toContain('class="markstream-angular-text-node"')
    expect(html).toContain('第一行\n第二行')
    expect(html).toContain('<span class="markstream-nested-reference">3</span>')
    expect(html).not.toContain('<sup class="markstream-nested-reference">')
  })

  it('sanitizes dangerous html while preserving safe attributes', () => {
    const html = sanitizeHtmlFragment('<details open onclick="evil()"><summary>Safe</summary><a href="javascript:alert(1)" title="ok">Link</a><script>alert(1)</script></details>')

    expect(html).toContain('<details open>')
    expect(html).toContain('<summary>Safe</summary>')
    expect(html).toContain('<a title="ok">Link</a>')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('blocks active html tags by default and supports trusted or escape htmlPolicy', () => {
    const safeHtml = sanitizeHtmlFragment('<div>Safe</div><iframe src="https://example.com"></iframe><form><input name="q"></form>')

    expect(safeHtml).toContain('<div>Safe</div>')
    expect(safeHtml).not.toContain('<iframe')
    expect(safeHtml).not.toContain('<form')
    expect(safeHtml).not.toContain('<input')

    const trustedHtml = sanitizeHtmlFragment('<iframe src="https://example.com"></iframe>', 'trusted')
    expect(trustedHtml).toContain('<iframe src="https://example.com">')

    const escapedHtml = sanitizeHtmlFragment('<div>Escaped</div>', 'escape')
    expect(escapedHtml).toBe('&lt;div&gt;Escaped&lt;/div&gt;')
  })

  it('applies htmlPolicy in static angular rendering helpers', () => {
    const escapedHtml = renderMarkdownToHtml({
      content: '<div>x</div>',
      final: true,
      htmlPolicy: 'escape',
    })
    const trustedHtml = renderMarkdownToHtml({
      content: '<iframe src="https://example.com"></iframe>',
      final: true,
      htmlPolicy: 'trusted',
    })

    expect(escapedHtml).toContain('&lt;div&gt;x&lt;/div&gt;')
    expect(trustedHtml).toContain('<iframe src="https://example.com"></iframe>')
  })

  it('escapes unknown tags and strips safe-policy style/srcset hazards', () => {
    const safeHtml = sanitizeHtmlFragment('<unknown-tag style="position:fixed">Hello</unknown-tag><img src="cover.jpg" srcset="javascript:alert(1) 1x, cover-2x.jpg 2x"><span style="color:red">World</span>')

    expect(safeHtml).toContain('&lt;unknown-tag style="position:fixed"&gt;Hello&lt;/unknown-tag&gt;')
    expect(safeHtml).toContain('<img src="cover.jpg">')
    expect(safeHtml).toContain('<span>World</span>')
    expect(safeHtml).not.toContain('srcset=')
    expect(safeHtml).not.toContain('<span style=')
  })

  it('omits unsafe link hrefs in static html rendering', () => {
    const html = renderMarkdownNodeToHtml({
      type: 'link',
      href: 'javascript:alert(1)',
      title: null,
      text: 'Unsafe',
      children: [],
    } as any)

    expect(html).toContain('<a')
    expect(html).toContain('Unsafe')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('javascript:')
  })

  it('renders structured html wrappers while leaving blocked tags on the sanitized fallback path', () => {
    const structuredHtml = renderMarkdownNodeToHtml(
      {
        type: 'html_block',
        tag: 'span',
        raw: '<span style="font-size: 12px;"></span>',
        content: '<span style="font-size: 12px;"></span>',
        attrs: [['style', 'font-size: 12px;']],
        children: [
          {
            type: 'list',
            raw: '',
            ordered: false,
            items: [
              {
                type: 'list_item',
                raw: '',
                children: [{ type: 'text', raw: '', content: 'alpha' }],
              },
              {
                type: 'list_item',
                raw: '',
                children: [{ type: 'text', raw: '', content: 'beta' }],
              },
            ],
          },
        ],
      } as any,
    )

    expect(structuredHtml).toContain('<span>')
    expect(structuredHtml).toContain('<ul><li>alpha</li><li>beta</li></ul>')
    expect(structuredHtml).not.toContain('style=')

    const blockedHtml = renderMarkdownNodeToHtml(
      {
        type: 'html_block',
        tag: 'script',
        raw: '<script>\n\n- alpha\n\n</script>',
        content: '<script>\n\n- alpha\n\n</script>',
        children: [
          {
            type: 'list',
            raw: '',
            ordered: false,
            items: [
              {
                type: 'list_item',
                raw: '',
                children: [{ type: 'text', raw: '', content: 'alpha' }],
              },
            ],
          },
        ],
      } as any,
    )

    expect(blockedHtml).not.toContain('<ul>')
    expect(blockedHtml).not.toContain('<li>')
    expect(blockedHtml).not.toContain('<script')

    const literalHtml = renderMarkdownNodeToHtml(
      {
        type: 'html_block',
        tag: 'pre',
        raw: '<pre>\n\n- alpha\n\n</pre>',
        content: '<pre>\n\n- alpha\n\n</pre>',
        children: [
          {
            type: 'list',
            raw: '',
            ordered: false,
            items: [
              {
                type: 'list_item',
                raw: '',
                children: [{ type: 'text', raw: '', content: 'alpha' }],
              },
            ],
          },
        ],
      } as any,
    )

    expect(literalHtml).not.toContain('<ul>')
    expect(literalHtml).not.toContain('<li>')
    expect(literalHtml).toContain('<pre>')
  })

  it('sanitizes dangerous attrs on structured html wrappers', () => {
    const html = renderMarkdownNodeToHtml(
      {
        type: 'html_block',
        tag: 'a',
        raw: '<a href="javascript:alert(1)" onclick="alert(1)" target="_blank" rel="opener nofollow" data-safe="ok"></a>',
        content: '<a href="javascript:alert(1)" onclick="alert(1)" target="_blank" rel="opener nofollow" data-safe="ok"></a>',
        attrs: [
          ['href', 'javascript:alert(1)'],
          ['onclick', 'alert(1)'],
          ['target', '_blank'],
          ['rel', 'opener nofollow'],
          ['data-safe', 'ok'],
        ],
        children: [
          {
            type: 'paragraph',
            raw: 'safe child',
            children: [{ type: 'text', raw: 'safe child', content: 'safe child' }],
          },
        ],
      } as any,
    )

    expect(html).toContain('<a data-safe="ok">')
    expect(html).toContain('<p>safe child</p>')
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('target=')
    expect(html).not.toContain('rel=')
    expect(html).not.toContain('rel="opener')
    expect(html).not.toContain('javascript:')
  })
})
