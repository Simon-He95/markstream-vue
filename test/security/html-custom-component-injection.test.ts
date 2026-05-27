/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { parseHtmlToVNodes } from '../../src/utils/htmlRenderer'

const SafeCard = defineComponent({
  name: 'SafeCard',
  setup(_, { attrs, slots }) {
    return () => h('section', attrs, slots.default?.())
  },
})

describe('custom HTML component injection', () => {
  it('sanitizes attrs before passing them to custom components', () => {
    const nodes = parseHtmlToVNodes(
      '<safe-card href="javascript:alert(1)" srcdoc="plain" onclick="alert(1)" style="background:url(javascript:alert(1))" data-safe="ok">x</safe-card>',
      { 'safe-card': SafeCard },
      'safe',
    )

    expect(nodes).not.toBeNull()
    const props = (nodes?.[0] as any)?.props ?? {}
    expect(props.href).toBeUndefined()
    expect(props.srcdoc).toBeUndefined()
    expect(props.onclick).toBeUndefined()
    expect(props.style).toBeUndefined()
    expect(props['data-safe'] ?? props.dataSafe).toBe('ok')
  })
})
