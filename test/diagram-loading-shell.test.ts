import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { D2BlockNodeLoading } from '../src/components/NodeRenderer/D2BlockNodeLoading'
import { InfographicBlockNodeLoading } from '../src/components/NodeRenderer/InfographicBlockNodeLoading'
import { MermaidBlockNodeLoading } from '../src/components/NodeRenderer/MermaidBlockNodeLoading'

function diagramNode(language: string, code: string) {
  return {
    type: 'code_block',
    language,
    code,
    raw: `\`\`\`${language}\n${code}\`\`\``,
  }
}

describe('d2 loading shell', () => {
  it('carries the surface styles its scoped block classes cannot supply', () => {
    // The shell renders from a .ts file, so `.d2-block-container` and `.d2-label`
    // (scoped to D2BlockNode.vue as `[data-v-…]`) never match it. Without the
    // inline tokens the block renders on a transparent background with a 16px
    // label, then visibly changes when the real component takes over.
    const wrapper = mount(D2BlockNodeLoading as any, {
      props: { node: diagramNode('d2', 'a -> b') },
    })

    const containerStyle = wrapper.get('.d2-block-container').attributes('style') || ''
    expect(containerStyle).toContain('var(--diagram-bg)')
    expect(containerStyle).toContain('hsl(var(--ms-foreground))')
    expect(containerStyle).toContain('var(--ms-shadow-subtle)')
    expect(containerStyle).toContain('var(--diagram-border)')

    expect(wrapper.get('.d2-label').attributes('style') || '').toContain('var(--ms-text-label)')
    expect(wrapper.get('.d2-block-header').attributes('style') || '').toContain('var(--diagram-header-bg)')

    wrapper.unmount()
  })

  it('reserves the estimated preview height while the renderer chunk loads', () => {
    const wrapper = mount(D2BlockNodeLoading as any, {
      props: { node: diagramNode('d2', 'a -> b') },
    })

    expect(wrapper.get('.d2-block-body').attributes('style') || '').toContain('min-height: 240px')

    wrapper.unmount()
  })

  it('prefers the height the renderer injected over its own estimate', () => {
    const wrapper = mount(D2BlockNodeLoading as any, {
      props: {
        node: diagramNode('d2', 'a -> b'),
        estimatedPreviewHeightPx: 445,
      },
    })

    expect(wrapper.get('.d2-block-body').attributes('style') || '').toContain('min-height: 445px')

    wrapper.unmount()
  })

  it('reserves the same height the mermaid and infographic shells do', () => {
    const mermaid = mount(MermaidBlockNodeLoading as any, {
      props: { node: diagramNode('mermaid', 'graph LR\nA-->B') },
    })
    const infographic = mount(InfographicBlockNodeLoading as any, {
      props: { node: diagramNode('infographic', '- a\n- b\n- c') },
    })

    expect(mermaid.get('.mermaid-preview-area').attributes('style') || '').toContain('height:')
    expect(infographic.get('.infographic-preview').attributes('style') || '').toContain('height:')

    mermaid.unmount()
    infographic.unmount()
  })
})
