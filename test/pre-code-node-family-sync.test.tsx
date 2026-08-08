/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PreCodeNode as ReactPreCodeNode } from '../packages/markstream-react/src/components/CodeBlockNode/PreCodeNode'
import Vue2PreCodeNode from '../packages/markstream-vue2/src/components/PreCodeNode'

const markdownListCode = [
  '# 示例文档',
  '',
  '- 无序项 1',
  '- 无序项 2',
  '  - 子项 A',
  '  - 子项 B',
].join('\n')

const jsonOriginalCode = [
  '{',
  '  "type": "module",',
  '  "version": "1.0.1",',
  '  "description": "old",',
  '  "author": "Simon He"',
  '}',
].join('\n')

const jsonUpdatedCode = [
  '{',
  '  "type": "module",',
  '  "version": "1.0.1",',
  '  "description": "new",',
  '  "author": "Simon He"',
  '}',
].join('\n')

describe('pre code node family sync', () => {
  it('keeps vue2 source diff markdown list rows as added rows', () => {
    const wrapper = mount(Vue2PreCodeNode as any, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'md',
          diff: true,
          originalCode: '',
          updatedCode: markdownListCode,
          code: markdownListCode,
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(0)
    expect(wrapper.findAll('.markstream-pre__diff-line--added')).toHaveLength(6)
    expect(wrapper.find('.markstream-pre__diff-line--empty').classes()).toContain('markstream-pre__diff-line--added')

    wrapper.unmount()
  })

  it('keeps react source diff markdown list rows as added rows', () => {
    const html = renderToStaticMarkup(
      <ReactPreCodeNode
        showLineNumbers
        diffInline
        node={{
          type: 'code_block',
          language: 'md',
          diff: true,
          originalCode: '',
          updatedCode: markdownListCode,
          code: markdownListCode,
          raw: '',
        } as any}
      />,
    )

    expect(html).not.toContain('markstream-pre__diff-line--removed')
    expect((html.match(/markstream-pre__diff-line--added/g) ?? [])).toHaveLength(6)
    expect(html).toContain('markstream-pre__diff-line--added markstream-pre__diff-line--empty')
  })

  it('does not show modified line numbers for family inline removed rows', () => {
    const vueWrapper = mount(Vue2PreCodeNode as any, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'json',
          diff: true,
          originalCode: jsonOriginalCode,
          updatedCode: jsonUpdatedCode,
          code: '',
          raw: '',
        },
      },
    })
    expect(vueWrapper.get('.markstream-pre__diff-line--removed .markstream-pre__diff-number').text()).toBe('')
    expect(vueWrapper.get('.markstream-pre__diff-line--added .markstream-pre__diff-number').text()).toBe('4')
    vueWrapper.unmount()

    const reactHtml = renderToStaticMarkup(
      <ReactPreCodeNode
        showLineNumbers
        diffInline
        node={{
          type: 'code_block',
          language: 'json',
          diff: true,
          originalCode: jsonOriginalCode,
          updatedCode: jsonUpdatedCode,
          code: '',
          raw: '',
        } as any}
      />,
    )
    expect(reactHtml).toContain('<span class="markstream-pre__diff-number" aria-hidden="true"></span>')
    expect(reactHtml).toContain('<span class="markstream-pre__diff-number" aria-hidden="true">4</span>')
  })

  it('keeps vue2 and react diff fallback css aligned with vue3 selectors', () => {
    const vue2Source = readFileSync('packages/markstream-vue2/src/components/PreCodeNode/PreCodeNode.vue', 'utf8')
    const reactCss = readFileSync('packages/markstream-react/src/index.css', 'utf8')

    // Shared `--markstream-*` diff-preview contract across vue2/vue3/react.
    const shared = [
      '--markstream-pre-diff-gutter-marker-width',
      '--markstream-pre-diff-gutter-gap',
      '--markstream-pre-diff-code-gap',
      '--markstream-pre-diff-code-padding',
      '--markstream-diff-added-gutter: linear-gradient(',
      '--markstream-diff-removed-gutter: linear-gradient(',
      '--markstream-pre-diff-line-number-padding-left',
      '--markstream-pre-diff-line-number-padding-right',
      '--markstream-pre-diff-line-number-gap-to-code',
      '--markstream-pre-diff-line-number-border',
      'var(--markstream-diff-gutter-guide, hsl(var(--ms-border, 214 32% 91%) / 0.72))',
      '--markstream-pre-diff-code-fill-left: calc(',
      '--markstream-pre-diff-code-left: calc(',
      '+ var(--markstream-pre-diff-line-number-gap-to-code)',
      'grid-template-columns: minmax(100%, max-content);',
      'min-width: max-content;',
      'padding-left: var(--markstream-pre-diff-code-left);',
      'left: var(--markstream-pre-diff-code-fill-left);',
      'padding-left: var(--markstream-pre-diff-line-number-padding-left, 15.6px);',
      'padding-right: var(--markstream-pre-diff-line-number-padding-right, 7.8px);',
      'box-shadow: inset -1px 0 var(--markstream-pre-diff-line-number-border);',
      'width: var(--markstream-pre-diff-gutter-marker-width, 4px);',
      '.markstream-pre__diff-line--added > .markstream-pre__diff-number',
      '.markstream-pre__diff-line--removed > .markstream-pre__diff-number',
      '--markstream-pre-diff-content-height',
      'background: var(--markstream-diff-added-line-fill',
      'background: var(--markstream-diff-removed-line-fill',
      'color: var(--markstream-diff-added-fg',
      'color: var(--markstream-diff-removed-fg',
      'border-radius: 0;',
    ]

    const forbidden = [
      '--stream-monaco-',
      'markstream-pre--diff-inline .markstream-pre__diff-line::after',
      'left: var(--markstream-pre-diff-scrollable-left);',
      'markstream-pre__diff-line--added:not(.markstream-pre__diff-line--empty)',
      'markstream-pre__diff-line--removed:not(.markstream-pre__diff-line--empty)',
    ]

    for (const source of [vue2Source, reactCss]) {
      for (const marker of shared)
        expect(source).toContain(marker)
      for (const marker of forbidden)
        expect(source).not.toContain(marker)
      expect(source).not.toMatch(/markstream-pre__diff-line--added\s*\{\s*color:/)
      expect(source).not.toMatch(/markstream-pre__diff-line--removed\s*\{\s*color:/)
    }
  })
})
