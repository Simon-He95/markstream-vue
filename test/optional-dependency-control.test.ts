import { afterEach, describe, expect, it, vi } from 'vitest'
import { disableKatex, enableKatex, getKatex, isKatexEnabled, setKatexLoader } from '../src/components/MathInlineNode/katex'
import { disableMermaid, enableMermaid, getMermaid, isMermaidEnabled, setMermaidLoader } from '../src/components/MermaidBlockNode/mermaid'
import { renderKaTeXWithBackpressure } from '../src/workers/katexWorkerClient'
import { canParseOffthread } from '../src/workers/mermaidWorkerClient'

describe('optional dependency controllers', () => {
  describe('katex loader control', () => {
    afterEach(() => {
      enableKatex()
    })

    it('allows overriding and disabling the KaTeX loader', async () => {
      const customRenderer = { renderToString: vi.fn() }
      setKatexLoader(async () => customRenderer)

      const resolved = await getKatex()
      expect(resolved).toBe(customRenderer)
      expect(isKatexEnabled()).toBe(true)

      disableKatex()
      expect(isKatexEnabled()).toBe(false)
      const disabledLoad = await getKatex()
      expect(disabledLoad).toBeNull()
      await expect(renderKaTeXWithBackpressure('x+y', false)).rejects.toMatchObject({ code: 'KATEX_DISABLED' })
    })
  })

  describe('mermaid loader control', () => {
    afterEach(() => {
      enableMermaid()
    })

    it('allows overriding and disabling the mermaid loader', async () => {
      const render = vi.fn()
      const parse = vi.fn()
      const initialize = vi.fn()
      setMermaidLoader(async () => ({ render, parse, initialize }))

      const api = await getMermaid()
      expect(api?.render).toBe(render)
      expect(api?.parse).toBe(parse)
      expect(typeof api?.initialize).toBe('function')

      disableMermaid()
      expect(isMermaidEnabled()).toBe(false)
      const disabled = await getMermaid()
      expect(disabled).toBeNull()
      await expect(canParseOffthread('graph TD;A-->B', 'light')).rejects.toMatchObject({ code: 'MERMAID_DISABLED' })
    })
  })
})
