/**
 * @vitest-environment jsdom
 *
 * Tests for non-whitelisted custom HTML tags rendering as plain text.
 *
 * When a custom HTML-like tag (e.g., `<echat-url>`) is NOT in the `customHtmlTags` whitelist,
 * it should be rendered as literal text instead of being parsed as an HTML element.
 * This prevents content loss and ensures surrounding Markdown renders correctly.
 */
import { mount } from '@vue/test-utils'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

let MarkdownRender: any

beforeAll(async () => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  MarkdownRender = (await import('../src/components/NodeRenderer')).default
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

describe('non-whitelisted custom HTML tags', () => {
  it('renders whitelisted tag as custom component', async () => {
    const scopeId = 'whitelisted-tag'
    const CustomTag = {
      name: 'CustomTag',
      props: { node: { type: Object, required: true } },
      setup(props: any) {
        return () => `<custom-component>${(props.node as any).content || ''}</custom-component>`
      },
    }

    setCustomComponents(scopeId, { 'my-tag': CustomTag })

    try {
      const markdown = `<my-tag>Hello World</my-tag>`
      const wrapper = await mount(MarkdownRender, {
        props: {
          content: markdown,
          customId: scopeId,
          customHtmlTags: ['my-tag'],
          final: true,
        },
      })
      await flushAll()
      try {
        const text = wrapper.text()
        // Should render as custom component
        expect(text).toContain('Hello World')
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders standard HTML div as HTML element', async () => {
    const scopeId = 'standard-html-div'
    const markdown = `<div class="test">Content</div>`
    const wrapper = await mount(MarkdownRender, {
      props: {
        content: markdown,
        customId: scopeId,
        final: true,
      },
    })
    await flushAll()
    try {
      const html = wrapper.html()
      // Standard div should render as HTML element
      expect(html).toContain('<div')
      expect(html).toContain('</div>')
      expect(html).toContain('Content')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('renders closed non-whitelisted custom tag as escaped text in safe mode', async () => {
    const scopeId = 'closed-unknown-tag'
    const markdown = `<echat-url>content</echat-url>`
    const wrapper = await mount(MarkdownRender, {
      props: {
        content: markdown,
        customId: scopeId,
        final: true,
      },
    })
    await flushAll()
    try {
      const html = wrapper.html()
      expect(html).toContain('&lt;echat-url&gt;content&lt;/echat-url&gt;')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('renders non-whitelisted custom tag content correctly', async () => {
    const scopeId = 'non-whitelisted-content'
    // Non-whitelisted tags should still show their content
    const markdown = `Hello <unknown-tag>world</unknown-tag>!`
    const wrapper = await mount(MarkdownRender, {
      props: {
        content: markdown,
        customId: scopeId,
        final: true,
        // NOT adding 'unknown-tag' to customHtmlTags
      },
    })
    await flushAll()
    try {
      const text = normalizeText(wrapper.text())
      // Content should be preserved
      expect(text).toContain('Hello')
      expect(text).toContain('world')
      expect(text).toContain('!')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('preserves text after non-whitelisted tag in list item', async () => {
    // Original BUG: text after non-whitelisted tag was truncated in list items
    const scopeId = 'list-item-tag-truncation'
    const markdown = `- 一段说明文字。
- <echat-url>标签。
- 一段数据分析总结。`
    const wrapper = await mount(MarkdownRender, {
      props: {
        content: markdown,
        customId: scopeId,
        final: true,
        // NOT adding 'echat-url' to customHtmlTags
      },
    })
    await flushAll()
    try {
      const text = normalizeText(wrapper.text())
      // All three list items should be rendered
      expect(text).toContain('一段说明文字')
      // "标签。" should NOT be lost - this was the original bug
      expect(text).toContain('标签')
      expect(text).toContain('一段数据分析总结')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('renders incomplete non-whitelisted tag literally as text', async () => {
    const scopeId = 'literal-tag-display'
    const markdown = `<echat-url>content`

    const wrapper = await mount(MarkdownRender, {
      props: {
        content: markdown,
        customId: scopeId,
        final: true,
      },
    })
    await flushAll()

    try {
      const html = wrapper.html()
      expect(html).toContain('&lt;echat-url&gt;content')
      expect(html).not.toContain('&amp;lt;')
      expect(html).toContain('content')
      expect(html).not.toMatch(/<echat-url[^>]*>/i)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not truncate surrounding markdown in list context', async () => {
    // Original BUG: surrounding markdown was truncated when non-whitelisted tag appeared
    const scopeId = 'surrounding-markdown-truncation'
    const markdown = `Before list:

- Item with <custom-tag>inline content</custom-tag> and more text.
- Another item.

After list.`
    const wrapper = await mount(MarkdownRender, {
      props: {
        content: markdown,
        customId: scopeId,
        final: true,
        // NOT adding 'custom-tag' to customHtmlTags
      },
    })
    await flushAll()
    try {
      const text = normalizeText(wrapper.text())
      // Before/after content should be preserved
      expect(text).toContain('Before list')
      expect(text).toContain('After list')
      // List items should be complete
      expect(text).toContain('Item with')
      expect(text).toContain('inline content')
      expect(text).toContain('and more text')
      expect(text).toContain('Another item')
    }
    finally {
      wrapper.unmount()
    }
  })
})
