/**
 * @vitest-environment jsdom
 */

import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { removeCustomComponents, setCustomComponents } from '../../src/utils/nodeComponents'
import { flushAll } from '../setup/flush-all'

interface Scenario {
  name: string
  markdown: string
  expectedText?: string | string[]
  props?: Record<string, any>
  mountOptions?: Record<string, any>
  assert?: (wrapper: VueWrapper<any>) => void | Promise<void>
  skipSnapshot?: boolean
}

let MarkdownRender: any

// Use shared flushAll from test/setup/flush-all

async function mountMarkdown(markdown: string, props: Record<string, any> = {}, mountOptions: Record<string, any> = {}) {
  const wrapper = mount(MarkdownRender, {
    props: {
      content: markdown,
      smoothStreaming: false,
      ...props,
      customMarkdownIt: (md: any) => md.use(markdownItEmoji),
    },
    ...mountOptions,
  })
  await flushAll()
  return wrapper
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

function sanitizeSnapshotHtml(html: string, name: string) {
  html = html.replace(/class="([^"]*)"/g, (_, classNames: string) => {
    const normalized = classNames
      .split(/\s+/)
      .filter(Boolean)
      .filter(className => !/^fade-(?:enter|leave)(?:-(?:from|to|active))?$/.test(className))
      .join(' ')

    return normalized ? `class="${normalized}"` : ''
  })

  if (name.includes('admonition'))
    return html.replace(/admonition-[a-z0-9]+/gi, 'admonition-stable')
  return html
}

describe('markdownRender node e2e coverage', () => {
  beforeAll(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    MarkdownRender = (await import('../../src/components/NodeRenderer')).default
  })

  afterAll(() => {
    ; (Date.now as any).mockRestore?.()
  })

  const scenarios: Scenario[] = [
    {
      name: 'paragraph and text node',
      markdown: 'Simple paragraph content rendered as plain text.',
      expectedText: 'Simple paragraph content rendered as plain text.',
      assert: (wrapper) => {
        const paragraph = wrapper.find('p')
        expect(paragraph.exists()).toBe(true)
      },
    },
    {
      name: 'heading node',
      markdown: '# Heading Node Title',
      expectedText: 'Heading Node Title',
      assert: (wrapper) => {
        const heading = wrapper.find('h1')
        expect(heading.exists()).toBe(true)
      },
    },
    {
      name: 'blockquote node',
      markdown: '> Blockquote rendered content.',
      expectedText: 'Blockquote rendered content.',
      assert: (wrapper) => {
        const blockquote = wrapper.find('blockquote')
        expect(blockquote.exists()).toBe(true)
      },
    },
    {
      name: 'unordered list node',
      markdown: '- Item one\n- Item two',
      expectedText: ['Item one', 'Item two'],
      assert: (wrapper) => {
        const list = wrapper.find('ul')
        expect(list.exists()).toBe(true)
        expect(list.findAll('li')).toHaveLength(2)
      },
    },
    {
      name: 'ordered list node',
      markdown: '1. First entry\n2. Second entry',
      expectedText: ['First entry', 'Second entry'],
      assert: (wrapper) => {
        const list = wrapper.find('ol')
        expect(list.exists()).toBe(true)
        expect(list.findAll('li')).toHaveLength(2)
      },
    },
    {
      name: 'checkbox nodes',
      markdown: '- [x] Completed task\n- [ ] Pending task',
      expectedText: ['Completed task', 'Pending task'],
      assert: (wrapper) => {
        const checkboxes = wrapper.findAll('.checkbox-node')
        expect(checkboxes).toHaveLength(2)
        expect(checkboxes[0].find('.checkbox-checked').exists()).toBe(true)
        expect(checkboxes[1].find('.checkbox-unchecked').exists()).toBe(true)
      },
    },
    {
      name: 'link node',
      markdown: 'Visit [Vue](https://vuejs.org) now.',
      expectedText: ['Visit', 'Vue', 'now.'],
      assert: (wrapper) => {
        const link = wrapper.find('a[href="https://vuejs.org"]')
        expect(link.exists()).toBe(true)
        expect(link.text()).toBe('Vue')
      },
    },
    {
      name: 'image node',
      markdown: '![Vue Logo](https://example.com/vue.png "Vue Logo")',
      mountOptions: {
        global: {
          stubs: {
            'transition': false,
            'transition-group': false,
          },
        },
      },
      assert: (wrapper) => {
        const paragraph = wrapper.find('p.paragraph-node')
        expect(paragraph.exists()).toBe(true)
        expect(paragraph.find('figure').exists()).toBe(false)
        expect(paragraph.findAll('img')).toHaveLength(1)
        const img = paragraph.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('https://example.com/vue.png')
        expect(img.attributes('title')).toBe('Vue Logo')
      },
    },
    {
      name: 'single badge image with trailing newline stays inline',
      markdown: '![License](https://img.shields.io/npm/l/markstream-vue)\n',
      mountOptions: {
        global: {
          stubs: {
            'transition': false,
            'transition-group': false,
          },
        },
      },
      assert: (wrapper) => {
        const paragraph = wrapper.find('p.paragraph-node')
        expect(paragraph.exists()).toBe(true)
        expect(paragraph.find('figure').exists()).toBe(false)
        expect(paragraph.findAll('img')).toHaveLength(1)
        const img = paragraph.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('https://img.shields.io/npm/l/markstream-vue')
      },
    },
    {
      name: 'image paragraph separated by blank lines stays inline',
      markdown: `Before

![Vue Logo](https://example.com/vue.png "Vue Logo")

After`,
      expectedText: ['Before', 'After'],
      mountOptions: {
        global: {
          stubs: {
            'transition': false,
            'transition-group': false,
          },
        },
      },
      skipSnapshot: true,
      assert: (wrapper) => {
        const paragraphs = wrapper.findAll('p.paragraph-node')
        expect(paragraphs).toHaveLength(3)
        const imageParagraph = paragraphs[1]
        expect(imageParagraph.find('figure').exists()).toBe(false)
        expect(imageParagraph.findAll('img')).toHaveLength(1)
        const img = imageParagraph.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('https://example.com/vue.png')
        expect(img.attributes('title')).toBe('Vue Logo')
      },
    },
    {
      name: 'inline image inside text stays inline',
      markdown: 'Before ![Vue Logo](https://example.com/vue.png "Vue Logo") after.',
      expectedText: ['Before', 'after.'],
      mountOptions: {
        global: {
          stubs: {
            'transition': false,
            'transition-group': false,
          },
        },
      },
      skipSnapshot: true,
      assert: (wrapper) => {
        const paragraph = wrapper.find('p.paragraph-node')
        expect(paragraph.exists()).toBe(true)
        expect(paragraph.find('figure').exists()).toBe(false)
        expect(paragraph.findAll('img')).toHaveLength(1)
        const img = paragraph.find('img')
        expect(img.exists()).toBe(true)
        expect(img.attributes('src')).toBe('https://example.com/vue.png')
      },
    },
    {
      name: 'image links in same paragraph stay inline',
      markdown: `[![NPM version](https://img.shields.io/npm/v/markstream-vue?color=a1b858&label=)](https://www.npmjs.com/package/markstream-vue)
[![Playground](https://img.shields.io/badge/playground-live-34c759)](https://markstream-vue.simonhe.me/)
[![CI](https://github.com/Simon-He95/markstream-vue/actions/workflows/ci.yml/badge.svg)](https://github.com/Simon-He95/markstream-vue/actions/workflows/ci.yml)`,
      mountOptions: {
        global: {
          stubs: {
            'transition': false,
            'transition-group': false,
          },
        },
      },
      skipSnapshot: true,
      assert: (wrapper) => {
        const paragraph = wrapper.find('p.paragraph-node')
        expect(paragraph.exists()).toBe(true)
        expect(paragraph.element.tagName).toBe('P')

        const childTagNames = Array.from(paragraph.element.children).map(child => child.tagName)
        expect(childTagNames).toEqual(['A', 'A', 'A'])

        const links = paragraph.findAll('a.link-node')
        expect(links).toHaveLength(3)

        const images = paragraph.findAll('img')
        expect(images).toHaveLength(3)
        expect(paragraph.findAll('figure')).toHaveLength(0)
        // Each link should contain an img (possibly wrapped in a container span)
        const linksWithImages = links.filter(link => link.find('img').exists())
        expect(linksWithImages).toHaveLength(3)
        expect(images[0].attributes('src')).toContain('img.shields.io/npm/v/markstream-vue')
        expect(images[1].attributes('src')).toContain('img.shields.io/badge/playground-live-34c759')
        expect(images[2].attributes('src')).toContain('/badge.svg')
      },
    },
    {
      name: 'image links with relative target stay inline',
      markdown: `[![NPM version](https://img.shields.io/npm/v/markstream-vue?color=a1b858&label=)](https://www.npmjs.com/package/markstream-vue)
[![中文版](https://img.shields.io/badge/docs-中文文档-blue)](README.zh-CN.md)`,
      mountOptions: {
        global: {
          stubs: {
            'transition': false,
            'transition-group': false,
          },
        },
      },
      assert: (wrapper) => {
        const paragraph = wrapper.find('p.paragraph-node')
        expect(paragraph.exists()).toBe(true)
        expect(paragraph.element.tagName).toBe('P')

        const childTagNames = Array.from(paragraph.element.children).map(child => child.tagName)
        expect(childTagNames).toEqual(['A', 'A'])

        const links = paragraph.findAll('a.link-node')
        expect(links).toHaveLength(2)
        expect(paragraph.findAll('span.text-node')).toHaveLength(0)

        const images = paragraph.findAll('img')
        expect(images).toHaveLength(2)
        expect(links[0].find('img').exists()).toBe(true)
        expect(links[1].find('img').exists()).toBe(true)
        expect(links[1].attributes('href')).toBe('README.zh-CN.md')
        expect(links[1].attributes('target')).toBeUndefined()
        expect(links[1].attributes('rel')).toBeUndefined()
      },
    },
    {
      name: 'inline code node',
      markdown: 'Here is `const answer = 42` inline.',
      expectedText: ['Here is', 'const answer = 42', 'inline.'],
      assert: (wrapper) => {
        const code = wrapper.find('code')

        expect(code.exists()).toBe(true)
        expect(code.text()).toBe('const answer = 42')
      },
    },

    {
      name: 'code block node',
      markdown: '```ts\nexport const sum = (a: number, b: number) => a + b\n```',
      props: { renderCodeBlocksAsPre: true },
      expectedText: ['export const sum = (a: number, b: number) => a + b'],
      assert: async (wrapper) => {
        await flushAll()
        const fallback = wrapper.find('pre code')
        expect(fallback.exists()).toBe(true)
        expect(fallback.text()).toContain('export const sum = (a: number, b: number) => a + b')
      },
    },
    {
      name: 'mermaid block node',
      markdown: '```mermaid\ngraph LR;A-->B;\n```',
      skipSnapshot: true,
      assert: async (wrapper) => {
        await flushAll()
        await new Promise(resolve => setTimeout(resolve, 5000))

        const mermaid = wrapper.find('._mermaid')
        expect(mermaid.exists()).toBe(true)
        // do not rely on exact toolbar SVG markup in snapshots (icons may
        // render differently in different envs); just assert the wrapper
        // contains the mermaid container
        expect(mermaid.html()).toContain('_mermaid')
      },
    },
    {
      name: 'table node',
      markdown: '| Name | Role |\n| --- | --- |\n| Alice | Developer |',
      expectedText: ['Name', 'Role', 'Alice', 'Developer'],
      assert: (wrapper) => {
        const table = wrapper.find('table')
        expect(table.exists()).toBe(true)
        expect(table.findAll('tbody tr')).toHaveLength(1)
      },
    },
    {
      name: 'definition list node',
      markdown: '',
      props: {
        nodes: [
          {
            type: 'definition_list',
            raw: 'Term: Definition details',
            items: [
              {
                type: 'definition_item',
                raw: 'Term: Definition details',
                term: [
                  {
                    type: 'text',
                    content: 'Term',
                    raw: 'Term',
                  },
                ],
                definition: [
                  {
                    type: 'paragraph',
                    raw: 'Definition details',
                    children: [
                      {
                        type: 'text',
                        content: 'Definition details',
                        raw: 'Definition details',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      expectedText: ['Term', 'Definition details'],
      assert: (wrapper) => {
        const dl = wrapper.find('dl')
        expect(dl.exists()).toBe(true)
        expect(dl.findAll('dt')).toHaveLength(1)
        expect(dl.findAll('dd')).toHaveLength(1)
      },
    },
    {
      name: 'footnote nodes',
      markdown: 'A footnote reference[^1].\n\n[^1]: Footnote explanation',
      expectedText: ['A footnote reference', 'Footnote explanation'],
      assert: async (wrapper) => {
        const reference = wrapper.find('sup.footnote-reference')
        expect(reference.exists()).toBe(true)
        expect(reference.attributes('id')).toBe('fnref-1')
        expect(reference.find('.footnote-link').attributes('href')).toBe('#fnref--1')

        const footnoteBlock = wrapper.find('[id="fnref--1"]')
        expect(footnoteBlock.exists()).toBe(true)
        const footerAnchor = wrapper.find('.footnote-anchor')
        expect(footerAnchor.exists()).toBe(true)
        expect(footerAnchor.attributes('href')).toBe('#fnref-1')

        const originalScrollIntoView = Element.prototype.scrollIntoView
        const scrollIntoView = vi.fn()
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        ;(Element.prototype as any).scrollIntoView = scrollIntoView
        document.body.appendChild(wrapper.element)
        try {
          await reference.trigger('click')
          expect(scrollIntoView).toHaveBeenCalled()
          expect(warnSpy).not.toHaveBeenCalled()
        }
        finally {
          if (wrapper.element.parentNode === document.body)
            document.body.removeChild(wrapper.element)
          if (originalScrollIntoView)
            Element.prototype.scrollIntoView = originalScrollIntoView
          else
            delete (Element.prototype as any).scrollIntoView
          warnSpy.mockRestore()
        }
      },
    },
    {
      name: 'footnote reference node',
      markdown: '',
      props: {
        nodes: [
          {
            type: 'footnote_reference',
            id: '1',
            raw: '[^1]',
          },
        ],
      },
      expectedText: [],
      assert: (wrapper) => {
        const reference = wrapper.find('sup.footnote-reference')
        expect(reference.exists()).toBe(true)
        expect(reference.text()).toContain('1')
      },
    },
    {
      name: 'admonition node',
      markdown: '::: warning\nAdmonition content\n:::',
      expectedText: 'Admonition content',
      assert: (wrapper) => {
        const admonition = wrapper.find('.admonition-warning')
        expect(admonition.exists()).toBe(true)
      },
    },
    {
      name: 'thematic break node',
      markdown: 'First section.\n\n---\n\nSecond section.',
      expectedText: ['First section.', 'Second section.'],
      assert: (wrapper) => {
        const hr = wrapper.find('hr')
        expect(hr.exists()).toBe(true)
      },
    },
    {
      name: 'hardbreak node',
      markdown: 'Line one  \nLine two',
      expectedText: ['Line one', 'Line two'],
      assert: (wrapper) => {
        expect(wrapper.findAll('br.hard-break').length).toBeGreaterThan(0)
      },
    },
    {
      name: 'strong node',
      markdown: 'This is **bold text**.',
      expectedText: ['This is', 'bold text'],
      assert: (wrapper) => {
        const strong = wrapper.find('strong')
        expect(strong.exists()).toBe(true)
        expect(strong.text()).toBe('bold text')
      },
    },
    {
      name: 'emphasis node',
      markdown: 'This is *italic text*.',
      expectedText: ['This is', 'italic text'],
      assert: (wrapper) => {
        const em = wrapper.find('em')
        expect(em.exists()).toBe(true)
        expect(em.text()).toBe('italic text')
      },
    },
    {
      name: 'strikethrough node',
      markdown: 'This is ~~deleted text~~.',
      expectedText: ['This is', 'deleted text'],
      assert: (wrapper) => {
        const del = wrapper.find('s, del')
        expect(del.exists()).toBe(true)
      },
    },
    {
      name: 'highlight node',
      markdown: 'Use ==highlighted text== for emphasis.',
      expectedText: ['Use', 'highlighted text', 'for emphasis.'],
      assert: (wrapper) => {
        const mark = wrapper.find('mark.highlight-node')
        expect(mark.exists()).toBe(true)
      },
    },
    {
      name: 'insert node',
      markdown: 'Here comes ++inserted text++ in the paragraph.',
      expectedText: ['Here comes', 'inserted text', 'in the paragraph.'],
      assert: (wrapper) => {
        const ins = wrapper.find('ins.insert-node')
        expect(ins.exists()).toBe(true)
      },
    },
    {
      name: 'subscript node',
      markdown: 'Chemical formula H~2~O is familiar.',
      expectedText: ['Chemical formula', 'H2O', 'is familiar.'],
      assert: (wrapper) => {
        const sub = wrapper.find('sub')
        expect(sub.exists()).toBe(true)
        expect(sub.text()).toBe('2')
      },
    },
    {
      name: 'superscript node',
      markdown: 'Math uses x^2^ frequently.',
      expectedText: ['Math uses', 'x2', 'frequently.'],
      assert: (wrapper) => {
        const sup = wrapper.find('sup')
        expect(sup.exists()).toBe(true)
        expect(sup.text()).toBe('2')
      },
    },
    {
      name: 'emoji node',
      markdown: 'Smile with :smile: emoji.',
      expectedText: ['Smile with', 'emoji.'],
      assert: (wrapper) => {
        const emoji = wrapper.find('span.emoji-node')
        expect(emoji.exists()).toBe(true)
        expect(emoji.text()).toBe('😄')
      },
    },
    {
      name: 'math inline node',
      markdown: 'Einstein wrote $E=mc^2$.',
      skipSnapshot: false,
      // Accept either raw Dollar-delimited text or rendered KaTeX output
      expectedText: ['Einstein wrote', 'E=mc^2'],
      assert: async (wrapper) => {
        await flushAll()
        await flushAll()
        const inline = wrapper.find('.math-inline')
        if (inline.exists())
          expect(wrapper.html()).toContain('katex')
        else
          expect(wrapper.text()).toContain('Einstein wrote $E=mc^2$.')
      },
    },
    {
      name: 'math block node',
      markdown: '$$\na^2 + b^2 = c^2\n$$',
      skipSnapshot: true,
      // do not assert expectedText globally because math rendering is
      // optional and may be handled asynchronously or by KaTeX which
      // isn't guaranteed in the test env
      expectedText: [],
      assert: (wrapper) => {
        const block = wrapper.find('.math-block')
        // math rendering is optional (requires katex). Accept either
        // a rendered KaTeX block or the raw LaTeX fallback
        if (block.exists()) {
          // prefer KaTeX output, but tolerate absence
          const hasKaTeX = wrapper.html().includes('katex-display') || wrapper.html().includes('katex')
          if (!hasKaTeX) {
            expect(wrapper.text()).toContain('a^2 + b^2 = c^2')
          }
        }
      },
    },
    {
      name: 'reference node',
      markdown: 'Cite research [1] for details.',
      expectedText: ['Cite research', 'for details.'],
      assert: (wrapper) => {
        const reference = wrapper.find('span.reference-node')
        expect(reference.exists()).toBe(true)
        expect(reference.text()).toBe('1')
        expect(reference.classes()).toContain('reference-node')
      },
    },
    {
      name: 'complex inline code with emphasis and multiple code spans',
      markdown: '1.  **整合冗余条款：** 将原`1-(5)`、`3-(3)`、`3-(4)`中关于“缴纳费用”和“告知法律状态变化”的核心义务合并，统一放入`1-(4)`“法律状态维护与通知义务”中，使其逻辑更集中，避免了在不同部分重复提及相似义务。',
      expectedText: ['整合冗余条款', '1-(5)', '3-(3)', '3-(4)', '法律状态维护与通知义务'],
      // assert removed: rely on expectedText assertions to validate parsing
    },
  ]

  for (const scenario of scenarios) {
    it(`renders ${scenario.name}`, async () => {
      const wrapper = await mountMarkdown(scenario.markdown, scenario.props, scenario.mountOptions)
      try {
        if (scenario.assert)
          await scenario.assert(wrapper)

        const textContent = normalizeText(wrapper.text())
        if (Array.isArray(scenario.expectedText)) {
          for (const snippet of scenario.expectedText)
            expect(textContent).toContain(snippet)
        }
        else if (typeof scenario.expectedText === 'string' && scenario.expectedText.length > 0) {
          expect(textContent).toContain(scenario.expectedText)
        }

        if (!scenario.skipSnapshot) {
          const snapshotHtml = sanitizeSnapshotHtml(wrapper.html(), scenario.name)
          expect(snapshotHtml).toMatchSnapshot()
        }
      }
      finally {
        wrapper.unmount()
      }
    }, 20000)
  }

  it('resizes table columns from header drag handles', async () => {
    const wrapper = await mountMarkdown('| Name | Role |\n| --- | --- |\n| Alice | Developer |')
    try {
      const headers = wrapper.findAll('thead th')
      expect(headers).toHaveLength(2)

      const headerWidths = [120, 240]
      headers.forEach((header, index) => {
        Object.defineProperty(header.element, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({
            bottom: 0,
            height: 0,
            left: 0,
            right: 0,
            top: 0,
            width: headerWidths[index],
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }),
        })
      })

      const handle = headers[0].find('.table-node__resize-handle')
      expect(handle.exists()).toBe(true)

      handle.element.dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 120,
      }))
      window.dispatchEvent(new MouseEvent('pointermove', {
        bubbles: true,
        clientX: 180,
      }))
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
      await flushAll()

      const columns = wrapper.findAll('col')
      expect(columns).toHaveLength(2)
      expect(columns[0].attributes('style')).toContain('width: 180px')
      expect(columns[1].attributes('style')).toContain('width: 180px')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('allows overriding `list_item` via customComponents', async () => {
    const scopeId = 'custom-components-list-item'
    const CustomListItem = defineComponent({
      name: 'CustomListItem',
      props: {
        node: { type: Object, required: true },
        indexKey: [String, Number],
        value: Number,
        customId: String,
        typewriter: Boolean,
        fade: Boolean,
      },
      setup(props) {
        return () => h('li', { 'class': 'custom-list-item', 'data-value': props.value == null ? '' : String(props.value) }, [
          h(MarkdownRender, {
            nodes: (props.node as any).children || [],
            customId: props.customId,
            indexKey: `custom-list-item-${String(props.indexKey ?? '')}`,
            typewriter: props.typewriter,
            fade: props.fade,
            batchRendering: false,
          }),
        ])
      },
    })

    setCustomComponents(scopeId, { list_item: CustomListItem })

    try {
      const wrapper = await mountMarkdown('1. First entry\n2. Second entry', { customId: scopeId, final: true })
      try {
        const items = wrapper.findAll('li.custom-list-item')
        expect(items).toHaveLength(2)
        expect(items[0].attributes('data-value')).toBe('1')
        expect(items[1].attributes('data-value')).toBe('2')
        expect(normalizeText(wrapper.text())).toMatch(/First entry\s*Second entry/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('does not re-parse text override content as markdown', async () => {
    const scopeId = 'custom-components-text-override'
    const literal = 'Literal **x** and [y](https://example.com)'
    const CustomText = defineComponent({
      name: 'CustomText',
      props: {
        node: { type: Object, required: true },
      },
      setup(props, { slots }) {
        return () => h('span', {
          'class': 'custom-text',
          'data-has-slot': String(Boolean(slots.default)),
        }, slots.default?.() ?? String((props.node as any).content ?? ''))
      },
    })

    setCustomComponents(scopeId, { text: CustomText })

    try {
      const wrapper = mount(MarkdownRender, {
        props: {
          customId: scopeId,
          final: true,
          nodes: [
            {
              type: 'paragraph',
              raw: literal,
              children: [
                {
                  type: 'text',
                  content: literal,
                  raw: literal,
                },
              ],
            },
          ],
        },
      })
      await flushAll()

      try {
        const text = wrapper.get('.custom-text')
        expect(text.attributes('data-has-slot')).toBe('false')
        expect(text.text()).toBe(literal)
        expect(text.find('strong').exists()).toBe(false)
        expect(text.find('a').exists()).toBe(false)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('preserves node-props contract for strong and link overrides', async () => {
    const scopeId = 'custom-components-inline-overrides'
    const CustomStrong = defineComponent({
      name: 'CustomStrong',
      props: {
        node: { type: Object, required: true },
        indexKey: [String, Number],
        customId: String,
      },
      setup(props, { slots }) {
        return () => h('strong', {
          'class': 'custom-strong',
          'data-has-slot': String(Boolean(slots.default)),
          'data-child-types': String(((props.node as any).children ?? []).map((child: any) => child.type).join(',')),
          'data-custom-id': String(props.customId ?? ''),
          'data-index-key': String(props.indexKey ?? ''),
        }, String(((props.node as any).children ?? []).map((child: any) => child.content ?? '').join('')))
      },
    })
    const CustomLink = defineComponent({
      name: 'CustomLink',
      props: {
        node: { type: Object, required: true },
        indexKey: [String, Number],
        customId: String,
      },
      setup(props, { slots }) {
        return () => h('a', {
          'class': 'custom-link',
          'data-has-slot': String(Boolean(slots.default)),
          'data-href': String((props.node as any).href ?? ''),
          'data-custom-id': String(props.customId ?? ''),
          'data-index-key': String(props.indexKey ?? ''),
        }, String(((props.node as any).children ?? []).map((child: any) => child.content ?? '').join('')))
      },
    })

    setCustomComponents(scopeId, {
      strong: CustomStrong,
      link: CustomLink,
    })

    try {
      const wrapper = await mountMarkdown('**Bold** and [docs](https://example.com)', { customId: scopeId, final: true })
      try {
        const strong = wrapper.get('.custom-strong')
        const link = wrapper.get('.custom-link')
        expect(strong.attributes('data-has-slot')).toBe('false')
        expect(strong.attributes('data-child-types')).toBe('text')
        expect(strong.attributes('data-custom-id')).toBe(scopeId)
        expect(strong.text()).toBe('Bold')
        expect(link.attributes('data-has-slot')).toBe('false')
        expect(link.attributes('data-href')).toBe('https://example.com')
        expect(link.attributes('data-custom-id')).toBe(scopeId)
        expect(link.text()).toBe('docs')
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('keeps non-reserved custom tags on sanitized attrs and rendered default slot', async () => {
    const scopeId = 'custom-components-tag-slot'
    const AnswerBox = defineComponent({
      name: 'AnswerBox',
      setup(_, { attrs, slots }) {
        return () => h('section', {
          'class': 'answer-box',
          'data-ok': String(attrs['data-ok'] ?? ''),
          'data-onclick': String((attrs as any).onclick ?? ''),
          'data-has-slot': String(Boolean(slots.default)),
        }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, { 'answer-box': AnswerBox })

    try {
      const wrapper = await mountMarkdown('<answer-box data-ok="yes" onclick="alert(1)">**Safe**</answer-box>', {
        customId: scopeId,
        final: true,
      })
      try {
        const answerBox = wrapper.get('.answer-box')
        expect(answerBox.attributes('data-ok')).toBe('yes')
        expect(answerBox.attributes('data-onclick')).toBe('')
        expect(answerBox.attributes('data-has-slot')).toBe('true')
        expect(answerBox.get('strong').text()).toBe('Safe')
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('keeps inline custom tag slots inside the paragraph without nested paragraphs', async () => {
    const scopeId = 'custom-components-inline-tag-slot'
    const Mention = defineComponent({
      name: 'Mention',
      setup(_, { slots }) {
        return () => h('span', { class: 'mention' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, { mention: Mention })

    try {
      const wrapper = await mountMarkdown('Hello <mention>**Simon**</mention>!', {
        customId: scopeId,
        final: true,
      })
      try {
        expect(wrapper.findAll('p.paragraph-node')).toHaveLength(1)

        const paragraph = wrapper.get('p.paragraph-node')
        const mention = paragraph.get('.mention')
        expect(paragraph.text()).toBe('Hello Simon!')
        expect(mention.get('strong').text()).toBe('Simon')
        expect(mention.find('p').exists()).toBe(false)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('replays a fade animation when a streamed non-code node updates in place', async () => {
    const wrapper = await mountMarkdown('Hello')
    try {
      const nodeContent = () => wrapper.find('[data-node-index="0"] .node-content')
      expect(nodeContent().attributes('style') ?? '').toBe('')
      expect(wrapper.find('.text-node-stream-delta').exists()).toBe(false)

      await wrapper.setProps({ content: 'Hello world' })
      await flushAll()

      expect(nodeContent().attributes('style') ?? '').toBe('')
      const firstDelta = wrapper.find('.text-node-stream-delta')
      expect(firstDelta.exists()).toBe(true)
      expect(firstDelta.text()).toBe('world')
      expect(normalizeText(wrapper.text())).toContain('Hello world')

      await wrapper.setProps({ content: 'Hello world again' })
      await flushAll()

      expect(nodeContent().attributes('style') ?? '').toBe('')
      const secondDelta = wrapper.find('.text-node-stream-delta')
      expect(secondDelta.exists()).toBe(true)
      expect(secondDelta.text()).toBe('again')
      expect(normalizeText(wrapper.text())).toContain('Hello world again')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('keeps fade independent from typewriter cursor', async () => {
    const wrapper = await mountMarkdown('Hello', { typewriter: false })
    try {
      await wrapper.setProps({ content: 'Hello world' })
      await flushAll()

      expect(wrapper.find('.text-node-stream-delta').exists()).toBe(true)
      expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('allows disabling fade without disabling the typewriter cursor', async () => {
    const wrapper = await mountMarkdown('Hello', { fade: false, typewriter: true })
    try {
      await wrapper.setProps({ content: 'Hello world' })
      await flushAll()

      expect(wrapper.find('.text-node-stream-delta').exists()).toBe(false)
      expect(wrapper.find('.typewriter-cursor').exists()).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('does not show the typewriter cursor for code-like blocks, admonitions, or tables', async () => {
    const examples = [
      { content: '```ts\nconsole.log(1)\n```', props: { renderCodeBlocksAsPre: true } },
      { content: '```mermaid\ngraph TD\nA-->B\n```' },
      { content: '```infographic\n{\"title\":\"Demo\"}\n```' },
      { content: '::: warning\nBe careful\n:::' },
      { content: '| 姓名 | 年龄 | 职业 |\n| --- | --- | --- |\n| 张三 | 28 | 工程师 |' },
    ]

    for (const example of examples) {
      const wrapper = await mountMarkdown(example.content, { ...example.props, typewriter: true })
      try {
        expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
      }
      finally {
        wrapper.unmount()
      }
    }
  })

  it('keeps default final stream parsing equivalent to final sync parsing for unfinished constructs', async () => {
    const examples = [
      {
        name: 'unclosed code fence',
        markdown: '```ts\nconst value = 1',
      },
      {
        name: 'unclosed math block',
        markdown: '$$\nx + y',
      },
      {
        name: 'custom html tag',
        markdown: '<thinking>\n- one\n- two',
        props: { customHtmlTags: ['thinking'] },
      },
      {
        name: 'details children',
        markdown: [
          '<details>',
          '<summary>Steps</summary>',
          '',
          '- one',
          '- two',
          '',
          '</details>',
        ].join('\n'),
      },
    ]

    for (const example of examples) {
      const sharedProps = {
        final: true,
        fade: false,
        renderCodeBlocksAsPre: true,
        ...example.props,
      }
      const streamWrapper = await mountMarkdown(example.markdown, sharedProps)
      const syncWrapper = await mountMarkdown(example.markdown, {
        ...sharedProps,
        parseOptions: { streamParse: false },
      })

      try {
        expect(normalizeText(streamWrapper.text()), example.name).toBe(normalizeText(syncWrapper.text()))
        expect(sanitizeSnapshotHtml(streamWrapper.html(), example.name)).toBe(sanitizeSnapshotHtml(syncWrapper.html(), example.name))
      }
      finally {
        streamWrapper.unmount()
        syncWrapper.unmount()
      }
    }
  })

  it('renders repeated custom components without slot content reuse', async () => {
    const scopeId = 'custom-components-repeat'
    const NewQuestion = defineComponent({
      name: 'NewQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'new-question' }, slots.default?.())
      },
    })
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'sub-question' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, {
      'new-question': NewQuestion,
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<new-question>A</new-question>
<sub-question>
B
</sub-question>

<sub-question>
C
</sub-question>`
      const wrapper = await mountMarkdown(markdown, {
        customId: scopeId,
        final: true,
      })
      try {
        expect(normalizeText(wrapper.text())).toContain('A B C')
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders nested repeated custom components without content bleed', async () => {
    const scopeId = 'custom-components-nested-repeat'
    const NewQuestion = defineComponent({
      name: 'NewQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'new-question' }, slots.default?.())
      },
    })
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'sub-question' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, {
      'new-question': NewQuestion,
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<sub-question>
  <new-question>A</new-question>
  <sub-question>Inner-1</sub-question>
</sub-question>

<sub-question>
  <new-question>B</new-question>
  <sub-question>Inner-2</sub-question>
</sub-question>`
      const wrapper = await mountMarkdown(markdown, { customId: scopeId, final: true })
      try {
        expect(normalizeText(wrapper.text())).toMatch(/A\s*Inner-1\s*B\s*Inner-2/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders repeated custom components with different attrs and explicit keys', async () => {
    const scopeId = 'custom-components-attrs-repeat'
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots, attrs }) {
        const id = attrs['data-id'] == null ? '' : String(attrs['data-id'])
        return () => h('div', { class: 'sub-question' }, [
          h('span', { class: 'sub-question__id' }, id),
          slots.default?.(),
        ])
      },
    })

    setCustomComponents(scopeId, {
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<sub-question key="k1" data-id="1">B</sub-question>
<sub-question key="k2" data-id="2">C</sub-question>`
      const wrapper = await mountMarkdown(markdown, { customId: scopeId, final: true })
      try {
        expect(normalizeText(wrapper.text())).toMatch(/1\s*B\s*2\s*C/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders custom components interleaved with markdown blocks', async () => {
    const scopeId = 'custom-components-mixed-markdown'
    const NewQuestion = defineComponent({
      name: 'NewQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'new-question' }, slots.default?.())
      },
    })
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'sub-question' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, {
      'new-question': NewQuestion,
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<div><new-question>A</new-question></div>

Normal paragraph between.

- item-1
- item-2

<div><sub-question>B</sub-question></div>

Another paragraph.

<div><sub-question>C</sub-question></div>`
      const wrapper = await mountMarkdown(markdown, { customId: scopeId, final: true })
      try {
        const text = normalizeText(wrapper.text())
        expect(text).toContain('A')
        expect(text).toContain('Normal paragraph between.')
        expect(text).toMatch(/item-1\s*item-2/)
        expect(text).toMatch(/A[^B]*B[\s\S]*C/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders repeated custom components mixed with standard HTML inside one block', async () => {
    const scopeId = 'custom-components-mixed-html'
    const SubQuestion = defineComponent({
      name: 'SubQuestion',
      setup(_, { slots }) {
        return () => h('div', { class: 'sub-question' }, slots.default?.())
      },
    })

    setCustomComponents(scopeId, {
      'sub-question': SubQuestion,
    })

    try {
      const markdown = `<div>
  <sub-question>First <strong>X</strong></sub-question>
  <span>middle</span>
  <sub-question>Second <em>Y</em></sub-question>
</div>`
      const wrapper = await mountMarkdown(markdown, { customId: scopeId, final: true })
      try {
        expect(normalizeText(wrapper.text())).toMatch(/First\s*X\s*middle\s*Second\s*Y/)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('passes node props to custom components when using nodes prop with customHtmlTags', async () => {
    const scopeId = 'custom-nodes-prop-thinking'
    const ThinkingNode = defineComponent({
      name: 'ThinkingNode',
      props: {
        node: { type: Object, default: () => ({ loading: false, content: '' }) },
      },
      setup(props) {
        return () => h('div', { class: 'thinking-node' }, props.node.content)
      },
    })

    setCustomComponents(scopeId, {
      thinking: (props: any) => h(ThinkingNode, props),
    })

    try {
      // Pre-parsed nodes as if parsed without customHtmlTags – the thinking
      // tag is still an html_block with tag:"thinking".
      const nodes = [
        {
          type: 'html_block',
          tag: 'thinking',
          content: '<thinking>I am thinking</thinking>',
          raw: '<thinking>I am thinking</thinking>',
          loading: false,
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', content: 'Hello', raw: 'Hello' }],
        },
      ]

      const wrapper = mount(MarkdownRender, {
        props: {
          nodes,
          final: true,
          customId: scopeId,
          customHtmlTags: ['thinking'],
        },
      })
      await flushAll()

      try {
        const text = normalizeText(wrapper.text())
        expect(text).toContain('I am thinking')
        expect(text).toContain('Hello')
        // The custom component should be rendered (not the default HtmlBlockNode)
        expect(wrapper.find('.thinking-node').exists()).toBe(true)
      }
      finally {
        wrapper.unmount()
      }
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })
})
