import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMermaidCDNWorkerSource as buildAngular } from '../../packages/markstream-angular/src/workers/mermaidCdnWorker'
import { buildMermaidCDNWorkerSource as buildSvelte } from '../../packages/markstream-svelte/src/workers/mermaidCdnWorker'
import { buildMermaidCDNWorkerSource as buildVue2 } from '../../packages/markstream-vue2/src/workers/mermaidCdnWorker'
import { buildMermaidCDNWorkerSource as buildVue3 } from '../../src/workers/mermaidCdnWorker'

const mermaid = (await vi.importActual<typeof import('mermaid')>('mermaid')).default
const header = '---\ntitle: Example\nconfig:\n  flowchart:\n    nodeSpacing: 73\n---\n'
const code = `${header}flowchart LR\n  A --> B`

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('mermaid')
})

interface Request {
  id: string
  action: string
  payload: { code: string, theme: string }
}

type Handler = (event: { data: Request }) => Promise<void>

const workers = [
  ['Vue 3', () => import('../../src/workers/mermaidParser.worker')],
  ['Vue 2', () => import('../../packages/markstream-vue2/src/workers/mermaidParser.worker')],
  ['React', () => import('../../packages/markstream-react/src/workers/mermaidParser.worker')],
  ['Octane', () => import('../../packages/markstream-octane/src/workers/mermaidParser.worker')],
  ['Svelte', () => import('../../packages/markstream-svelte/src/workers/mermaidParser.worker')],
  ['Angular', () => import('../../packages/markstream-angular/src/workers/mermaidParser.worker')],
] as const

const cdnWorkers = [
  ['Vue 3 CDN', buildVue3],
  ['Vue 2 CDN', buildVue2],
  ['Svelte CDN', buildSvelte],
  ['Angular CDN', buildAngular],
] as const

const entries = [
  ...workers.map(([name, load]) => ({ name, load, build: undefined })),
  ...cdnWorkers.map(([name, build]) => ({ name, load: undefined, build })),
]

describe.each(entries)('mermaid frontmatter ($name)', ({ name, load, build }) => {
  it.each(['\n', '\r\n', '\r'])('parses frontmatter and finds a streaming prefix with %j endings', async (newline) => {
    const inputHeader = header.replace(/\n/g, newline)
    const inputCode = code.replace(/\n/g, newline)
    const replies: unknown[] = []
    const sources: string[] = []
    const engine = {
      initialize: mermaid.initialize,
      parse: async (source: string) => {
        const result = await mermaid.parse(source)
        sources.push(source)
        return result
      },
    }
    let handler: Handler | undefined
    if (load) {
      const manifest = name === 'Vue 3'
        ? '../../package.json'
        : `../../packages/markstream-${name.toLowerCase().replace(' ', '')}/package.json`
      const mermaidPath = createRequire(new URL(manifest, import.meta.url)).resolve('mermaid')
      vi.doMock(mermaidPath, () => ({ default: engine }))
      const worker = { onmessage: undefined as Handler | undefined, postMessage: (message: unknown) => replies.push(message) }
      vi.stubGlobal('self', worker)
      await load()
      handler = worker.onmessage
    }
    else {
      const context = {
        mermaid: engine,
        importScripts: () => {},
        postMessage: (message: unknown) => replies.push(message),
        addEventListener: (_type: string, listener: Handler) => { handler = listener },
        console,
      }
      runInNewContext(build!({ mermaidUrl: 'https://example.invalid/mermaid.js', mode: 'classic' }), context)
    }
    expect(handler).toBeTypeOf('function')
    for (const theme of ['light', 'dark']) {
      await handler!({ data: { id: theme, action: 'canParse', payload: { code: inputCode, theme } } })
      expect(replies.at(-1)).toEqual({ id: theme, ok: true, result: true })
      expect(sources.at(-1)?.startsWith(inputHeader)).toBe(true)
      expect(await mermaid.parse(sources.at(-1)!)).toMatchObject({
        config: { theme: theme === 'dark' ? 'dark' : 'default', flowchart: { nodeSpacing: 73 } },
      })
      await handler!({ data: { id: 'prefix', action: 'findPrefix', payload: { code: `${inputCode}${newline}  B -->`, theme } } })
      expect(replies.at(-1)).toEqual({ id: 'prefix', ok: true, result: code })
      const authored = `${inputHeader}%%{init: {"theme":"forest"}}%%${newline}flowchart LR${newline}  A --> B`
      await handler!({ data: { id: 'author', action: 'canParse', payload: { code: authored, theme } } })
      expect(replies.at(-1)).toEqual({ id: 'author', ok: true, result: true })
      expect(sources.at(-1)).toBe(authored)
      await handler!({ data: { id: 'incomplete', action: 'canParse', payload: { code: '---\ntitle: Example', theme } } })
      expect(replies.at(-1)).toMatchObject({ id: 'incomplete', ok: false })
    }
  })
})
