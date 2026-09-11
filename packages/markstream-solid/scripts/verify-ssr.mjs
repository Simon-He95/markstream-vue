import MarkdownRender from 'markstream-solid'
import { createComponent } from 'solid-js'
import { renderToString } from 'solid-js/web'

const html = renderToString(() => createComponent(MarkdownRender, {
  content: '# Server rendered',
  final: true,
}))

if (!html.includes('Server rendered'))
  throw new Error('The Solid server entry did not render Markdown content.')

if (!html.includes('data-hk') && !html.includes('markstream-solid'))
  throw new Error('The Solid server entry did not emit hydratable markup.')

console.log('markstream-solid SSR smoke test passed')
