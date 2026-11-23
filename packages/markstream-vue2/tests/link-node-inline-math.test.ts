import { afterEach, describe, expect, it, vi } from 'vitest'
import Vue from 'vue'
import NodeRenderer from '../src/components/MarkdownRenderCompat.vue'

// In tests the loader returns its text fallback, a plain render function that
// Vue 2 cannot mount, so a minimal component stands in for the math node.
vi.mock('../src/components/NodeRenderer/asyncComponent', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    MathInlineNodeAsync: () => Promise.resolve({
      name: 'MathInlineStub',
      props: { node: { type: Object, required: true } },
      render(this: any, h: any) {
        return h('span', { class: 'math-inline-stub' }, String(this.node.raw ?? ''))
      },
    }),
  }
})

const apps: Vue[] = []
afterEach(() => {
  apps.splice(0).forEach(app => app.$destroy())
  document.body.innerHTML = ''
})

describe('vue2 link text with inline math', () => {
  it('renders the formula inside the link', async () => {
    const app = new Vue({
      render: h => h(NodeRenderer, {
        props: {
          nodes: [
            {
              type: 'paragraph',
              raw: '',
              children: [
                {
                  type: 'link',
                  href: 'https://example.com',
                  title: null,
                  text: 'the $x_1$ term',
                  raw: '[the $x_1$ term](https://example.com)',
                  loading: false,
                  children: [
                    { type: 'text', content: 'the ', raw: 'the ' },
                    { type: 'math_inline', content: 'x_1', raw: '$x_1$', markup: '$', loading: false },
                    { type: 'text', content: ' term', raw: ' term' },
                  ],
                },
              ],
            },
          ],
          final: true,
          batchRendering: false,
          deferNodesUntilVisible: false,
          viewportPriority: false,
        },
      }),
    }).$mount()
    apps.push(app)
    document.body.appendChild(app.$el)

    const link = () => app.$el.querySelector('a[href="https://example.com"]')
    // The math component resolves asynchronously.
    for (let attempt = 0; attempt < 20 && !link()?.querySelector('.math-inline-stub'); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 0))
      await Vue.nextTick()
    }

    expect(link()?.querySelector('.math-inline-stub')?.textContent).toBe('$x_1$')
    expect(link()?.textContent?.replace(/\s+/g, ' ')).toBe('the $x_1$ term')
  })
})
