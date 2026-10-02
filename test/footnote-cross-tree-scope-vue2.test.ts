import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import FootnoteAnchorNode from '../packages/markstream-vue2/src/components/FootnoteAnchorNode/FootnoteAnchorNode.vue'
import FootnoteReferenceNode from '../packages/markstream-vue2/src/components/FootnoteReferenceNode/FootnoteReferenceNode.vue'

// Footnote ids come from the markdown label, so two renderer trees on one page (two chat
// messages, two docs examples) both produce `fnref-1` / `fnref--1`. A click must stay inside
// the tree it was made in instead of resolving through the document.
const mounted: any[] = []
const hosts: HTMLElement[] = []
const scrolled: Element[] = []

// Each tree carries the same `markstream-vue2 markdown-renderer` root as the real renderer, plus
// the counterpart element the clicked component has to reach (`fnref--<label>` is the definition,
// `fnref-<label>` is the reference).
function createTree(counterpartHtml: string) {
  const host = document.createElement('div')
  host.className = 'markstream-vue2 markdown-renderer'
  host.innerHTML = counterpartHtml
  document.body.appendChild(host)
  hosts.push(host)
  return host
}

function click(element: Element | null) {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0))
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
  while (hosts.length)
    hosts.pop()?.remove()
  scrolled.length = 0
  delete (Element.prototype as any).scrollIntoView
})

describe('vue2 footnote target scope', () => {
  it('keeps a reference click inside its own tree when two trees share the same label', async () => {
    const definition = '<div id="fnref--1" class="footnote-node">note</div>'
    const first = createTree(definition)
    const second = createTree(definition)
    mounted.push(mount(FootnoteReferenceNode as any, {
      props: { node: { type: 'footnote_reference', id: '1', raw: '[^1]' } },
      attachTo: second,
    }))
    await flush()

    expect(document.querySelectorAll('[id="fnref--1"]')).toHaveLength(2)

    click(second.querySelector('.footnote-reference'))

    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]).toBe(second.querySelector('#fnref--1'))
    expect(first.contains(scrolled[0])).toBe(false)
  })

  it('keeps a backlink inside its own tree when two trees share the same label', async () => {
    const reference = '<sup id="fnref-1" class="footnote-reference">[1]</sup>'
    const first = createTree(reference)
    const second = createTree(reference)
    mounted.push(mount(FootnoteAnchorNode as any, {
      props: { node: { type: 'footnote_anchor', id: '1' } },
      attachTo: second,
    }))
    await flush()

    expect(document.querySelectorAll('[id="fnref-1"]')).toHaveLength(2)

    click(second.querySelector('.footnote-anchor'))

    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]).toBe(second.querySelector('#fnref-1'))
    expect(first.contains(scrolled[0])).toBe(false)
  })

  it('still resolves the reference inside a single tree', async () => {
    const tree = createTree('<div id="fnref--1" class="footnote-node">note</div>')
    mounted.push(mount(FootnoteReferenceNode as any, {
      props: { node: { type: 'footnote_reference', id: '1', raw: '[^1]' } },
      attachTo: tree,
    }))
    await flush()

    click(tree.querySelector('.footnote-reference'))

    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]).toBe(tree.querySelector('#fnref--1'))
  })
})
