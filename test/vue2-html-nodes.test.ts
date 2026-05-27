/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
// Import Vue 2 components
import HtmlBlockNode from '../packages/markstream-vue2/src/components/HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../packages/markstream-vue2/src/components/HtmlInlineNode/HtmlInlineNode.vue'
import { setCustomComponents } from '../packages/markstream-vue2/src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

// Mock custom components
const TestComponent = defineComponent({
  name: 'TestComponent',
  props: ['dataType', 'active'],
  setup(props, { slots }) {
    return () => h(
      'div',
      {
        'class': 'test-component',
        'data-type': props.dataType,
        'data-active': props.active,
      },
      slots.default?.() || 'Test Component',
    )
  },
})

const NestedComponent = defineComponent({
  name: 'NestedComponent',
  setup(_, { slots }) {
    return () => h('div', { class: 'nested-component' }, slots.default?.())
  },
})

describe('vue 2 - HtmlBlockNode Custom Components Integration', () => {
  const testId = 'test-vue2-html-block'

  beforeEach(() => {
    setCustomComponents(testId, {
      testcomp: TestComponent,
      nestedcomp: NestedComponent,
    })
  })

  it('should render custom component in HTML block', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp data-type="block">Content</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('.test-component').attributes('data-type')).toBe('block')
    expect(wrapper.html()).toContain('Content')
  })

  it('should render nested custom components', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp data-type="outer">Outer <nestedcomp>Nested</nestedcomp> End</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('.nested-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('Outer')
    expect(wrapper.html()).toContain('Nested')
    expect(wrapper.html()).toContain('End')
  })

  it('should render deeply nested custom components', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: `
            <testcomp data-type="level1">
              Level 1
              <nestedcomp>
                Level 2
                <testcomp data-type="level3">Level 3</testcomp>
              </nestedcomp>
            </testcomp>
          `,
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.findAll('.test-component').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.nested-component').length).toBeGreaterThan(0)
    expect(wrapper.html()).toContain('Level 1')
    expect(wrapper.html()).toContain('Level 2')
    expect(wrapper.html()).toContain('Level 3')
  })

  it('should render mixed standard HTML and custom components', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div class="standard"><testcomp data-type="mixed">Component</testcomp><p>Paragraph</p></div>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.standard').exists()).toBe(true)
    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('p').exists()).toBe(true)
  })

  it('should use v-html when no custom components are present', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div class="standard">Pure HTML</div>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.standard').exists()).toBe(true)
    expect(wrapper.html()).toContain('Pure HTML')
  })

  it('should sanitize raw HTML fallback content in blocks', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div><img src="x" onerror="alert(1)"><a href="javascript:alert(1)" title="ok">Link</a><script>alert(1)</script></div>',
          loading: false,
        },
        customId: testId,
      },
    })

    await flushAll()
    const img = wrapper.find('img')
    const link = wrapper.find('a')

    expect(img.exists()).toBe(true)
    expect(img.attributes('onerror')).toBeUndefined()
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBeUndefined()
    expect(link.attributes('title')).toBe('ok')
    expect(wrapper.html()).not.toContain('<script')
    expect(wrapper.html()).not.toContain('alert(1)')
  })

  it('should block active html tags by default and allow them only with trusted policy', async () => {
    const safeWrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div>Safe</div><iframe src="https://example.com"></iframe><form><input name="q"></form>',
          loading: false,
        },
        customId: testId,
      },
    })

    await flushAll()
    expect(safeWrapper.find('div').exists()).toBe(true)
    expect(safeWrapper.find('iframe').exists()).toBe(false)
    expect(safeWrapper.find('form').exists()).toBe(false)
    expect(safeWrapper.find('input').exists()).toBe(false)

    const trustedWrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<iframe src="https://example.com"></iframe>',
          loading: false,
        },
        customId: testId,
        htmlPolicy: 'trusted',
      },
    })

    await flushAll()
    expect(trustedWrapper.find('iframe').exists()).toBe(true)
  })

  it('should escape html when htmlPolicy is escape', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div>Escaped</div>',
          loading: false,
        },
        customId: testId,
        htmlPolicy: 'escape',
      },
    })

    await flushAll()
    expect(wrapper.html()).toContain('&lt;div&gt;Escaped&lt;/div&gt;')
    expect(wrapper.text()).toContain('<div>Escaped</div>')
  })

  it('should pass props correctly to custom components', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp data-type="test" active="true">With Props</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    const comp = wrapper.find('.test-component')
    expect(comp.attributes('data-type')).toBe('test')
    expect(comp.attributes('data-active')).toBe('true')
  })

  it('should sanitize dangerous attributes', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp onclick="alert(1)" data-type="safe">Content</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    const comp = wrapper.find('.test-component')
    expect(comp.attributes('onclick')).toBeUndefined()
    expect(comp.attributes('data-type')).toBe('safe')
  })

  it('should render placeholder when loading is true', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp>Content</testcomp>',
          loading: true,
        },
        customId: testId,
      },
    })

    // Should show placeholder initially
    expect(wrapper.find('.html-block-node__placeholder').exists()).toBe(true)
  })

  it('should render structured markdown children inside standard html wrappers once', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          tag: 'span',
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
                  children: [
                    {
                      type: 'paragraph',
                      raw: '',
                      children: [{ type: 'text', raw: '', content: 'alpha' }],
                    },
                  ],
                },
                {
                  type: 'list_item',
                  raw: '',
                  children: [
                    {
                      type: 'paragraph',
                      raw: '',
                      children: [{ type: 'text', raw: '', content: 'beta' }],
                    },
                  ],
                },
              ],
            },
          ],
          loading: false,
        },
        customId: testId,
      },
    })

    await flushAll()

    const root = wrapper.find('.html-block-node')
    expect(root.element.tagName).toBe('SPAN')
    expect(root.attributes('style')).toBeUndefined()
    expect(wrapper.findAll('ul')).toHaveLength(1)
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect((wrapper.text().match(/alpha/g) || []).length).toBe(1)
    expect((wrapper.text().match(/beta/g) || []).length).toBe(1)
  })

  it('should sanitize dangerous attrs on structured wrapper roots', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          tag: 'a',
          content: '<a href="javascript:alert(1)" onclick="alert(1)" data-safe="ok"></a>',
          attrs: [
            ['href', 'javascript:alert(1)'],
            ['onclick', 'alert(1)'],
            ['data-safe', 'ok'],
          ],
          children: [
            {
              type: 'paragraph',
              raw: '',
              children: [{ type: 'text', raw: '', content: 'safe child' }],
            },
          ],
          loading: false,
        },
        customId: testId,
      },
    })

    await flushAll()

    const root = wrapper.find('.html-block-node')
    expect(root.element.tagName).toBe('A')
    expect(root.attributes('data-safe')).toBe('ok')
    expect(root.attributes('href')).toBeUndefined()
    expect(root.attributes('onclick')).toBeUndefined()
    expect(wrapper.text()).toContain('safe child')
  })
})

describe('vue 2 - HtmlInlineNode Custom Components Integration', () => {
  const testId = 'test-vue2-html-inline'

  beforeEach(() => {
    setCustomComponents(testId, {
      testcomp: TestComponent,
      nestedcomp: NestedComponent,
    })
  })

  it('should render custom component inline', () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: '<testcomp data-type="inline">Content</testcomp>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('Content')
  })

  it('should render nested custom components inline', () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: 'Text <testcomp data-type="outer"><nestedcomp>Nested</nestedcomp></testcomp> more',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('.nested-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('Text')
    expect(wrapper.html()).toContain('more')
  })

  it('should use DOM rendering for pure HTML', () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: '<span class="standard">Pure HTML</span>',
          loading: false,
        },
        customId: testId,
      },
    })

    // HtmlInlineNode uses DOM manipulation, check that the container exists
    expect(wrapper.find('.html-inline-node').exists()).toBe(true)
  })

  it('should sanitize raw HTML fallback content inline', async () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: 'Before <img src="x" onerror="alert(1)"><a href="javascript:alert(1)" title="ok">Link</a> After',
          loading: false,
        },
        customId: testId,
      },
    })

    await flushAll()
    const img = wrapper.find('img')
    const link = wrapper.find('a')

    expect(img.exists()).toBe(true)
    expect(img.attributes('onerror')).toBeUndefined()
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBeUndefined()
    expect(link.attributes('title')).toBe('ok')
    expect(wrapper.html()).not.toContain('alert(1)')
  })

  it('should handle mixed inline content', () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: 'Before <testcomp data-type="test">Component</testcomp> After',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('Before')
    expect(wrapper.html()).toContain('After')
  })

  it('should handle loading state', () => {
    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: '<testcomp>Loading Content</testcomp>',
          loading: true,
          autoClosed: false,
        },
        customId: testId,
      },
    })

    // Should show loading text
    expect(wrapper.find('.html-inline-node--loading').exists()).toBe(true)
    expect(wrapper.html()).toContain('Loading Content')
  })
})

describe('vue 2 - Component Behavior', () => {
  const testId = 'test-vue2-behavior'

  beforeEach(() => {
    setCustomComponents(testId, {
      testcomp: TestComponent,
    })
  })

  it('should handle empty content', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '',
          loading: false,
        },
        customId: testId,
      },
    })

    // Empty content should render empty container
    expect(wrapper.find('.html-block-node').exists()).toBe(true)
  })

  it('should handle content with only whitespace', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '   \n\t   ',
          loading: false,
        },
        customId: testId,
      },
    })

    // Whitespace-only content should still render container
    expect(wrapper.find('.html-block-node').exists()).toBe(true)
  })
})
