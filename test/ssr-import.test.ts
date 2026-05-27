/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

// SSR import smoke test: importing the library entry should not throw in Node.
describe('ssr import safety', () => {
  it('can import library entry without throwing', async () => {
    let mod: any = null
    let threw = false

    try {
      mod = await import('../src/exports')
    }
    catch (e) {
      threw = true
      console.error('Import threw:', e)
    }

    expect(threw).toBe(false)
    expect(mod).toBeTruthy()
    expect(
      typeof mod.default === 'object'
      || typeof mod.VueRendererMarkdown !== 'undefined'
      || Object.keys(mod).length > 0,
    ).toBe(true)
  })
})
