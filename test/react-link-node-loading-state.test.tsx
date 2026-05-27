/**
 * @vitest-environment jsdom
 */

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { LinkNode } from '../packages/markstream-react/src/components/LinkNode/LinkNode'

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

describe('markstream-react link loading state', () => {
  it('renders a subtle loading hint instead of an anchor', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(LinkNode as any, {
        node: {
          type: 'link',
          href: 'https://example.com',
          title: null,
          text: 'Example',
          raw: '[Example](https://example.com',
          loading: true,
          children: [],
        },
        indexKey: 'react-link-loading',
        ctx: {
          typewriter: false,
          codeBlockProps: {},
          mermaidProps: {},
          d2Props: {},
          infographicProps: {},
          showTooltips: true,
          codeBlockStream: true,
          renderCodeBlocksAsPre: false,
          events: {},
        },
      }))
    })
    await flushReact()

    expect(host.querySelector('a.link-node')).toBeNull()
    const loading = host.querySelector('.link-loading') as HTMLElement | null
    expect(loading).toBeTruthy()
    expect(loading?.textContent).toContain('Example')
    expect(host.querySelector('.link-loading-indicator')).toBeTruthy()
    expect(loading?.getAttribute('style')).toContain('--underline-duration: 1.6s')

    await act(async () => {
      root.unmount()
    })
  })

  it('omits unsafe href values from rendered anchors', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(LinkNode as any, {
        node: {
          type: 'link',
          href: 'javascript:alert(1)',
          title: null,
          text: 'Unsafe',
          raw: '[Unsafe](javascript:alert(1))',
          loading: false,
          children: [],
        },
        indexKey: 'react-unsafe-link',
        ctx: {
          typewriter: false,
          codeBlockProps: {},
          mermaidProps: {},
          d2Props: {},
          infographicProps: {},
          showTooltips: true,
          codeBlockStream: true,
          renderCodeBlocksAsPre: false,
          events: {},
        },
      }))
    })
    await flushReact()

    const link = host.querySelector('a.link-node')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })
})
