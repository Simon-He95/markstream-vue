import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import MarkdownCodeBlockNode from '../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue'
import { setLanguageIconResolver, VueRendererMarkdown } from '../src/exports'

function makeNode(language: string) {
  return {
    type: 'code_block' as const,
    language,
    code: 'console.log(1)',
    raw: `\`\`\`${language}\nconsole.log(1)\n\`\`\``,
  }
}

describe('app-scoped language icons', () => {
  afterEach(() => {
    setLanguageIconResolver(null)
    vi.restoreAllMocks()
  })

  it('uses app-scoped language icon resolvers without mutating global resolver state', () => {
    const globalResolver = vi.fn(() => '<svg data-icon="global"></svg>')
    setLanguageIconResolver(globalResolver)

    const first = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('js'),
      },
      global: {
        plugins: [[VueRendererMarkdown, {
          languageIconResolver: () => '<svg data-icon="first"></svg>',
        }]],
      },
    })

    const second = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('js'),
      },
      global: {
        plugins: [[VueRendererMarkdown, {
          languageIconResolver: () => '<svg data-icon="second"></svg>',
        }]],
      },
    })

    expect(first.get('.icon-slot').html()).toContain('data-icon="first"')
    expect(second.get('.icon-slot').html()).toContain('data-icon="second"')
    expect(first.get('.icon-slot').html()).not.toContain('data-icon="second"')
    expect(second.get('.icon-slot').html()).not.toContain('data-icon="first"')
    expect(globalResolver).not.toHaveBeenCalled()

    first.unmount()
    second.unmount()
  })

  it('uses app-scoped language icon resolver in CodeBlockNode', () => {
    const wrapper = mount(CodeBlockNode, {
      props: {
        loading: false,
        node: makeNode('ts'),
        stream: false,
      },
      global: {
        plugins: [[VueRendererMarkdown, {
          languageIconResolver: () => '<svg data-icon="code-block"></svg>',
        }]],
      },
    })

    expect(wrapper.get('.icon-slot').html()).toContain('data-icon="code-block"')

    wrapper.unmount()
  })
})
