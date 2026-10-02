import type { NodeRendererProps } from '../../src/index'
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeRenderer } from '../../src/index'

// Footnote ids come from the markdown label (`fnref-1` / `fnref--1`), so two renderer trees on
// one page both emit the same ids. A click must stay inside the tree it was made in instead of
// resolving through the document, which would always pick the first tree.

const stableRendererProps = {
  batchRendering: false,
  deferNodesUntilVisible: false,
  maxLiveNodes: 0,
  smoothStreaming: false,
  viewportPriority: false,
} satisfies NodeRendererProps

const scrolled: Element[] = []

function renderTree(content: string) {
  const view = render(NodeRenderer, {
    props: { ...stableRendererProps, content, final: true },
  })
  return view.container
}

async function waitForFootnote(container: Element) {
  await waitFor(() => expect(container.querySelector('.footnote-reference')).toBeTruthy())
  await waitFor(() => expect(container.querySelector('.footnote-anchor')).toBeTruthy())
}

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = function () {
    scrolled.push(this)
  }
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  scrolled.length = 0
  delete (Element.prototype as any).scrollIntoView
})

describe('octane footnote target scope', () => {
  it('keeps a reference click inside its own tree when two trees share the same label', async () => {
    const content = 'Message[^1].\n\n[^1]: note.\n'
    const first = renderTree(content)
    const second = renderTree(content)
    await waitForFootnote(first)
    await waitForFootnote(second)

    expect(document.querySelectorAll('[id="fnref-1"]')).toHaveLength(2)
    expect(document.querySelectorAll('[id="fnref--1"]')).toHaveLength(2)

    fireEvent.click(second.querySelector('.footnote-reference')!)

    expect(scrolled).toHaveLength(1)
    expect(second.contains(scrolled[0])).toBe(true)
    expect(first.contains(scrolled[0])).toBe(false)
    expect(scrolled[0]?.id).toBe('fnref--1')
  })

  it('keeps a backlink inside its own tree when two trees share the same label', async () => {
    const content = 'Message[^1].\n\n[^1]: note.\n'
    const first = renderTree(content)
    const second = renderTree(content)
    await waitForFootnote(first)
    await waitForFootnote(second)

    fireEvent.click(second.querySelector('.footnote-anchor')!)

    expect(scrolled).toHaveLength(1)
    expect(second.contains(scrolled[0])).toBe(true)
    expect(first.contains(scrolled[0])).toBe(false)
    expect(scrolled[0]?.id).toBe('fnref-1')
  })
})
