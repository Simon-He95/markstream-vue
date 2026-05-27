import { describe, expect, it } from 'vitest'
import {
  renderMarkdownNodeToHtml,
  renderNestedMarkdownToHtml,
} from '../packages/markstream-vue2/src/utils/nestedHtml'

describe('vue2 nested html helper', () => {
  it('renders nested custom nodes and markdown children into stable html', () => {
    const html = renderNestedMarkdownToHtml(
      {
        nodes: [
          {
            type: 'paragraph',
            raw: '',
            children: [
              { type: 'text', raw: '', content: 'Before' },
            ],
          },
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
                    children: [
                      { type: 'text', raw: '', content: 'bold' },
                    ],
                  },
                ],
              },
              {
                type: 'list',
                raw: '',
                ordered: false,
                items: [
                  {
                    type: 'list_item',
                    raw: '',
                    children: [
                      { type: 'text', raw: '', content: 'item' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        customHtmlTags: ['thinking'],
        customNodeClass(node) {
          return node.type === 'thinking' ? 'thinking-node__nested' : ''
        },
      },
    )

    expect(html).toContain('<p>Before</p>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<ul><li>item</li></ul>')
    expect(html).toContain('data-markstream-custom-tag="thinking"')
    expect(html).toContain('class="markstream-nested-custom markstream-nested-custom--thinking thinking-node__nested preset"')
  })

  it('falls back to markdown rendering for streaming content fragments', () => {
    const html = renderNestedMarkdownToHtml(
      {
        node: {
          type: 'thinking',
          tag: 'thinking',
          raw: '',
          content: 'Streamed intro\n\n- first\n- second',
        } as any,
      },
      {
        cacheKey: 'vue2-nested-html-streaming',
        customHtmlTags: ['thinking'],
      },
    )

    expect(html).toContain('<p>Streamed intro</p>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>first</li>')
    expect(html).toContain('<li>second</li>')
  })

  it('sanitizes unsafe attrs while preserving merged classes for custom nodes', () => {
    const html = renderMarkdownNodeToHtml(
      {
        type: 'hint',
        tag: 'hint',
        raw: '',
        attrs: [
          ['onclick', 'alert(1)'],
          ['data-role', 'inner'],
          ['class', 'preset'],
        ],
        children: [
          { type: 'text', raw: '', content: 'Safe body' },
        ],
      } as any,
      {
        customNodeClass: 'extra-class',
      },
    )

    expect(html).toContain('data-role="inner"')
    expect(html).toContain('class="markstream-nested-custom markstream-nested-custom--hint extra-class preset"')
    expect(html).not.toContain('onclick=')
    expect(html).toContain('Safe body')
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

  it('renders footnote html with the same anchors as markstream-vue', () => {
    const html = renderNestedMarkdownToHtml({
      nodes: [
        {
          type: 'paragraph',
          raw: '',
          children: [
            { type: 'text', raw: '', content: 'Ref' },
            { type: 'footnote_reference', raw: '[^1]', id: '1' },
          ],
        },
        {
          type: 'footnote',
          raw: '',
          id: '1',
          children: [
            {
              type: 'paragraph',
              raw: '',
              children: [
                { type: 'text', raw: '', content: 'Footnote body' },
                { type: 'footnote_anchor', raw: '↩︎', id: '1' },
              ],
            },
          ],
        },
      ] as any,
    })

    expect(html).toContain('<sup id="fnref-1" class="footnote-reference markstream-nested-footnote-ref"><span href="#fnref--1" title="查看脚注 1" class="footnote-link cursor-pointer">[1]</span></sup>')
    expect(html).toContain('<div id="fnref--1" class="footnote-node markstream-nested-footnote"><div class="footnote-node__content">')
    expect(html).toContain('<a class="footnote-anchor" href="#fnref-1" title="返回引用 1" aria-label="返回引用 1">↩︎</a>')
    expect(html).not.toContain('href="#footnote-1"')
  })

  it('renders structured html wrappers while leaving blocked tags unstructured', () => {
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

    expect(structuredHtml).toContain('<span style="font-size: 12px;">')
    expect(structuredHtml).toContain('<ul><li>alpha</li><li>beta</li></ul>')

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

    expect(blockedHtml).toBe('')
    expect(blockedHtml).not.toContain('<script')
    expect(blockedHtml).not.toContain('<ul>')

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

    expect(literalHtml).toBe('<pre>\n\n- alpha\n\n</pre>')
  })

  it('sanitizes dangerous attrs on structured html wrappers', () => {
    const html = renderMarkdownNodeToHtml(
      {
        type: 'html_block',
        tag: 'a',
        raw: '<a href="javascript:alert(1)" onclick="alert(1)" data-safe="ok"></a>',
        content: '<a href="javascript:alert(1)" onclick="alert(1)" data-safe="ok"></a>',
        attrs: [
          ['href', 'javascript:alert(1)'],
          ['onclick', 'alert(1)'],
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
    expect(html).not.toContain('javascript:')
  })
})
