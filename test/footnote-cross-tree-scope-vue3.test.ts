import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import NodeRenderer from '../src/components/NodeRenderer'

// Footnote ids come from the markdown label, so two renderer trees on one page (two chat
// messages, two docs examples) both produce `fnref-1` / `fnref--1`. A click must stay inside
// the tree it was made in instead of resolving through the document.
const mounted: any[] = []
const scrolled: Element[] = []

function mountTree(content: string) {
  const wrapper = mount(NodeRenderer, {
    props: { content, final: true },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

function click(element: Element | null) {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = function () {
    scrolled.push(this)
  }
})

afterEach(() => {
  while (mounted.length) {
    try {
      mounted.pop().unmount()
    }
    catch {}
  }
  document.body.replaceChildren()
  scrolled.length = 0
  delete (Element.prototype as any).scrollIntoView
})

describe('vue3 footnote target scope', () => {
  it('keeps a reference click inside its own tree when two trees share the same label', async () => {
    const content = 'Message[^1].\n\n[^1]: note.\n'
    const first = mountTree(content)
    const second = mountTree(content)
    await flush()

    // The label-derived id is intentionally not unique across trees.
    expect(document.querySelectorAll('[id="fnref-1"]')).toHaveLength(2)
    expect(document.querySelectorAll('[id="fnref--1"]')).toHaveLength(2)

    click(second.element.querySelector('.footnote-reference'))

    expect(scrolled).toHaveLength(1)
    expect(second.element.contains(scrolled[0])).toBe(true)
    expect(first.element.contains(scrolled[0])).toBe(false)
    // A document-level lookup would have picked the first tree instead.
    expect(first.element.contains(document.getElementById('fnref--1'))).toBe(true)
  })

  it('keeps a backlink inside its own tree when two trees share the same label', async () => {
    const content = 'Message[^1].\n\n[^1]: note.\n'
    const first = mountTree(content)
    const second = mountTree(content)
    await flush()

    click(second.element.querySelector('.footnote-anchor'))

    expect(scrolled).toHaveLength(1)
    expect(second.element.contains(scrolled[0])).toBe(true)
    expect(first.element.contains(scrolled[0])).toBe(false)
  })

  it('resolves a reference nested in a blockquote to its own tree', async () => {
    const content = '> Quoted[^1].\n\n[^1]: note.\n'
    const first = mountTree(content)
    const second = mountTree(content)
    await flush()

    click(second.element.querySelector('.footnote-reference'))

    expect(scrolled).toHaveLength(1)
    expect(second.element.contains(scrolled[0])).toBe(true)
    expect(first.element.contains(scrolled[0])).toBe(false)
  })

  it('still resolves references and backlinks within a single tree', async () => {
    const wrapper = mountTree('Message[^1] and again[^1].\n\n[^1]: note.\n')
    await flush()

    click(wrapper.element.querySelector('.footnote-reference'))
    expect(scrolled).toHaveLength(1)
    expect(wrapper.element.contains(scrolled[0])).toBe(true)
    expect(scrolled[0]?.id).toBe('fnref--1')

    scrolled.length = 0
    click(wrapper.element.querySelector('.footnote-anchor'))
    expect(scrolled).toHaveLength(1)
    expect(wrapper.element.contains(scrolled[0])).toBe(true)
    expect(scrolled[0]?.id).toBe('fnref-1')
  })
})
