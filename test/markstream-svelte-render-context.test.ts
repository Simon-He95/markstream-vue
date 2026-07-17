import { describe, expect, it } from 'vitest'
import { buildRenderContext } from '../packages/markstream-svelte/src/components/shared/node-helpers'

describe('markstream-svelte render context', () => {
  it('forwards the viewport priority setting to code blocks', () => {
    expect(buildRenderContext({ viewportPriority: false }).viewportPriority).toBe(false)
    expect(buildRenderContext({ viewportPriority: true }).viewportPriority).toBe(true)
  })
})
