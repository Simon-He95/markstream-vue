/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushAll } from '../../../test/setup/flush-all'
import HtmlBlockNode from '../../components/HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../../components/HtmlInlineNode/HtmlInlineNode.vue'
import MarkdownRender from '../../components/NodeRenderer'
import { setCustomComponents } from '../../utils/nodeComponents'

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

describe('htmlBlockNode - Custom Components Integration', () => {
  const testId = 'test-html-block'

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

    await nextTick()
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

  it('should block active HTML tags by default', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div>Safe</div><iframe src="https://example.com"></iframe><form><button>Submit</button></form>',
          loading: false,
        },
        customId: testId,
      },
    })

    await nextTick()

    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toBe('Safe')
  })

  it('should allow broader HTML tags with trusted policy', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<iframe src="https://example.com"></iframe><div>Safe</div>',
          loading: false,
        },
        customId: testId,
        htmlPolicy: 'trusted',
      },
    })

    await nextTick()

    expect(wrapper.find('iframe').exists()).toBe(true)
    expect(wrapper.text()).toContain('Safe')
  })

  it('should render custom-looking HTML as text with escape policy', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<testcomp data-type="safe">Content</testcomp>',
          loading: false,
        },
        customId: testId,
        htmlPolicy: 'escape',
      },
    })

    await nextTick()

    expect(wrapper.find('.test-component').exists()).toBe(false)
    expect(wrapper.text()).toContain('<testcomp data-type="safe">Content</testcomp>')
  })

  it('should inherit htmlPolicy through nested NodeRenderer instances', async () => {
    const wrapper = mount(MarkdownRender, {
      props: {
        htmlPolicy: 'trusted',
        batchRendering: false,
        deferNodesUntilVisible: false,
        nodes: [
          {
            type: 'blockquote',
            raw: '',
            children: [
              {
                type: 'html_block',
                content: '<iframe src="https://example.com"></iframe>',
                raw: '<iframe src="https://example.com"></iframe>',
                loading: false,
              },
            ],
          },
        ] as any,
      },
    })

    await flushAll()
    await nextTick()

    expect(wrapper.find('blockquote iframe').exists()).toBe(true)
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

  it('should handle the playground test scenario', () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: `
            <testcomp data-type="block-level" style="display: block;">
              <nestedcomp>
                This is nested
              </nestedcomp>
            </testcomp>
          `,
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.find('.test-component').exists()).toBe(true)
    expect(wrapper.find('.nested-component').exists()).toBe(true)
    expect(wrapper.html()).toContain('This is nested')
  })

  it('should render placeholder when loading is true and not deferred', async () => {
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
})

describe('htmlInlineNode - Custom Components Integration', () => {
  const testId = 'test-html-inline'

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

  it('should use DOM rendering for pure HTML', async () => {
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

    await nextTick()
    expect(wrapper.find('.html-inline-node').exists()).toBe(true)
    expect(wrapper.find('.standard').exists()).toBe(true)
    expect(wrapper.find('.standard').text()).toBe('Pure HTML')
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

    await nextTick()
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
})

describe('component Behavior', () => {
  const testId = 'test-behavior'

  beforeEach(() => {
    setCustomComponents(testId, {
      testcomp: TestComponent,
    })
  })

  it('should update when content changes', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          content: '<div>Old</div>',
          loading: false,
        },
        customId: testId,
      },
    })

    expect(wrapper.html()).toContain('Old')

    await wrapper.setProps({
      node: {
        content: '<testcomp data-type="new">New</testcomp>',
        loading: false,
      },
    })

    await nextTick()
    expect(wrapper.html()).toContain('New')
  })

  it('should react to custom component registration after mount (inline)', async () => {
    const dynamicId = 'test-dynamic-registration-inline'

    const wrapper = mount(HtmlInlineNode, {
      props: {
        node: {
          type: 'html_inline',
          content: '<testcomp data-type="dynamic">Content</testcomp>',
          loading: false,
        },
        customId: dynamicId,
      },
    })

    await nextTick()
    expect(wrapper.find('.test-component').exists()).toBe(false)

    setCustomComponents(dynamicId, { testcomp: TestComponent })
    await nextTick()
    expect(wrapper.find('.test-component').exists()).toBe(true)
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

  it('renders markdown children inside structured html blocks without duplicating leaked nodes', async () => {
    const markdown = `<span style="font-size: 12px;">

🗺️【环境状态】
- 地点：石溪村，李东的茅屋
- 时间：4/12 周四 上午07:00

🎯【选项】
1. 去田里劳作，争取多收成些粮食卖钱
2. 上山检查之前设置的陷阱，看有没有捕到猎
</span>`

    const wrapper = mount(MarkdownRender, {
      props: {
        content: markdown,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()
    await nextTick()

    const htmlBlock = wrapper.find('.html-block-node')
    expect(htmlBlock.exists()).toBe(true)
    expect(htmlBlock.element.tagName).toBe('SPAN')
    expect(htmlBlock.attributes('style')).toBeUndefined()
    expect(wrapper.findAll('ul')).toHaveLength(1)
    expect(wrapper.findAll('ol')).toHaveLength(1)

    const text = wrapper.text()
    expect(text.match(/地点：石溪村，李东的茅屋/g)?.length ?? 0).toBe(1)
    expect(text.match(/去田里劳作，争取多收成些粮食卖钱/g)?.length ?? 0).toBe(1)
  })

  it('sanitizes dangerous attrs on structured html wrapper roots', async () => {
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
              raw: 'safe child',
              children: [{ type: 'text', raw: 'safe child', content: 'safe child' }],
            },
          ],
          loading: false,
        },
        customId: testId,
      },
    })

    await flushAll()
    await nextTick()

    const root = wrapper.find('.html-block-node')
    expect(root.element.tagName).toBe('A')
    expect(root.attributes('data-safe')).toBe('ok')
    expect(root.attributes('href')).toBeUndefined()
    expect(root.attributes('onclick')).toBeUndefined()
    expect(wrapper.text()).toContain('safe child')
  })

  it('does not treat blocked html tags as structured wrapper nodes', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          tag: 'script',
          content: `<script>

- alpha

</script>`,
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
              ],
            },
          ],
          loading: false,
        },
        customId: testId,
      },
    })

    await nextTick()
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('does not treat literal-content html tags as structured wrapper nodes', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          tag: 'pre',
          content: `<pre>

- alpha

</pre>`,
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
              ],
            },
          ],
          loading: false,
        },
        customId: testId,
      },
    })

    await nextTick()
    expect(wrapper.findAll('ul')).toHaveLength(0)
    expect(wrapper.findAll('li')).toHaveLength(0)
    expect(wrapper.html()).toContain('<pre>')
    expect(wrapper.text()).toContain('- alpha')
  })

  it('renders details summary as the first direct child for issue #397 content', async () => {
    const markdown = `# Structural Stress

> 这个样例用于检查复杂结构在 streaming 中是否抖动、错位或丢节点。

## 列表

1. 第一层
   - 第二层
     - 第三层
2. 继续

## 表格

| Framework | Route | Purpose |
| --- | --- | --- |
| Vue 3 | \`/test\` | 主调试台 |
| Vue 2 | \`/test\` | 兼容回归 |
| React | \`/test\` | 跨框架对照 |
| Angular | \`/test\` | baseline 对照 |

## HTML

<details>
  <summary>展开看一段 HTML</summary>
  <p>如果这里的结构错了，通常说明 HTML block / inline 的边界处理有问题。</p>
</details>

## 长段落

Markstream 现在不仅要处理单次完整渲染，还要处理 AI 场景下不断追加的 markdown 内容，所以这个页面更像一个回归驾驶舱。你可以一边编辑左侧输入，一边切换 Vue 2、React 或 Angular 的 test page，用同一段内容观察差异，判断问题是解析层、组件层，还是框架适配层。`

    const wrapper = mount(MarkdownRender, {
      props: {
        content: markdown,
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
        typewriter: false,
      },
      global: {
        stubs: {
          transition: false,
        },
      },
    })

    await flushAll()

    const details = wrapper.find('details.html-block-node')
    expect(details.exists()).toBe(true)
    expect(details.element.firstElementChild?.tagName).toBe('SUMMARY')
    expect(details.find('summary').text()).toBe('展开看一段 HTML')
    expect(details.find('summary > p.paragraph-node').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('<summary>')
    expect(wrapper.text()).not.toContain('</details>')
  })

  it('keeps nested details summaries as the first direct child of each details node', async () => {
    const wrapper = mount(HtmlBlockNode, {
      props: {
        node: {
          tag: 'details',
          content: '<details open><summary>outer</summary><p>outer body</p><details open><summary>inner</summary><p>inner body</p></details></details>',
          attrs: [['open', '']],
          children: [
            {
              type: 'html_block',
              tag: 'summary',
              content: '<summary>outer</summary>',
              children: [
                {
                  type: 'text',
                  raw: 'outer',
                  content: 'outer',
                },
              ],
            },
            {
              type: 'paragraph',
              raw: 'outer body',
              children: [{ type: 'text', raw: 'outer body', content: 'outer body' }],
            },
            {
              type: 'html_block',
              tag: 'details',
              content: '<details open><summary>inner</summary><p>inner body</p></details>',
              attrs: [['open', '']],
              children: [
                {
                  type: 'html_block',
                  tag: 'summary',
                  content: '<summary>inner</summary>',
                  children: [
                    {
                      type: 'text',
                      raw: 'inner',
                      content: 'inner',
                    },
                  ],
                },
                {
                  type: 'paragraph',
                  raw: 'inner body',
                  children: [{ type: 'text', raw: 'inner body', content: 'inner body' }],
                },
              ],
            },
          ],
          loading: false,
        },
      },
      global: {
        stubs: {
          transition: false,
        },
      },
    })

    await flushAll()

    const detailsNodes = wrapper.findAll('details.html-block-node')
    expect(detailsNodes).toHaveLength(2)
    expect(detailsNodes[0].element.firstElementChild?.tagName).toBe('SUMMARY')
    expect(detailsNodes[1].element.firstElementChild?.tagName).toBe('SUMMARY')
    expect(detailsNodes[0].find('summary > p.paragraph-node').exists()).toBe(false)
    expect(detailsNodes[1].find('summary > p.paragraph-node').exists()).toBe(false)
    expect(detailsNodes[0].find('summary').text()).toBe('outer')
    expect(detailsNodes[1].find('summary').text()).toBe('inner')
  })
})
