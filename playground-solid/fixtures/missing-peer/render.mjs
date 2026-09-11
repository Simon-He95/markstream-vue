import MarkdownRender from 'markstream-solid'
import { createComponent } from 'solid-js'
import { renderToString } from 'solid-js/web'

const html = renderToString(() => createComponent(MarkdownRender, {
  content: 'Inline $E=mc^2$\n\n```mermaid\nflowchart LR\nA-->B\n```',
  final: true,
}))

if (!html)
  throw new Error('missing-peer fixture produced empty markup')

if (html.includes('class="katex"'))
  throw new Error('missing-peer fixture unexpectedly rendered KaTeX markup')

console.log(html)
