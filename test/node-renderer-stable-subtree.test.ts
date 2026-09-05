import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'

it('does not update settled block transitions when only the streaming tail grows', async () => {
  const updated: string[] = []
  const wrapper = mount(NodeRenderer, {
    props: {
      content: '# Stable heading\n\nStable paragraph.\n\nGrowing tail',
      final: false,
      fade: false,
      smoothStreaming: false,
      batchRendering: false,
      viewportPriority: false,
    },
    global: {
      stubs: { transition: false },
      mixins: [{
        updated() {
          if (this.$options.name === 'BaseTransition')
            updated.push((this.$el as Element).closest('[data-node-index]')?.getAttribute('data-node-index') ?? '')
        },
      }],
    },
  })
  await nextTick()
  const heading = wrapper.get('h1').element
  const paragraph = wrapper.get('p').element
  updated.length = 0

  await wrapper.setProps({ content: '# Stable heading\n\nStable paragraph.\n\nGrowing tail with more text' })
  await nextTick()

  expect(wrapper.get('h1').element).toBe(heading)
  expect(wrapper.get('p').element).toBe(paragraph)
  expect(wrapper.text()).toContain('Growing tail with more text')
  expect(updated).toContain('2')
  expect(updated).not.toContain('0')
  expect(updated).not.toContain('1')
  wrapper.unmount()
})

for (const observed of [false, true]) {
  it(`updates supplied custom-node children, reactive=${observed}`, async () => {
    const id = `mutation-probe-${observed}`
    setCustomComponents(id, {
      'audit-widget': defineComponent({
        setup(_, { slots }) {
          return () => h('aside', slots.default?.())
        },
      }),
    })
    const value = { type: 'audit-widget', raw: '', loading: false, children: [{ type: 'paragraph', raw: 'Before', children: [{ type: 'text', content: 'Before', raw: 'Before' }] }] }
    const node = observed ? reactive(value) : value
    const wrapper = mount(NodeRenderer, { props: { nodes: [node] as any, customId: id, fade: false, batchRendering: false, deferNodesUntilVisible: false, viewportPriority: false } })
    try {
      await nextTick()
      expect(wrapper.text()).toContain('Before')
      node.children = [{ type: 'paragraph', raw: 'After', children: [{ type: 'text', content: 'After', raw: 'After' }] }]
      await wrapper.setProps({ nodes: [node] as any })
      await nextTick()
      expect(wrapper.text()).toContain('After')
    }
    finally {
      wrapper.unmount()
      removeCustomComponents(id)
    }
  })
}

it('refreshes raw custom-node props even when the custom component ignores its slot', async () => {
  const id = 'raw-custom-node-props'
  setCustomComponents(id, {
    'audit-widget': defineComponent({
      props: ['node'],
      setup(props) {
        return () => h('aside', props.node.label)
      },
    }),
  })
  const node = { type: 'audit-widget', raw: '', loading: false, label: 'Before', children: [] }
  const wrapper = mount(NodeRenderer, { props: { nodes: [node] as any, customId: id, fade: false, batchRendering: false, deferNodesUntilVisible: false, viewportPriority: false } })
  try {
    expect(wrapper.text()).toContain('Before')
    node.label = 'After'
    await wrapper.setProps({ nodes: [node] as any })
    expect(wrapper.text()).toContain('After')
  }
  finally {
    wrapper.unmount()
    removeCustomComponents(id)
  }
})
