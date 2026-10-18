import { afterEach, describe, expect, it, vi } from 'vitest'

const mermaid = (await vi.importActual<typeof import('mermaid')>('mermaid')).default
const header = '---\ntitle: Example\nconfig:\n  theme: forest\n  flowchart:\n    nodeSpacing: 73\n---\n'
const diagram = 'flowchart LR\n  A --> B'

const entries = [
  ['Angular', () => import('../packages/markstream-angular/src/enhanceRenderedHtml')],
  ['Svelte', () => import('../packages/markstream-svelte/src/enhanceRenderedHtml')],
] as const

afterEach(() => {
  document.body.replaceChildren()
  vi.resetModules()
})

describe.each(entries)('%s static Mermaid enhancement', (name, load) => {
  async function enhance(code: string, final: boolean, isDark: boolean) {
    vi.resetModules()
    const sources: string[] = []
    const parsedSources: string[] = []
    const base = `../packages/markstream-${name.toLowerCase()}/src`
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    vi.doMock(`${base}/optional/mermaid`, () => ({
      getMermaid: async () => ({
        initialize: () => {},
        parse: async (source: string) => {
          parsedSources.push(source)
          return mermaid.parse(source)
        },
        // Verify the render input separately: real parse alone does not catch this ordering bug.
        render: async (_id: string, source: string) => {
          await mermaid.parse(source)
          sources.push(source)
          return { svg: '<svg><text>A → B</text></svg>' }
        },
      }),
    }))
    vi.doMock(`${base}/workers/mermaidWorkerClient`, () => ({
      canParseOffthread: async () => { throw new Error('Worker unavailable') },
      findPrefixOffthread: async () => null,
    }))
    const { enhanceRenderedHtml } = await load()
    const root = document.createElement('div')
    const pre = document.createElement('pre')
    const block = document.createElement('code')
    block.className = 'language-mermaid'
    block.textContent = code
    pre.append(block)
    root.append(pre)
    document.body.append(root)
    const handle = await enhanceRenderedHtml(root, { final, isDark })
    return { root, handle, sources, parsedSources }
  }

  it.each([
    ['\n', true],
    ['\r\n', true],
    ['\r', true],
    ['\n', false],
    ['\r\n', false],
    ['\r', false],
  ] as const)('keeps frontmatter first with %j endings (final=%s) and follows the host theme', async (newline, final) => {
    const frontmatter = header.replace(/\n/g, newline)
    const code = (header + diagram).replace(/\n/g, newline)
    for (const isDark of [false, true]) {
      const { root, handle, sources, parsedSources } = await enhance(code, final, isDark)
      expect(root.querySelector('svg text')?.textContent).toBe('A → B')
      expect(root.querySelector(':scope > pre')).toBeNull()
      expect(sources.at(-1)?.startsWith(frontmatter)).toBe(true)
      expect(await mermaid.parse(sources.at(-1)!)).toMatchObject({
        config: { theme: isDark ? 'dark' : 'default', flowchart: { nodeSpacing: 73 } },
      })
      if (!final)
        expect(parsedSources.at(-1)?.startsWith(frontmatter)).toBe(true)
      handle.dispose()
      expect(root.querySelector('pre code')?.textContent).toBe(code)
      root.remove()
    }
  })

  it('preserves an author directive following frontmatter', async () => {
    const code = `${header}%%{init: {"theme":"forest"}}%%\n${diagram}`
    const { root, handle, sources } = await enhance(code, false, true)
    expect(sources.at(-1)).toBe(code)
    expect(await mermaid.parse(sources.at(-1)!)).toMatchObject({ config: { theme: 'forest' } })
    expect(root.querySelector('svg')).not.toBeNull()
    handle.dispose()
  })
})
