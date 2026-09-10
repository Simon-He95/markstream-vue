import MarkdownRender, { disableKatex, disableMermaid } from 'markstream-solid'
import { createComponent } from 'solid-js'
import { renderToString } from 'solid-js/web'

disableKatex()
disableMermaid()

const html = renderToString(() => createComponent(MarkdownRender, {
  content: 'Inline $E=mc^2$\n\n```mermaid\nflowchart LR\nA-->B\n```',
  final: true,
}))

if (!html)
  throw new Error('missing-peer fixture produced empty markup')

console.log(html)
