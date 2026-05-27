/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import MarkdownRender from '../../src/components/NodeRenderer'
import payloads from '../fixtures/security/html-xss-corpus.json'
import { flushAll } from '../setup/flush-all'

describe('htmlPolicy escape security corpus', () => {
  it.each(payloads)('renders $name as text only', ({ html }) => {
    const escaped = sanitizeHtmlContent(html, 'escape')
    const root = document.createElement('div')
    root.innerHTML = escaped

    expect(root.children).toHaveLength(0)
    expect(root.textContent).toBe(html)
  })

  it('escapes HTML through MarkdownRender escape mode', async () => {
    const wrapper = mount(MarkdownRender, {
      props: {
        content: '<img src=x onerror=alert(1)>',
        final: true,
        htmlPolicy: 'escape',
        batchRendering: false,
      },
    })

    await flushAll()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
  })
})
