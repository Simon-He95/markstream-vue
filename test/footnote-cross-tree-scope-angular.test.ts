import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FootnoteAnchorNodeComponent } from '../packages/markstream-angular/src/components/FootnoteAnchorNode/FootnoteAnchorNode.component'
import { FootnoteReferenceNodeComponent } from '../packages/markstream-angular/src/components/FootnoteReferenceNode/FootnoteReferenceNode.component'

// Footnote ids come from the markdown label, so two renderer trees on one page (two chat
// messages, two docs examples) both produce `fnref-1` / `fnref--1`. A click must stay inside
// the tree it was made in instead of resolving through the document. Angular used to rely on the
// native `href` jump only, which always lands in the first tree on the page.
const scrolled: Element[] = []
const trees: HTMLElement[] = []

function createTree(counterpartHtml: string) {
  const host = document.createElement('div')
  host.className = 'markstream-angular markdown-renderer'
  host.innerHTML = counterpartHtml
  document.body.appendChild(host)
  trees.push(host)
  return host
}

function clickEvent(currentTarget: EventTarget) {
  let prevented = false
  const event = {
    currentTarget,
    preventDefault() {
      prevented = true
    },
  } as unknown as MouseEvent
  return { event, wasPrevented: () => prevented }
}

beforeEach(() => {
  (Element.prototype as any).scrollIntoView = function () {
    scrolled.push(this)
  }
})

afterEach(() => {
  while (trees.length)
    trees.pop()?.remove()
  scrolled.length = 0
  delete (Element.prototype as any).scrollIntoView
})

describe('angular footnote target scope', () => {
  it('keeps a reference click inside its own tree when two trees share the same label', () => {
    const first = createTree('<div id="fnref--1" class="markstream-nested-footnote">note</div>')
    const second = createTree('<div id="fnref--1" class="markstream-nested-footnote">note</div>')

    const component = new FootnoteReferenceNodeComponent()
    component.node = { type: 'footnote_reference', id: '1' } as any
    const link = document.createElement('a')
    second.appendChild(link)

    const { event, wasPrevented } = clickEvent(link)
    component.handleClick(event)

    expect(wasPrevented()).toBe(true)
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]).toBe(second.querySelector('#fnref--1'))
    expect(first.contains(scrolled[0])).toBe(false)
    // The id template itself is unchanged.
    expect(component.referenceId).toBe('fnref-1')
    expect(component.href).toBe('#fnref--1')
  })

  it('keeps a backlink inside its own tree when two trees share the same label', () => {
    const first = createTree('<sup id="fnref-1" class="markstream-nested-footnote-ref">[1]</sup>')
    const second = createTree('<sup id="fnref-1" class="markstream-nested-footnote-ref">[1]</sup>')

    const component = new FootnoteAnchorNodeComponent()
    component.node = { type: 'footnote_anchor', id: '1' } as any
    const link = document.createElement('a')
    second.appendChild(link)

    const { event, wasPrevented } = clickEvent(link)
    component.handleClick(event)

    expect(wasPrevented()).toBe(true)
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]).toBe(second.querySelector('#fnref-1'))
    expect(first.contains(scrolled[0])).toBe(false)
    expect(component.href).toBe('#fnref-1')
  })

  it('binds the click handlers in both templates', () => {
    const referenceSource = readFileSync(
      resolve(process.cwd(), 'packages/markstream-angular/src/components/FootnoteReferenceNode/FootnoteReferenceNode.component.ts'),
      'utf8',
    )
    const anchorSource = readFileSync(
      resolve(process.cwd(), 'packages/markstream-angular/src/components/FootnoteAnchorNode/FootnoteAnchorNode.component.ts'),
      'utf8',
    )

    expect(referenceSource).toContain('(click)="handleClick($event)"')
    expect(anchorSource).toContain('(click)="handleClick($event)"')
  })
})
