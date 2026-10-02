/**
 * @vitest-environment jsdom
 */

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'

// Footnote ids come from the markdown label, so two renderer trees on one page (two chat
// messages, two docs examples) both produce `fnref-1` / `fnref--1`. A click must stay inside
// the tree it was made in instead of resolving through the document.
const roots: Array<{ unmount: () => void }> = []
const hosts: HTMLElement[] = []
const scrolled: Element[] = []

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function mountTree(content: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => {
    root.render(React.createElement(NodeRenderer as any, {
      content,
      final: true,
      batchRendering: false,
      viewportPriority: false,
      deferNodesUntilVisible: false,
      smoothStreaming: false,
    }))
  })
  await flushReact()
  return host
}

async function waitForFootnote(host: Element) {
  await vi.waitFor(() => expect(host.querySelector('.footnote-reference')).toBeTruthy())
  await vi.waitFor(() => expect(host.querySelector('.footnote-anchor')).toBeTruthy())
}

async function click(element: Element | null) {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(Element.prototype as any).scrollIntoView = function () {
    scrolled.push(this)
  }
})

afterEach(() => {
  while (roots.length) {
    const root = roots.pop()!
    act(() => root.unmount())
  }
  while (hosts.length)
    hosts.pop()?.remove()
  scrolled.length = 0
  delete (Element.prototype as any).scrollIntoView
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('react footnote target scope', () => {
  it('keeps a reference click inside its own tree when two trees share the same label', async () => {
    const content = 'Message[^1].\n\n[^1]: note.\n'
    const first = await mountTree(content)
    const second = await mountTree(content)
    await waitForFootnote(first)
    await waitForFootnote(second)

    // The label-derived id is intentionally not unique across trees.
    expect(document.querySelectorAll('[id="fnref-1"]')).toHaveLength(2)
    expect(document.querySelectorAll('[id="fnref--1"]')).toHaveLength(2)

    await click(second.querySelector('.footnote-reference'))

    expect(scrolled).toHaveLength(1)
    expect(second.contains(scrolled[0])).toBe(true)
    expect(first.contains(scrolled[0])).toBe(false)
    expect(scrolled[0]?.id).toBe('fnref--1')
    // A document-level lookup would have picked the first tree instead.
    expect(first.contains(document.getElementById('fnref--1'))).toBe(true)
  })

  it('keeps a backlink inside its own tree when two trees share the same label', async () => {
    const content = 'Message[^1].\n\n[^1]: note.\n'
    const first = await mountTree(content)
    const second = await mountTree(content)
    await waitForFootnote(first)
    await waitForFootnote(second)

    await click(second.querySelector('.footnote-anchor'))

    expect(scrolled).toHaveLength(1)
    expect(second.contains(scrolled[0])).toBe(true)
    expect(first.contains(scrolled[0])).toBe(false)
    expect(scrolled[0]?.id).toBe('fnref-1')
  })

  it('still resolves references and backlinks within a single tree', async () => {
    const host = await mountTree('Message[^1] and again[^1].\n\n[^1]: note.\n')
    await waitForFootnote(host)

    await click(host.querySelector('.footnote-reference'))
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]?.id).toBe('fnref--1')

    scrolled.length = 0
    await click(host.querySelector('.footnote-anchor'))
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]?.id).toBe('fnref-1')
  })
})
