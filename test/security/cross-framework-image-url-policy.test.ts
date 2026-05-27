/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { renderMarkdownNodeToHtml as renderAngularNodeToHtml } from '../../packages/markstream-angular/src/renderMarkdownHtml'
import { ImageNode as ReactImageNode } from '../../packages/markstream-react/src/components/ImageNode/ImageNode'
import { ImageNode as ReactServerImageNode } from '../../packages/markstream-react/src/server-renderer'
import { renderMarkdownNodeToHtml as renderSvelteNodeToHtml } from '../../packages/markstream-svelte/src/renderMarkdownHtml'
import { renderMarkdownNodeToHtml as renderVue2NodeToHtml } from '../../packages/markstream-vue2/src/utils/nestedHtml'
import VueImageNode from '../../src/components/ImageNode/ImageNode.vue'

function imageNode(src: string) {
  return {
    type: 'image',
    src,
    alt: 'x',
    title: null,
    raw: `![x](${src})`,
    loading: false,
  } as any
}

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

describe('cross-framework image URL policy', () => {
  it('omits unsafe image URLs in static framework renderers', () => {
    const unsafe = [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'blob:https://example.com/abc',
      '//evil.example/x.png',
      '\\\\evil.example/x.png',
      '\\/evil.example/x.png',
      '/\\evil.example/x.png',
    ]

    for (const src of unsafe) {
      const node = imageNode(src)
      expect(renderVue2NodeToHtml(node)).not.toContain('<img')
      expect(renderSvelteNodeToHtml(node)).not.toContain('<img')
      expect(renderAngularNodeToHtml(node)).not.toContain('<img')
      expect(renderToStaticMarkup(React.createElement(ReactServerImageNode as any, { node }))).not.toContain('<img')
      expect(renderToStaticMarkup(React.createElement(ReactImageNode as any, { node, lazy: false }))).not.toContain('<img')
    }
  })

  it('omits unsafe image URLs in the Vue 3 ImageNode component path', () => {
    const unsafe = [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'blob:https://example.com/abc',
      '//evil.example/x.png',
      '\\\\evil.example/x.png',
      '\\/evil.example/x.png',
      '/\\evil.example/x.png',
    ]

    for (const src of unsafe) {
      const wrapper = mount(VueImageNode as any, {
        props: {
          node: imageNode(src),
          lazy: false,
        },
      })

      expect(wrapper.find('img').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('keeps raster data images in static framework renderers', () => {
    const node = imageNode('data:image/png;base64,iVBORw0KGgo=')

    expect(renderVue2NodeToHtml(node)).toContain('<img')
    expect(renderSvelteNodeToHtml(node)).toContain('<img')
    expect(renderAngularNodeToHtml(node)).toContain('<img')
    expect(renderToStaticMarkup(React.createElement(ReactServerImageNode as any, { node }))).toContain('<img')
    expect(renderToStaticMarkup(React.createElement(ReactImageNode as any, { node, lazy: false }))).toContain('<img')
  })

  it('shows React client error when fallbackSrc equals failed primary src', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const src = 'https://example.com/broken.png'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactImageNode as any, {
        node: imageNode(src),
        fallbackSrc: src,
        lazy: false,
      }))
    })
    await flushReact()

    const image = host.querySelector('img')
    expect(image).not.toBeNull()

    await act(async () => {
      image!.dispatchEvent(new Event('error', { bubbles: true }))
    })
    await flushReact()

    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.image-node__error')).not.toBeNull()

    await act(async () => {
      root.unmount()
    })
  })
})
