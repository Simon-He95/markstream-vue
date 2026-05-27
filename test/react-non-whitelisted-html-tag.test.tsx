import React, { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
/**
 * @vitest-environment jsdom
 *
 * Tests for non-whitelisted custom HTML tags rendering in React.
 *
 * When a custom HTML-like tag (e.g., `<echat-url>`) is NOT in the `customHtmlTags` whitelist,
 * it should be rendered as literal text instead of being parsed as an HTML element.
 * This prevents content loss and ensures surrounding Markdown renders correctly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HtmlBlockNode } from '../packages/markstream-react/src/components/HtmlBlockNode/HtmlBlockNode'
import { HtmlInlineNode } from '../packages/markstream-react/src/components/HtmlInlineNode/HtmlInlineNode'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-react/src/customComponents'

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('react: non-whitelisted custom HTML tags', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
    vi.unstubAllGlobals()
  })

  it('renders whitelisted tag as custom component', async () => {
    const scopeId = 'react-whitelisted-tag'
    const CustomTag: React.FC<{ node: { content?: string } }> = ({ node }) => (
      <custom-component>{node.content || ''}</custom-component>
    )

    setCustomComponents(scopeId, { 'my-tag': CustomTag })

    try {
      const markdown = `<my-tag>Hello World</my-tag>`
      const host = document.createElement('div')
      document.body.appendChild(host)
      const root = createRoot(host)

      await act(async () => {
        root.render(
          React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
            content: markdown,
            customId: scopeId,
            customHtmlTags: ['my-tag'],
            final: true,
            smoothStreaming: false,
          })),
        )
      })
      await flushReact()

      const text = host.textContent || ''
      // Should render as custom component
      expect(text).toContain('Hello World')

      root.unmount()
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders standard HTML div as HTML element', async () => {
    const scopeId = 'react-standard-html-div'
    const markdown = `<div class="test">Content</div>`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          smoothStreaming: false,
        })),
      )
    })
    await flushReact()

    const html = host.innerHTML
    // Standard div should render as HTML element
    expect(html).toContain('<div')
    expect(html).toContain('</div>')
    expect(html).toContain('Content')

    root.unmount()
  })

  it('sanitizes raw html fallback content for client html nodes', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const blockNode = React.createElement(HtmlBlockNode as any, {
      node: {
        type: 'html_block',
        content: '<div><img src="x" onerror="alert(1)"><a href="javascript:alert(1)" title="ok">Link</a><script>alert(1)</script></div>',
        loading: false,
      },
      customId: 'react-safe-html-block',
    })
    const inlineNode = React.createElement(HtmlInlineNode as any, {
      node: {
        type: 'html_inline',
        content: 'Before <img src="x" onerror="alert(1)"><a href="javascript:alert(1)" title="ok">Link</a> After',
        loading: false,
      },
      customId: 'react-safe-html-inline',
    })

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(React.Fragment, null, blockNode, inlineNode)),
      )
    })
    await flushReact()

    const imgs = Array.from(host.querySelectorAll('img'))
    const links = Array.from(host.querySelectorAll('a'))

    expect(imgs.length).toBeGreaterThan(0)
    imgs.forEach(img => expect(img.getAttribute('onerror')).toBeNull())
    expect(links.length).toBeGreaterThan(0)
    links.forEach((link) => {
      expect(link.getAttribute('href')).toBeNull()
      expect(link.getAttribute('title')).toBe('ok')
    })
    expect(host.innerHTML).not.toContain('<script')
    expect(host.innerHTML).not.toContain('javascript:')
    expect(host.innerHTML).not.toContain('alert(1)')

    root.unmount()
  })

  it('blocks active html tags by default and allows them with trusted policy', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          nodes: [
            {
              type: 'html_block',
              content: '<div>Safe</div><iframe src="https://example.com"></iframe><form><input name="q"></form>',
              raw: '',
            },
          ],
          final: true,
          smoothStreaming: false,
        })),
      )
    })
    await flushReact()

    expect(host.querySelector('iframe')).toBeNull()
    expect(host.querySelector('form')).toBeNull()
    expect(host.querySelector('input')).toBeNull()

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          nodes: [
            {
              type: 'html_block',
              content: '<iframe src="https://example.com"></iframe>',
              raw: '',
            },
          ],
          htmlPolicy: 'trusted',
          final: true,
          smoothStreaming: false,
        })),
      )
    })
    await flushReact()

    expect(host.querySelector('iframe')).toBeTruthy()

    root.unmount()
  })

  it('keeps registered custom components live while rendering unknown tags as literal text on the dynamic path', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const MyComp: React.FC<React.PropsWithChildren> = ({ children }) => (
      <mark data-react-custom="1">{children}</mark>
    )

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(HtmlBlockNode as any, {
          node: {
            type: 'html_block',
            content: '<mycomp>ok</mycomp><unknown-tag>keep</unknown-tag>',
            loading: false,
          },
          customId: 'react-dynamic-html-mixed',
          customComponents: { mycomp: MyComp },
        })),
      )
    })
    await flushReact()

    expect(host.querySelector('[data-react-custom="1"]')?.textContent).toBe('ok')
    expect(host.textContent).toContain('keep')
    expect(host.querySelector('unknown-tag')).toBeNull()
    expect(host.innerHTML).toContain('&lt;unknown-tag&gt;keep&lt;/unknown-tag&gt;')

    root.unmount()
  })

  it('keeps registered custom components live for inline dynamic html while rendering unknown tags as literal text', async () => {
    const scopeId = 'react-inline-dynamic-html-mixed'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const MyComp: React.FC<React.PropsWithChildren> = ({ children }) => (
      <mark data-react-inline-custom="1">{children}</mark>
    )

    setCustomComponents(scopeId, { mycomp: MyComp })

    try {
      await act(async () => {
        root.render(
          React.createElement(StrictMode, null, React.createElement(HtmlInlineNode as any, {
            node: {
              type: 'html_inline',
              content: '<mycomp>ok</mycomp><unknown-tag>keep</unknown-tag>',
              loading: false,
              autoClosed: true,
            },
            customId: scopeId,
          })),
        )
      })
      await flushReact()

      expect(host.querySelector('[data-react-inline-custom="1"]')?.textContent).toBe('ok')
      expect(host.textContent).toContain('keep')
      expect(host.querySelector('unknown-tag')).toBeNull()
      expect(host.innerHTML).toContain('&lt;unknown-tag&gt;keep&lt;/unknown-tag&gt;')
    }
    finally {
      root.unmount()
      removeCustomComponents(scopeId)
    }
  })

  it('escapes html when htmlPolicy is escape', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          nodes: [
            {
              type: 'html_block',
              content: '<div>Escaped</div>',
              raw: '',
            },
          ],
          htmlPolicy: 'escape',
          final: true,
          smoothStreaming: false,
        })),
      )
    })
    await flushReact()

    expect(host.innerHTML).toContain('&lt;div&gt;Escaped&lt;/div&gt;')
    expect(host.textContent).toContain('<div>Escaped</div>')

    root.unmount()
  })

  it('renders markdown children inside standard html wrappers exactly once', async () => {
    const scopeId = 'react-structured-html-wrapper'
    const markdown = `<span style="font-size: 12px;">

- alpha
- beta

</span>`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          smoothStreaming: false,
        })),
      )
    })
    await flushReact()

    expect(host.querySelectorAll('ul')).toHaveLength(1)
    expect(host.querySelectorAll('li')).toHaveLength(2)
    expect((host.textContent || '').match(/alpha/g)?.length ?? 0).toBe(1)
    expect((host.textContent || '').match(/beta/g)?.length ?? 0).toBe(1)

    root.unmount()
  })

  it('does not structure blocked html wrappers into live markdown children', async () => {
    const scopeId = 'react-structured-blocked-tag'
    const markdown = `<script>

- alpha
- beta

</script>`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          smoothStreaming: false,
        })),
      )
    })
    await flushReact()

    expect(host.querySelectorAll('ul')).toHaveLength(0)
    expect(host.querySelectorAll('li')).toHaveLength(0)

    root.unmount()
  })

  it('renders closed non-whitelisted custom tag as escaped text in safe mode', async () => {
    const scopeId = 'react-closed-unknown-tag'
    const markdown = `<echat-url>content</echat-url>`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          smoothStreaming: false,
        })),
      )
    })
    await flushReact()

    expect(host.innerHTML).toContain('&lt;echat-url&gt;content&lt;/echat-url&gt;')

    root.unmount()
  })

  it('renders non-whitelisted custom tag content correctly', async () => {
    const scopeId = 'react-non-whitelisted-content'
    // Non-whitelisted tags should still show their content
    const markdown = `Hello <unknown-tag>world</unknown-tag>!`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          smoothStreaming: false,
          // NOT adding 'unknown-tag' to customHtmlTags
        })),
      )
    })
    await flushReact()

    const text = normalizeText(host.textContent || '')
    // Content should be preserved
    expect(text).toContain('Hello')
    expect(text).toContain('world')
    expect(text).toContain('!')

    root.unmount()
  })

  it('preserves text after non-whitelisted tag in list item', async () => {
    // Original BUG: text after non-whitelisted tag was truncated in list items
    const scopeId = 'react-list-item-tag-truncation'
    const markdown = `- 一段说明文字。
- <echat-url>标签。
- 一段数据分析总结。`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          smoothStreaming: false,
          // NOT adding 'echat-url' to customHtmlTags
        })),
      )
    })
    await flushReact()

    const text = normalizeText(host.textContent || '')
    // All three list items should be rendered
    expect(text).toContain('一段说明文字')
    // "标签。" should NOT be lost - this was the original bug
    expect(text).toContain('标签')
    expect(text).toContain('一段数据分析总结')

    root.unmount()
  })

  it('renders incomplete non-whitelisted tag literally as text', async () => {
    const scopeId = 'react-literal-tag-display'
    const markdown = `<echat-url>content`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          // NOT adding 'echat-url' to customHtmlTags
        })),
      )
    })
    await flushReact()

    const html = host.innerHTML
    expect(html).toContain('&lt;echat-url&gt;content')
    expect(html).not.toContain('&amp;lt;')
    expect(html).toContain('content')
    expect(html).not.toMatch(/<echat-url[^>]*>/i)

    root.unmount()
  })

  it('does not truncate surrounding markdown in list context', async () => {
    // Original BUG: surrounding markdown was truncated when non-whitelisted tag appeared
    const scopeId = 'react-surrounding-markdown-truncation'
    const markdown = `Before list:

- Item with <custom-tag>inline content</custom-tag> and more text.
- Another item.

After list.`
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          customId: scopeId,
          final: true,
          smoothStreaming: false,
          // NOT adding 'custom-tag' to customHtmlTags
        })),
      )
    })
    await flushReact()

    const text = normalizeText(host.textContent || '')
    // Before/after content should be preserved
    expect(text).toContain('Before list')
    expect(text).toContain('After list')
    // List items should be complete
    expect(text).toContain('Item with')
    expect(text).toContain('inline content')
    expect(text).toContain('and more text')
    expect(text).toContain('Another item')

    root.unmount()
  })
})
