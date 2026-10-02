import { mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mermaid writes the render id into the temporary container (`#d<id>`) and into
// the produced `<svg id>` itself. Two diagrams that receive the same id make
// Mermaid resolve [object Object] / the wrong element, and the page ends up with
// a blank preview for one of them (issue #775), so every call must get a fresh,
// page-wide unique id.

const stub = vi.hoisted(() => {
  const renderIds: string[] = []
  const mermaid = {
    render: async (id: string, source: string) => {
      renderIds.push(id)
      return {
        svg: `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"><g id="${id}-g">${source.length}</g></svg>`,
        bindFunctions: () => {},
      }
    },
    parse: async () => true,
    initialize: () => {},
  }
  return { renderIds, mermaid }
})

vi.mock('../src/optional/mermaid', () => ({
  getMermaid: async () => stub.mermaid,
  isMermaidEnabled: () => true,
  setMermaidLoader: () => {},
  disableMermaid: () => {},
}))

// The off-thread worker bridge does not exist in jsdom; claim "parse ok" so the
// block goes straight to the render call under test.
vi.mock('../src/workers/mermaidWorkerClient', () => ({
  canParseOffthread: async () => true,
  findPrefixOffthread: async () => null,
  terminateWorker: () => {},
}))

const MermaidBlockNode = (await import('../src/components/MermaidBlockNode.svelte')).default as any

const mounted: any[] = []
const hosts: HTMLElement[] = []

function createHost() {
  const target = document.createElement('div')
  document.body.appendChild(target)
  hosts.push(target)
  return target
}

function mountDiagram(code: string) {
  const target = createHost()
  const app = mount(MermaidBlockNode, {
    target,
    props: {
      node: { type: 'mermaid', code, loading: false },
      enableMermaidInteractions: false,
    },
  })
  mounted.push({ app, target })
  return target
}

afterEach(() => {
  while (mounted.length) {
    const { app, target } = mounted.pop()
    try {
      unmount(app)
    }
    catch {}
    target.remove()
  }
  while (hosts.length)
    hosts.pop()?.remove()
  stub.renderIds.length = 0
})

describe('mermaid render ids', () => {
  it('gives every diagram on the page its own render id', async () => {
    stub.renderIds.length = 0

    mountDiagram('graph TD;\n  A[First] --> B[One]')
    mountDiagram('graph TD;\n  C[Second] --> D[Two]')

    await vi.waitFor(() => expect(stub.renderIds).toHaveLength(2))

    expect(new Set(stub.renderIds).size).toBe(2)
  })

  it('keeps ids unique when one block renders again after a source update', async () => {
    stub.renderIds.length = 0

    const target = mountDiagram('graph TD;\n  A[First] --> B[One]')
    await vi.waitFor(() => expect(stub.renderIds).toHaveLength(1))

    // A second diagram mounted later must not reuse the first id either.
    mountDiagram('graph TD;\n  E[Third] --> F[Three]')
    await vi.waitFor(() => expect(stub.renderIds).toHaveLength(2))

    expect(new Set(stub.renderIds).size).toBe(2)
    expect(target.querySelector('svg')).toBeTruthy()
  })

  // `enhanceRenderedHtml` renders the same kind of diagrams for streamed HTML
  // through a second code path; both paths share one counter, so a page that
  // mixes them must not hand Mermaid the same id twice either.
  it('shares its id space with the enhanced-HTML render path', async () => {
    stub.renderIds.length = 0

    const host = createHost()
    host.innerHTML = '<pre data-markstream-code-block="1" data-markstream-language="mermaid"><code class="language-mermaid">graph TD; A-->B;</code></pre>'
    const { enhanceRenderedHtml } = await import('../src/enhanceRenderedHtml')
    await enhanceRenderedHtml(host, { final: true })
    expect(stub.renderIds).toHaveLength(1)

    mountDiagram('graph TD;\n  G[Fourth] --> H[Four]')
    await vi.waitFor(() => expect(stub.renderIds).toHaveLength(2))

    expect(new Set(stub.renderIds).size).toBe(2)
  })
})
