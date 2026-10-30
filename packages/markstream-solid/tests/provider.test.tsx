import { render } from 'solid-js/web'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MarkdownRender, { MarkstreamProvider, resolveLanguageId, withMarkstreamComponentDisplay } from '../src'

let dispose: (() => void) | undefined
let host: HTMLDivElement | undefined
beforeEach(() => vi.stubGlobal('ResizeObserver', class {
  observe() { }
  disconnect() { }
}))
afterEach(() => {
  dispose?.()
  host?.remove()
  vi.unstubAllGlobals()
})
it('isolates component maps, translations and language icons across Solid providers', () => {
  host = document.createElement('div')
  document.body.append(host)
  const content = '<thinking>scoped</thinking>\n\n```ts\nconst x = 1\n```'
  dispose = render(() => (
    <>
      <MarkstreamProvider components={{ thinking: (props: any) => <aside data-scope="one">{props.node.content}</aside> }} defaultI18nMap={{ 'common.copy': '复制甲' }} languageIconResolver={() => '<svg data-icon="one" />'}><section data-provider="one"><MarkdownRender content={content} customHtmlTags={['thinking']} renderCodeBlocksAsPre final smoothStreaming={false} batchRendering={false} viewportPriority={false} /></section></MarkstreamProvider>
      <MarkstreamProvider components={{ thinking: (props: any) => <aside data-scope="two">{props.node.content}</aside> }} defaultI18nMap={{ 'common.copy': '复制乙' }} languageIconResolver={() => '<svg data-icon="two" />'}><section data-provider="two"><MarkdownRender content={content} customHtmlTags={['thinking']} renderCodeBlocksAsPre final smoothStreaming={false} batchRendering={false} viewportPriority={false} /></section></MarkstreamProvider>
    </>
  ), host)
  expect(host.querySelector('[data-provider="one"] [data-scope="one"]')?.textContent).toContain('scoped')
  expect(host.querySelector('[data-provider="two"] [data-scope="two"]')?.textContent).toContain('scoped')
  expect(host.querySelector('[data-provider="one"] [aria-label="复制甲"]')).not.toBeNull()
  expect(host.querySelector('[data-provider="two"] [aria-label="复制乙"]')).not.toBeNull()
  expect(host.querySelector('[data-provider="one"] [data-icon="two"]')).toBeNull()
  expect(host.querySelector('[data-provider="two"] [data-icon="one"]')).toBeNull()
})
it('uses custom component display metadata to split block content out of paragraphs', () => {
  host = document.createElement('div')
  document.body.append(host)
  const Callout = withMarkstreamComponentDisplay((props: any) => <aside>{props.node.content}</aside>, 'block')
  dispose = render(() => <MarkdownRender nodes={[{ type: 'paragraph', children: [{ type: 'text', content: 'before' }, { type: 'callout', content: 'block' }, { type: 'text', content: 'after' }] }]} customComponents={{ callout: Callout }} batchRendering={false} viewportPriority={false} />, host)
  expect(host.querySelector('p aside')).toBeNull()
  expect(host.querySelectorAll('p')).toHaveLength(2)
  expect(host.querySelector('aside')?.textContent).toBe('block')
})
it('normalizes SVG markup to a supported XML highlighting grammar', () => {
  expect(resolveLanguageId('svg')).toBe('xml')
})
