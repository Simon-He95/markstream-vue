import { renderToString } from 'solid-js/web'
import { describe, expect, it } from 'vitest'
import MarkdownRender, { renderMarkdownToHtml } from '../src'

describe('Solid SSR', () => {
  it('imports without a DOM and renders complete history without timers', () => {
    const content = Array.from({ length: 400 }, (_, index) => `## section ${index}\n\nparagraph ${index}`).join('\n\n')
    const html = renderToString(() => <MarkdownRender content={content} final smoothStreaming={true} />)
    expect(html).toContain('section 0')
    expect(html).toContain('section 399')
    expect(html).toContain('paragraph 399')
    expect(html.match(/class="node-slot"/g)).toHaveLength(800)
  })

  it('includes safe rich HTML and math source in server output', () => {
    const html = renderToString(() => <MarkdownRender content={'<div onclick="bad()">safe</div>\n\n$x^2$'} final />)
    expect(html).toContain('safe')
    expect(html).toContain('x^2')
    expect(html).not.toContain('onclick')
  })

  it('exports a DOM-free HTML renderer', () => {
    expect(renderMarkdownToHtml({ content: '# Solid', final: true })).toBe('<h1>Solid</h1>')
  })
})
