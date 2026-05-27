/**
 * @vitest-environment jsdom
 */

import React, { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { NodeRenderer as ServerNodeRenderer } from '../packages/markstream-react/src/server'

const markdown = `[![NPM version](https://img.shields.io/npm/v/markstream-vue?color=a1b858&label=)](https://www.npmjs.com/package/markstream-vue)
[![中文版](https://img.shields.io/badge/docs-中文文档-blue)](README.zh-CN.md)`

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react paragraph media-only links', () => {
  it('keeps image links inline without inserting text spans between them on the client', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: markdown,
          typewriter: false,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    const paragraph = host.querySelector('p.paragraph-node') as HTMLParagraphElement | null
    expect(paragraph).not.toBeNull()
    expect(Array.from(paragraph!.children).map(child => child.tagName)).toEqual(['A', 'A'])
    expect(paragraph!.querySelectorAll('.text-node')).toHaveLength(0)

    const links = paragraph!.querySelectorAll('a.link-node')
    expect(links).toHaveLength(2)
    expect(links[0]?.querySelector('img')).not.toBeNull()
    expect(links[1]?.querySelector('img')).not.toBeNull()
    expect(links[1]?.getAttribute('href')).toBe('README.zh-CN.md')

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps image links inline without inserting text spans during SSR', () => {
    const html = renderToStaticMarkup(
      React.createElement(ServerNodeRenderer as any, {
        content: markdown,
        typewriter: false,
      }),
    )

    expect(html).toContain('<p')
    expect(html).toContain('href="README.zh-CN.md"')
    expect(html).toContain('<a')
    expect(html).toContain('<img')
    expect(html).not.toContain('class="text-node')
    expect(html).toContain('</a> <a')
  })
})
