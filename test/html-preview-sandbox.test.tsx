import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReactHtmlPreviewFrame from '../packages/markstream-react/src/components/CodeBlockNode/HtmlPreviewFrame'
import CodeBlockNode from '../src/components/CodeBlockNode/CodeBlockNode.vue'
import CodeBlockShell from '../src/components/CodeBlockNode/CodeBlockShell.vue'
import VueHtmlPreviewFrame from '../src/components/CodeBlockNode/HtmlPreviewFrame.vue'
import MarkdownRender from '../src/components/NodeRenderer'
import { flushAll } from './setup/flush-all'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('html preview sandbox defaults', () => {
  it('keeps Vue 3 previews script-disabled by default and opt-in for scripts only', async () => {
    const wrapper = mount(VueHtmlPreviewFrame, {
      attachTo: document.body,
      props: { code: '<p>Preview</p>' },
    })

    const getIframe = () => document.body.querySelector('iframe')

    expect(getIframe()).not.toBeNull()
    expect(getIframe()?.getAttribute('sandbox')).toBe('')
    expect(getIframe()?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(getIframe()?.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(getIframe()?.getAttribute('sandbox')).not.toContain('allow-same-origin')

    await wrapper.setProps({ htmlPreviewAllowScripts: true })
    expect(getIframe()?.getAttribute('sandbox')).toBe('allow-scripts')

    await wrapper.setProps({ htmlPreviewSandbox: 'allow-popups' })
    expect(getIframe()?.getAttribute('sandbox')).toBe('allow-popups')

    await wrapper.setProps({ htmlPreviewSandbox: null as any })
    expect(getIframe()?.getAttribute('sandbox')).toBe('')

    wrapper.unmount()
  })

  it('keeps Vue 2 previews script-disabled by default and opt-in for scripts only', () => {
    const componentSource = source('packages/markstream-vue2/src/components/CodeBlockNode/HtmlPreviewFrame.vue')
    expect(componentSource).toContain(':sandbox="sandboxValue"')
    expect(componentSource).toContain('referrerpolicy="no-referrer"')
    expect(componentSource).toContain('typeof htmlPreviewSandbox === \'string\'')
    expect(componentSource).toContain('if (htmlPreviewSandbox !== undefined)')
    expect(componentSource).toContain('return htmlPreviewAllowScripts === true ? \'allow-scripts\' : \'\'')
    expect(componentSource).toContain('allow-scripts and allow-same-origin')
    expect(componentSource).not.toContain('allow-scripts allow-same-origin')
  })

  it('keeps React previews script-disabled by default and opt-in for scripts only', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, { code: '<p>Preview</p>' }))
    })
    await flushReact()

    const getIframe = () => document.body.querySelector('iframe')

    expect(getIframe()).not.toBeNull()
    expect(getIframe()?.getAttribute('sandbox')).toBe('')
    expect(getIframe()?.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(getIframe()?.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(getIframe()?.getAttribute('sandbox')).not.toContain('allow-same-origin')

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, {
        code: '<p>Preview</p>',
        htmlPreviewAllowScripts: true,
      }))
    })
    await flushReact()
    expect(getIframe()?.getAttribute('sandbox')).toBe('allow-scripts')

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, {
        code: '<p>Preview</p>',
        htmlPreviewSandbox: 'allow-popups',
      }))
    })
    await flushReact()
    expect(getIframe()?.getAttribute('sandbox')).toBe('allow-popups')

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, {
        code: '<p>Preview</p>',
        htmlPreviewSandbox: null as any,
      }))
    })
    await flushReact()
    expect(getIframe()?.getAttribute('sandbox')).toBe('')

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, {
        code: '<p>Preview</p>',
        htmlPreviewSandbox: 0 as any,
      }))
    })
    await flushReact()
    expect(getIframe()?.getAttribute('sandbox')).toBe('')

    await act(async () => {
      root.unmount()
    })
  })

  it('warns in dev when React override combines allow-scripts with allow-same-origin', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, {
        code: '<p>Preview</p>',
        htmlPreviewSandbox: 'allow-same-origin allow-scripts',
      }))
    })
    await flushReact()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('allow-scripts and allow-same-origin'))

    warn.mockRestore()
    await act(async () => {
      root.unmount()
    })
  })

  it('keeps Angular previews script-disabled by default and only enables requested sandbox tokens', () => {
    const componentSource = source('packages/markstream-angular/src/components/CodeBlockNode/HtmlPreviewFrame.component.ts')
    expect(componentSource).toContain('[attr.sandbox]="sandboxValue"')
    expect(componentSource).toContain('referrerpolicy="no-referrer"')
    expect(componentSource).toContain('@Input() htmlPreviewAllowScripts = false')
    expect(componentSource).toContain('@Input() htmlPreviewSandbox?: string')
    expect(componentSource).toContain('typeof htmlPreviewSandbox === \'string\'')
    expect(componentSource).toContain('if (htmlPreviewSandbox !== undefined)')
    expect(componentSource).toContain('return htmlPreviewAllowScripts === true ? \'allow-scripts\' : \'\'')
    expect(componentSource).toContain('allow-scripts and allow-same-origin')
    expect(componentSource).not.toContain('allow-scripts allow-same-origin')
  })

  it('forwards sandbox props through CodeBlockNode to the inline HTML preview', async () => {
    const wrapper = mount(CodeBlockNode, {
      attachTo: document.body,
      props: {
        node: {
          type: 'code_block',
          language: 'html',
          code: '<p>Preview</p>',
          raw: '```html\n<p>Preview</p>\n```',
        },
        loading: false,
        htmlPreviewAllowScripts: true,
      },
    })

    wrapper.getComponent(CodeBlockShell).vm.$emit('preview')
    await flushAll()

    expect(document.body.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts')
    wrapper.unmount()
  })

  it('forwards MarkdownRender codeBlockProps to the inline HTML preview', async () => {
    const wrapper = mount(MarkdownRender, {
      attachTo: document.body,
      props: {
        content: '```html\n<p>Preview</p>\n```',
        final: true,
        codeBlockProps: {
          htmlPreviewSandbox: null as any,
        },
      },
    })

    await flushAll()
    wrapper.getComponent(CodeBlockShell).vm.$emit('preview')
    await flushAll()

    expect(document.body.querySelector('iframe')?.getAttribute('sandbox')).toBe('')
    wrapper.unmount()
  })
})
