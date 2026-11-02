import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStreamingTextScope } from '../packages/markstream-core/src/streaming-text-dom'

const require = createRequire(import.meta.url)
await import(require.resolve('@angular/compiler', { paths: [resolve(process.cwd(), 'node_modules/.pnpm/node_modules')] }))
const { TextNodeComponent } = await import('../packages/markstream-angular/src/components/TextNode/TextNode.component')
const { InlineCodeNodeComponent } = await import('../packages/markstream-angular/src/components/InlineCodeNode/InlineCodeNode.component')
const disposals: Array<() => void> = []
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose())
  document.body.innerHTML = ''
})
describe('markstream-angular text streaming', () => {
  for (const inline of [false, true]) {
    it(`keeps word identities and stops ${inline ? 'inline code' : 'text'} fade at requested final`, () => {
      const cleanups: Array<() => void> = []
      const textScope = createStreamingTextScope(work => cleanups.push(work))
      const scope = { textScope, isSmoothStreamingEnabled: () => false }
      const component = inline ? new InlineCodeNodeComponent(scope) : new TextNodeComponent(scope)
      const node = (content: string) => (inline ? { type: 'inline_code', code: content, raw: content } : { type: 'text', content, raw: content }) as any
      component.context = { events: {}, fade: true }
      component.node = node('Hello')
      component.ngOnChanges()
      const host = document.createElement(inline ? 'code' : 'span')
      host.textContent = component.initial
      document.body.appendChild(host)
      component.host = { nativeElement: host }
      component.ngAfterViewInit()
      disposals.push(() => component.ngOnDestroy())
      component.node = node('Hello one tw')
      component.ngOnChanges()
      const words = [...host.querySelectorAll('.text-node-stream-delta')]
      expect(words.map(el => el.textContent)).toEqual(['one ', 'tw'])
      component.node = node('Hello one two three')
      component.ngOnChanges()
      expect(host.querySelectorAll('.text-node-stream-delta')[1]).toBe(words[1])
      textScope.setFinal(true)
      expect(host.querySelector('.text-node-stream-delta')).toBeNull()
      component.node = node('Hello one two three END')
      component.ngOnChanges()
      cleanups.forEach(work => work())
      expect(host.textContent).toBe('Hello one two three END')
    })
  }
  it('ships pre-wrap text styles so softbreaks stay visible', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/markstream-angular/src/index.css'), 'utf8')
    expect(css).toContain('.markstream-angular .markstream-angular-text-node')
    expect(css).toContain('white-space: pre-wrap;')
  })
})
