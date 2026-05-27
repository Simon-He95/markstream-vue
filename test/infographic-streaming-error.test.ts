import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setInfographicLoader } from '../src/components/InfographicBlockNode/infographic'
import InfographicBlockNode from '../src/components/InfographicBlockNode/InfographicBlockNode.vue'
import { flushAll } from './setup/flush-all'

const defaultInfographicLoader = () => import('@antv/infographic')

function createNode(code: string) {
  return {
    type: 'code_block',
    language: 'infographic',
    code,
    raw: `\`\`\`infographic\n${code}\n\`\`\``,
  }
}

class ErrorInfographic {
  private errorHandler?: (error: unknown) => void

  on(event: string, handler: (error: unknown) => void) {
    if (event === 'error')
      this.errorHandler = handler
  }

  render() {
    this.errorHandler?.(new Error('Incomplete options'))
  }

  destroy() {}
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setInfographicLoader(defaultInfographicLoader)
})

describe('infographicBlockNode streaming errors', () => {
  it('only reports render errors after streaming completes', async () => {
    vi.stubGlobal('IntersectionObserver', undefined as any)
    setInfographicLoader(() => ErrorInfographic)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrapper = mount(InfographicBlockNode as any, {
      props: {
        node: createNode('infographic list-row-simple-horizontal-arrow'),
        loading: true,
      },
    })

    await flushAll()

    expect(errorSpy).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Failed to render infographic')

    await wrapper.setProps({ loading: false })
    await flushAll()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Failed to render infographic: Incomplete options')

    wrapper.unmount()
  })
})
