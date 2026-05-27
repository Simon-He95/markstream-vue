/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { SAFE_ALLOWED_HTML_TAGS, sanitizeHtmlContent } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import MarkdownRender from '../../src/components/NodeRenderer'
import { parseHtmlToVNodes } from '../../src/utils/htmlRenderer'
import payloads from '../fixtures/security/html-xss-corpus.json'
import { flushAll } from '../setup/flush-all'

const SafeCard = defineComponent({
  name: 'SafeCard',
  setup(_, { attrs, slots }) {
    return () => h('section', attrs, slots.default?.())
  },
})

function expectNoExecutableMarkup(html: string) {
  const root = document.createElement('div')
  root.innerHTML = html

  expect(root.querySelector('script')).toBeNull()

  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name).not.toMatch(/^on/i)

      if (['href', 'src', 'xlink:href', 'action', 'data', 'srcdoc', 'formaction', 'poster'].includes(attr.name.toLowerCase())) {
        expect(attr.value).not.toMatch(/javascript:/i)
        expect(attr.value).not.toMatch(/vbscript:/i)
        expect(attr.value).not.toMatch(/data:text\/html/i)
      }

      if (attr.name.toLowerCase() === 'style') {
        expect(attr.value).not.toMatch(/javascript:/i)
        expect(attr.value).not.toMatch(/expression\s*\(/i)
        expect(attr.value).not.toMatch(/@import/i)
      }
    }
  }
}

function collectProps(nodes: any[], out: Record<string, unknown>[] = []) {
  for (const node of nodes) {
    if (!node || typeof node !== 'object')
      continue

    out.push(node.props ?? {})

    const children = node.children
    if (Array.isArray(children))
      collectProps(children, out)
  }

  return out
}

function expectNoExecutableProps(props: Record<string, unknown>) {
  for (const [name, value] of Object.entries(props)) {
    const attrName = name.toLowerCase()
    expect(attrName).not.toMatch(/^on/i)
    expect(attrName).not.toBe('srcdoc')

    if (typeof value !== 'string')
      continue

    if (['href', 'src', 'xlink:href', 'action', 'data', 'srcdoc', 'formaction', 'poster'].includes(attrName)) {
      expect(value).not.toMatch(/javascript:/i)
      expect(value).not.toMatch(/vbscript:/i)
      expect(value).not.toMatch(/data:text\/html/i)
    }

    if (attrName === 'style') {
      expect(value).not.toMatch(/javascript:/i)
      expect(value).not.toMatch(/expression\s*\(/i)
      expect(value).not.toMatch(/@import/i)
    }
  }
}

describe('htmlPolicy safe security corpus', () => {
  it('does not include safe-blocked tags in the safe allowlist', () => {
    const blocked = [
      'script',
      'base',
      'button',
      'datalist',
      'dialog',
      'embed',
      'fieldset',
      'form',
      'iframe',
      'input',
      'legend',
      'link',
      'meta',
      'object',
      'optgroup',
      'option',
      'output',
      'param',
      'select',
      'style',
      'template',
      'textarea',
      'title',
    ]
    const overlap = blocked.filter(tag => SAFE_ALLOWED_HTML_TAGS.has(tag))

    expect(overlap).toEqual([])
  })

  it.each(payloads)('does not create executable DOM for $name', ({ html }) => {
    expectNoExecutableMarkup(sanitizeHtmlContent(html, 'safe'))
  })

  it.each(payloads)('does not create executable VNode props for $name', ({ html }) => {
    const nodes = parseHtmlToVNodes(html, { 'safe-card': SafeCard }, 'safe') ?? []
    const props = collectProps(nodes)

    for (const prop of props)
      expectNoExecutableProps(prop)
  })

  it('scrubs unsafe URLs from allowed HTML elements', () => {
    const html = sanitizeHtmlContent('<a href="javascript:alert(1)">x</a><img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="><span style="background:url(javascript:alert(1))">x</span>', 'safe')

    expect(html).toContain('<a>x</a>')
    expect(html).toContain('<img>')
    expect(html).not.toContain('src=')
    expect(html).toContain('<span>x</span>')
    expectNoExecutableMarkup(html)
  })

  it.each([
    ['<iframe></script><p>leaked</p></iframe><p>ok</p>'],
    ['<script><iframe></iframe>alert(1)</script><p>ok</p>'],
    ['<style></iframe>.x{background:red}</style><p>ok</p>'],
  ])('does not leave hard-blocked subtree on mismatched closing tags %#', (input) => {
    const html = sanitizeHtmlContent(input, 'safe')

    expect(html).not.toContain('leaked')
    expect(html).not.toContain('alert(1)')
    expect(html).not.toContain('background:red')
    expect(html).toContain('<p>ok</p>')
    expectNoExecutableMarkup(html)
  })

  it('does not leave browser-parsed javascript link protocols after URL entity decoding', () => {
    const payloads = [
      'java&#x09;script:alert(1)',
      'java&#x0D;script:alert(1)',
      'java&#x0A;script:alert(1)',
      'jav&#97;script:alert(1)',
      'javascript&#x3A;alert(1)',
      'javascrip&#x74;:alert(1)',
      '\u000Bjavascript:alert(1)',
      '\fjavascript:alert(1)',
    ]

    for (const payload of payloads) {
      const root = document.createElement('div')
      root.innerHTML = sanitizeHtmlContent(`<a href="${payload}">x</a>`, 'safe')
      const anchor = root.querySelector('a') as HTMLAnchorElement | null

      expect(anchor?.protocol).not.toBe('javascript:')
      expect(anchor?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    }
  })

  it('does not re-enable entity-obfuscated javascript URLs in sanitized HTML output', () => {
    const html = sanitizeHtmlContent('<a href="jav&#x61;script:alert(1)">x</a>', 'safe')

    expect(html).not.toMatch(/javascript:/i)
    expect(html).not.toMatch(/href=["']?javascript/i)
  })

  it('does not re-enable entity-obfuscated javascript URLs in VNode output', () => {
    const nodes = parseHtmlToVNodes('<a href="jav&#x61;script:alert(1)">x</a>', {}, 'safe') ?? []
    const props = (nodes[0] as any)?.props ?? {}

    expect(props.href).toBeUndefined()
  })

  it('sanitizes executable HTML through MarkdownRender safe mode', async () => {
    const wrapper = mount(MarkdownRender, {
      props: {
        content: '<a href="javascript:alert(1)">bad</a><span onclick="alert(1)">x</span>',
        final: true,
        htmlPolicy: 'safe',
        batchRendering: false,
      },
    })

    await flushAll()

    expect(wrapper.html()).not.toMatch(/javascript:/i)
    expect(wrapper.html()).not.toMatch(/\sonclick=/i)
  })

  it.each([
    '<a href="java',
    '<a href="javascript:',
    '<img src=x oner',
    '<script',
    '</script',
    '<thinking><img src=x onerror=alert(1)>',
  ])('keeps streaming HTML mid-state non-executable: %s', async (content) => {
    const wrapper = mount(MarkdownRender, {
      props: {
        content,
        final: false,
        customHtmlTags: ['thinking'],
        htmlPolicy: 'safe',
        batchRendering: false,
      },
    })

    await flushAll()

    expectNoExecutableMarkup(wrapper.html())
  })
})
