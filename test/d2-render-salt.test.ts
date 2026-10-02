import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import D2BlockNode from '../src/components/D2BlockNode/D2BlockNode.vue'
import { createD2RenderSalt } from '../src/utils/d2RenderSalt'

// D2 derives the ids and `.d2-<hash>` style scope of its output from a hash of the
// diagram source, so two identical diagrams on one page emit the same ids and the
// same document-level style rules until one of them wins. Issue #775 is the same
// failure mode for mermaid: every render has to hand the renderer its own id.
// `RenderOptions.salt` is D2's knob for that, so each render must carry a fresh
// salt instead of the same content hash.

const d2MockState = vi.hoisted(() => ({
  renderOptions: [] as Array<Record<string, any>>,
}))

vi.mock('../src/components/D2BlockNode/d2', () => ({
  getD2: vi.fn(async () => class FakeD2 {
    async compile(code: string) {
      return { diagram: { code }, renderOptions: {} }
    }

    async render(diagram: { code: string }, options: Record<string, any>) {
      d2MockState.renderOptions.push(options)
      return `<svg viewBox="0 0 100 100"><text>${diagram.code}</text></svg>`
    }
  }),
}))

async function flushRender() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

async function waitForRenders(count: number, timeout = 1000) {
  const start = Date.now()
  while (d2MockState.renderOptions.length < count) {
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${count} D2 renders`)
    await flushRender()
  }
}

function mountBlock(code: string) {
  return mount(D2BlockNode as any, {
    props: {
      node: {
        type: 'code_block',
        language: 'd2',
        code,
        raw: `\`\`\`d2\n${code}\n\`\`\``,
      },
      loading: false,
    },
    attachTo: document.body,
  })
}

describe('d2 render salt', () => {
  it('gives every diagram its own salt, even when two blocks share the same source', async () => {
    d2MockState.renderOptions.length = 0

    const first = mountBlock('a -> b')
    const second = mountBlock('a -> b')

    await waitForRenders(2)

    const salts = d2MockState.renderOptions.map(options => options.salt)
    expect(salts.every(salt => typeof salt === 'string' && salt.length > 0)).toBe(true)
    expect(new Set(salts).size).toBe(2)

    first.unmount()
    second.unmount()
  })

  it('never reuses a salt between renders', () => {
    const salts = new Set(Array.from({ length: 50 }, () => createD2RenderSalt()))
    expect(salts.size).toBe(50)
  })
})
