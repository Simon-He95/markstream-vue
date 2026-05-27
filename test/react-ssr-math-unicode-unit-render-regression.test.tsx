/**
 * @vitest-environment node
 */

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const packageRequire = createRequire(new URL('../package.json', import.meta.url))
const React = packageRequire('react') as typeof import('react')
const { renderToStaticMarkup } = packageRequire('react-dom/server') as typeof import('react-dom/server')

describe('markstream-react SSR math unicode unit render regression', () => {
  it('renders inline and block formulas with unicode unit glyphs on the server', async () => {
    const serverEntry = await import('../packages/markstream-react/src/server')

    const inlineHtml = renderToStaticMarkup(
      React.createElement(serverEntry.MathInlineNode, {
        node: {
          type: 'math_inline',
          content: 'c=0.75\\times10^3\\ \\text{J/(kg·℃)}',
          raw: '$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$',
          markup: '$',
          loading: false,
        },
      }),
    )

    const blockHtml = renderToStaticMarkup(
      React.createElement(serverEntry.MathBlockNode, {
        node: {
          type: 'math_block',
          content: 'Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}',
          raw: '$$Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}$$',
          loading: false,
        },
      }),
    )

    expect(inlineHtml).toContain('class="katex"')
    expect(inlineHtml).not.toContain('math-inline--fallback')
    expect(blockHtml).toContain('class="katex-display"')
    expect(blockHtml).not.toContain('math-block__fallback')
  })
})
