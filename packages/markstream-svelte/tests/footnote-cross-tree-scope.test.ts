import { mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer.svelte'

// Footnote ids come from the markdown label (`fnref-1` / `fnref--1`), so two renderer trees on
// one page both emit the same ids. A click must stay inside the tree it was made in instead of
// resolving through the document, which would always pick the first tree.

const mounted: any[] = []
const hosts: HTMLElement[] = []
const scrolled: Element[] = []

function mountTree(content: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  const app = mount(NodeRenderer, {
    target: host,
    props: {
      content,
      final: true,
      batchRendering: false,
      deferNodesUntilVisible: false,
      viewportPriority: false,
      smoothStreaming: false,
    },
  })
  mounted.push(app)
  return host
}

async function waitForFootnote(host: Element) {
  await vi.waitFor(() => expect(host.querySelector('.footnote-reference')).toBeTruthy())
  await vi.waitFor(() => expect(host.querySelector('.footnote-anchor')).toBeTruthy())
}

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = function () {
    scrolled.push(this)
  }
})

afterEach(() => {
  while (mounted.length) {
    try {
      unmount(mounted.pop())
    }
    catch {}
  }
  while (hosts.length)
    hosts.pop()?.remove()
  scrolled.length = 0
  delete (Element.prototype as any).scrollIntoView
})

describe('svelte footnote target scope', () => {
  it('keeps a reference click inside its own tree when two trees share the same label', async () => {
    const content = 'Message[^1].\n\n[^1]: note.\n'
    const first = mountTree(content)
    const second = mountTree(content)
    await waitForFootnote(first)
    await waitForFootnote(second)

    expect(document.querySelectorAll('[id="fnref-1"]')).toHaveLength(2)
    expect(document.querySelectorAll('[id="fnref--1"]')).toHaveLength(2)

    second.querySelector('.footnote-reference')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(scrolled).toHaveLength(1)
    expect(second.contains(scrolled[0])).toBe(true)
    expect(first.contains(scrolled[0])).toBe(false)
    expect(scrolled[0]?.id).toBe('fnref--1')
  })

  it('keeps a backlink inside its own tree when two trees share the same label', async () => {
    const content = 'Message[^1].\n\n[^1]: note.\n'
    const first = mountTree(content)
    const second = mountTree(content)
    await waitForFootnote(first)
    await waitForFootnote(second)

    second.querySelector('.footnote-anchor')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(scrolled).toHaveLength(1)
    expect(second.contains(scrolled[0])).toBe(true)
    expect(first.contains(scrolled[0])).toBe(false)
    expect(scrolled[0]?.id).toBe('fnref-1')
  })
})
