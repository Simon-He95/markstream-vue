import { mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

// D2 builds the ids and the `.d2-<hash>` style scope of its SVG from a hash of the
// diagram source, so identical diagrams on one page collide unless each render
// gets its own `RenderOptions.salt` (issue #775 is the same failure mode for
// mermaid). The block component and `enhanceRenderedHtml` share one counter, so a
// page mixing both render paths must not hand D2 the same salt twice.

const stub = vi.hoisted(() => ({ renderOptions: [] as Array<Record<string, any>> }))

vi.mock('../src/optional/d2', () => ({
  getD2: async () => class FakeD2 {
    async compile(code: string) {
      return { diagram: { code }, renderOptions: {} }
    }

    async render(diagram: { code: string }, options: Record<string, any>) {
      stub.renderOptions.push(options)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>${diagram.code.length}</text></svg>`
    }
  },
  isD2Enabled: () => true,
  setD2Loader: () => {},
  enableD2: () => {},
  disableD2: () => {},
}))

const D2BlockNode = (await import('../src/components/D2BlockNode.svelte')).default as any
const { enhanceRenderedHtml } = await import('../src/enhanceRenderedHtml')

const mounted: any[] = []
const hosts: HTMLElement[] = []

function createHost() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  return host
}

function mountDiagram(code: string) {
  const target = createHost()
  const app = mount(D2BlockNode, {
    target,
    props: {
      node: { type: 'code_block', language: 'd2', code, raw: `\`\`\`d2\n${code}\n\`\`\`` },
      loading: false,
    },
  })
  mounted.push(app)
  return target
}

afterEach(() => {
  while (mounted.length) {
    try {
      unmount(mounted.pop())
    }
    catch {}
  }
  while (hosts.length)
    hosts.pop()?.remove()
  stub.renderOptions.length = 0
})

describe('d2 render salt', () => {
  it('keeps identical diagrams unique across the enhanced-HTML and component paths', async () => {
    stub.renderOptions.length = 0

    // 1) + 2) Streamed HTML path: two fences with the very same source.
    const host = createHost()
    host.innerHTML = `
      <pre data-markstream-code-block="1" data-markstream-language="d2"><code class="language-d2">a -> b</code></pre>
      <pre data-markstream-code-block="1" data-markstream-language="d2"><code class="language-d2">a -> b</code></pre>
    `
    await enhanceRenderedHtml(host, { final: true })
    expect(stub.renderOptions).toHaveLength(2)

    // 3) Component path: a block rendered next to the enhanced HTML.
    mountDiagram('a -> b')
    await vi.waitFor(() => expect(stub.renderOptions).toHaveLength(3))

    const salts = stub.renderOptions.map(options => options.salt)
    expect(salts.every(salt => typeof salt === 'string' && salt.length > 0)).toBe(true)
    expect(new Set(salts).size).toBe(3)
  })
})
