import { mount } from '@vue/test-utils'
import { resolvePreCodeThemePalette } from 'markstream-core'
import { describe, expect, it } from 'vitest'
import PreCodeBlock from '../src/components/PreCodeNode/PreCodeBlock.vue'

const node = {
  type: 'code_block' as const,
  language: 'typescript',
  code: 'const answer = 42',
  raw: '```typescript src/answer.ts\nconst answer = 42\n```',
  loading: false,
}

describe('pre code block shared shell', () => {
  it('derives unified and split diff layouts from codeBlockOptions', async () => {
    const diffNode = {
      type: 'code_block' as const,
      language: 'diff typescript',
      diff: true,
      originalCode: 'const answer = 41',
      updatedCode: 'const answer = 42',
      code: '-const answer = 41\n+const answer = 42',
      raw: '```diff ts:src/answer.ts',
    }
    const wrapper = mount(PreCodeBlock, {
      props: {
        node: diffNode,
        codeBlockOptions: { diffStyle: 'unified' },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(1)
    expect(wrapper.get('.markstream-pre__diff-pane').classes()).toContain('markstream-pre__diff-pane--inline')

    await wrapper.setProps({ codeBlockOptions: { diffStyle: 'split' } })
    expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(2)
  })

  it('uses the shared built-in header and hides it with showHeader=false', async () => {
    const wrapper = mount(PreCodeBlock, {
      props: { node, loading: false },
    })

    expect(wrapper.get('.code-block-container').exists()).toBe(true)
    expect(wrapper.get('.code-block-header').exists()).toBe(true)
    expect(wrapper.get('.code-header-title').text()).toBe('src/answer.ts')
    expect(wrapper.get('.code-header-caption').text()).toBe('TypeScript')
    expect(wrapper.get('.code-action-btn').exists()).toBe(true)

    await wrapper.setProps({ showHeader: false })
    expect(wrapper.find('.code-block-header').exists()).toBe(false)
    expect(wrapper.get('pre.code-pre-fallback').exists()).toBe(true)
  })

  it('applies the resolved theme palette to the shell and pre immediately', async () => {
    const wrapper = mount(PreCodeBlock, {
      props: { node, loading: false, isDark: true },
    })

    const shell = wrapper.get<HTMLElement>('.code-block-container').element
    const pre = wrapper.get<HTMLElement>('pre.code-pre-fallback').element
    expect(shell.style.backgroundColor).toBe('rgb(18, 18, 18)')
    expect(shell.style.getPropertyValue('--markstream-diff-editor-bg')).toBe('#121212')
    expect(pre.style.backgroundColor).toBe('var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg)))')
    expect(pre.style.getPropertyValue('--markstream-code-theme-bg')).toBe('#121212')

    await wrapper.setProps({ isDark: false })
    expect(shell.style.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(pre.style.getPropertyValue('--markstream-code-theme-bg')).toBe('#ffffff')
  })

  it('keeps custom theme tokens external and detects fixed dark themes', () => {
    const dracula = resolvePreCodeThemePalette({
      isDark: false,
      theme: 'dracula',
    })
    const customLight = resolvePreCodeThemePalette({
      isDark: true,
      theme: 'github-light',
    })

    expect(dracula).toMatchObject({
      builtin: false,
      dark: true,
      name: 'dracula',
    })
    expect(dracula.background).toBe('var(--markstream-code-theme-bg, #121212)')
    expect(customLight).toMatchObject({
      builtin: false,
      dark: false,
      name: 'github-light',
    })

    const wrapper = mount(PreCodeBlock, {
      props: { node, loading: false, isDark: false, theme: 'dracula' },
    })
    const shellStyle = wrapper.get<HTMLElement>('.code-block-container').element.style
    expect(shellStyle.getPropertyValue('--markstream-code-theme-bg')).toBe('')
    expect(shellStyle.getPropertyValue('--markstream-code-fallback-bg')).toBe('var(--markstream-code-theme-bg, #121212)')
  })

  it.each([
    ['monokai', false, true],
    ['night-owl', false, true],
    ['github-light', true, false],
    ['catppuccin-latte', true, false],
    ['rose-pine-dawn', true, false],
    ['lotus', true, false],
  ])('detects fixed theme %s independently from isDark', (theme, isDark, dark) => {
    expect(resolvePreCodeThemePalette({ theme, isDark }).dark).toBe(dark)
  })

  it('lets header-left and header-right replace the built-in regions', () => {
    const wrapper = mount(PreCodeBlock, {
      props: { node, loading: false },
      slots: {
        'header-left': '<span data-testid="custom-left">Custom left</span>',
        'header-right': '<button data-testid="custom-right">Run</button>',
      },
    })

    expect(wrapper.get('[data-testid="custom-left"]').text()).toBe('Custom left')
    expect(wrapper.get('[data-testid="custom-right"]').text()).toBe('Run')
    expect(wrapper.find('.code-header-main').exists()).toBe(false)
    expect(wrapper.find('.code-action-btn').exists()).toBe(false)
  })
})
