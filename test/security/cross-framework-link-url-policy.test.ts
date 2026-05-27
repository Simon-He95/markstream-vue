/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { renderMarkdownNodeToHtml as renderAngularNodeToHtml } from '../../packages/markstream-angular/src/renderMarkdownHtml'
import { LinkNode as ReactLinkNode } from '../../packages/markstream-react/src/components/LinkNode/LinkNode'
import { LinkNode as ReactServerLinkNode } from '../../packages/markstream-react/src/server-renderer'
import { renderMarkdownNodeToHtml as renderSvelteNodeToHtml } from '../../packages/markstream-svelte/src/renderMarkdownHtml'
import { renderMarkdownNodeToHtml as renderVue2NodeToHtml } from '../../packages/markstream-vue2/src/utils/nestedHtml'

function linkNode(href: string) {
  return {
    type: 'link',
    href,
    title: null,
    text: 'x',
    raw: `[x](${href})`,
    loading: false,
    children: [{ type: 'text', content: 'x', raw: 'x' }],
  } as any
}

function renderAllLinkOutputs(href: string) {
  const node = linkNode(href)
  return [
    renderVue2NodeToHtml(node),
    renderSvelteNodeToHtml(node),
    renderAngularNodeToHtml(node),
    renderToStaticMarkup(React.createElement(ReactServerLinkNode as any, { node })),
    renderToStaticMarkup(React.createElement(ReactLinkNode as any, { node })),
  ]
}

function expectRelHardened(html: string) {
  const rel = html.match(/\srel="([^"]*)"/i)?.[1] ?? ''
  expect(html).toMatch(/\starget="_blank"/i)
  expect(rel.split(/\s+/)).toContain('noopener')
  expect(rel.split(/\s+/)).toContain('noreferrer')
}

async function loadVueLinkNode() {
  const StubNode = { props: ['node'], template: '<span />' }
  vi.doMock('../../src/components/EmphasisNode/EmphasisNode.vue', () => ({ default: StubNode }))
  vi.doMock('../../src/components/HighlightNode', () => ({ default: StubNode }))
  vi.doMock('../../src/components/HtmlInlineNode', () => ({ default: StubNode }))
  vi.doMock('../../src/components/ImageNode', () => ({ default: StubNode }))
  vi.doMock('../../src/components/InlineCodeNode', () => ({ default: StubNode }))
  vi.doMock('../../src/components/StrikethroughNode', () => ({ default: StubNode }))
  vi.doMock('../../src/components/StrongNode', () => ({ default: StubNode }))
  const mod = await import('../../src/components/LinkNode/LinkNode.vue')
  return mod.default
}

describe('cross-framework link URL policy', () => {
  it('omits unsafe hrefs in framework renderers', () => {
    const unsafe = [
      'javascript:alert(1)',
      'java\u0000script:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.example/x',
      '\\\\evil.example/x',
      '\\/evil.example/x',
      '/\\evil.example/x',
    ]

    for (const href of unsafe) {
      for (const rendered of renderAllLinkOutputs(href)) {
        expect(rendered).not.toMatch(/\shref=/i)
        expect(rendered).not.toMatch(/\starget=/i)
        expect(rendered).not.toMatch(/\srel=/i)
        expect(rendered).not.toMatch(/javascript:/i)
        expect(rendered).not.toMatch(/vbscript:/i)
        expect(rendered).not.toMatch(/data:text\/html/i)
      }
    }
  })

  it('omits unsafe hrefs in the Vue 3 LinkNode component path', async () => {
    const VueLinkNode = await loadVueLinkNode()
    const unsafe = [
      'javascript:alert(1)',
      'java\u0000script:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.example/x',
      '\\\\evil.example/x',
      '\\/evil.example/x',
      '/\\evil.example/x',
    ]

    for (const href of unsafe) {
      const wrapper = mount(VueLinkNode as any, {
        props: {
          node: linkNode(href),
          indexKey: 'x',
          showTooltip: false,
        },
      })
      const anchor = wrapper.get('a').element as HTMLAnchorElement

      expect(wrapper.get('a').attributes('href')).toBeUndefined()
      expect(wrapper.get('a').attributes('target')).toBeUndefined()
      expect(wrapper.get('a').attributes('rel')).toBeUndefined()
      expect(anchor.protocol).not.toBe('javascript:')
      wrapper.unmount()
    }
  })

  it('preserves safe hrefs in framework renderers', () => {
    const safe = [
      'https://example.com',
      'http://example.com',
      'mailto:a@example.com',
      'tel:+123456789',
      '/docs',
      '#section',
    ]

    for (const href of safe) {
      for (const rendered of renderAllLinkOutputs(href))
        expect(rendered).toContain(`href="${href}"`)
    }
  })

  it('hardens new-tab links in framework renderers', () => {
    for (const rendered of renderAllLinkOutputs('https://example.com'))
      expectRelHardened(rendered)
  })

  it.each(['#section', '/docs', './a', '../a', '?q=1', 'mailto:a@example.com', 'tel:+123456789'])(
    'does not force target blank for internal and non-http links: %s',
    (href) => {
      for (const rendered of renderAllLinkOutputs(href)) {
        expect(rendered).toContain(`href="${href}"`)
        expect(rendered).not.toMatch(/\starget="_blank"/i)
        expect(rendered).not.toMatch(/\srel=/i)
      }
    },
  )

  it('does not force target blank for internal links in the Vue 3 LinkNode component path', async () => {
    const VueLinkNode = await loadVueLinkNode()

    for (const href of ['#section', '/docs', './a', '../a', '?q=1', 'mailto:a@example.com', 'tel:+123456789']) {
      const wrapper = mount(VueLinkNode as any, {
        props: {
          node: linkNode(href),
          indexKey: 'x',
          showTooltip: false,
        },
      })

      expect(wrapper.get('a').attributes('href')).toBe(href)
      expect(wrapper.get('a').attributes('target')).toBeUndefined()
      expect(wrapper.get('a').attributes('rel')).toBeUndefined()
      wrapper.unmount()
    }
  })
})
