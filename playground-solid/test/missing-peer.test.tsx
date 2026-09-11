/**
 * @vitest-environment jsdom
 *
 * In-process disable*() is not a missing-peer proof. The packed consumer
 * without optional peers is `scripts/smoke-solid-packed-package.mjs`.
 */

import { disableKatex, disableMermaid, enableKatex, enableMermaid, NodeRenderer } from 'markstream-solid'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'

describe('solid playground disabled-loader fallback', () => {
  afterEach(() => {
    enableKatex()
    enableMermaid()
    document.body.innerHTML = ''
  })

  it('degrades readably when KaTeX and Mermaid loaders are disabled in-process', async () => {
    disableKatex()
    disableMermaid()
    const host = document.createElement('div')
    const dispose = render(() => (
      <NodeRenderer
        content={'Inline $E=mc^2$\n\n```mermaid\nflowchart LR\nA-->B\n```'}
        final
      />
    ), host)
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.innerHTML).not.toMatch(/class="katex"/)
    expect(host.querySelector('.mermaid-source-fallback')?.textContent).toContain('flowchart LR')
    expect(host.textContent).toMatch(/E=mc\^2|E = mc|mc\^2/)
    dispose()
  })
})
