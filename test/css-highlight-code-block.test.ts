/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/** @vitest-environment jsdom */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { tokenizeCssHighlightCode } from '../src/components/CodeBlockNode/cssHighlightAdapter'
import CssHighlightCodeBlock from '../src/components/CodeBlockNode/CssHighlightCodeBlock.vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'

const originalCss = globalThis.CSS
const originalHighlight = (globalThis as any).Highlight
const originalStaticRange = (globalThis as any).StaticRange
const customId = 'css-highlight-benchmark'

function installHighlightApi() {
  const registry = new Map<string, unknown>()
  let setCalls = 0
  ;(globalThis as any).CSS = { highlights: {
    set: (name: string, value: unknown) => {
      setCalls++
      registry.set(name, value)
    },
    delete: (name: string) => registry.delete(name),
  } }
  ;(globalThis as any).Highlight = class FakeHighlight {
    ranges: unknown[]
    constructor(...ranges: unknown[]) { this.ranges = ranges }
  }
  ;(globalThis as any).StaticRange = class FakeStaticRange {
    constructor(init: unknown) { Object.assign(this, init) }
  }
  return { registry, getSetCalls: () => setCalls }
}

afterEach(() => {
  ;(globalThis as any).CSS = originalCss
  ;(globalThis as any).Highlight = originalHighlight
  ;(globalThis as any).StaticRange = originalStaticRange
  removeCustomComponents(customId)
})

describe('cssHighlightCodeBlock PoC', () => {
  it('tokenizes without creating token DOM nodes', () => {
    const tokens = tokenizeCssHighlightCode('const value = "hello"\n// note', 'typescript')
    expect(tokens.map(token => token.category)).toEqual(['keyword', 'string', 'comment'])
  })

  it('keeps URL fragments inside Python and YAML strings intact', () => {
    for (const [language, code] of [
      ['python', 'url = "http://example.com#frag"'],
      ['yaml', 'url: https://example.com/path#section'],
    ] as const) {
      const tokens = tokenizeCssHighlightCode(code, language)
      const stringToken = tokens.find(token => token.category === 'string')
      expect(stringToken).toBeDefined()
      expect(code.slice(stringToken!.start, stringToken!.end)).toContain('://')
      expect(code.slice(stringToken!.start, stringToken!.end)).toContain('#')
    }
  })

  it('keeps a plain pre while streaming and scopes highlights per instance', async () => {
    const { registry } = installHighlightApi()
    const node = { type: 'code_block' as const, language: 'typescript', code: 'const answer = 42', raw: 'const answer = 42', loading: true }
    const first = mount(CssHighlightCodeBlock, { props: { node } })
    await first.setProps({ node: { ...node, loading: false } })
    await nextTick()
    await nextTick()
    expect(first.get('pre').attributes('data-markstream-css-highlight')).toBe('true')
    expect(registry.size).toBeGreaterThan(0)
    expect([...registry.keys()].every(name => name.startsWith('markstream-poc-'))).toBe(true)

    const firstKeys = [...registry.keys()]
    const second = mount(CssHighlightCodeBlock, { props: { node: { ...node, loading: false } } })
    await nextTick()
    await nextTick()
    expect(registry.size).toBeGreaterThan(0)
    second.unmount()
    expect(firstKeys.every(name => registry.has(name))).toBe(true)
    first.unmount()
    expect(registry.size).toBe(0)
  })

  it('falls back when CSS Custom Highlight is unavailable', async () => {
    ;(globalThis as any).CSS = undefined
    const wrapper = mount(CssHighlightCodeBlock, {
      props: {
        node: { type: 'code_block' as const, language: 'typescript', code: 'const answer = 42', raw: 'const answer = 42', loading: false },
      },
    })
    await nextTick()
    await nextTick()
    expect(wrapper.get('pre').attributes('data-markstream-css-highlight')).toBe('false')
    expect(wrapper.get('pre').attributes('data-markstream-css-highlight-fallback')).toBe('true')
    wrapper.unmount()
  })

  it('falls back for an unsupported language', async () => {
    installHighlightApi()
    const wrapper = mount(CssHighlightCodeBlock, {
      props: {
        node: { type: 'code_block' as const, language: 'brainfuck', code: '+++.', raw: '+++.', loading: false },
      },
    })
    await nextTick()
    await nextTick()
    expect(wrapper.get('pre').attributes('data-markstream-css-highlight-fallback')).toBe('true')
    wrapper.unmount()
  })

  it('updates theme CSS without re-tokenizing', async () => {
    const { getSetCalls } = installHighlightApi()
    const wrapper = mount(CssHighlightCodeBlock, {
      props: {
        isDark: false,
        node: { type: 'code_block' as const, language: 'typescript', code: 'const answer = 42', raw: 'const answer = 42', loading: false },
      },
    })
    await nextTick()
    await nextTick()
    const initialSetCalls = getSetCalls()
    const style = document.head.querySelector('style[data-markstream-css-highlight]')
    const initialStyle = style?.textContent
    await wrapper.setProps({ isDark: true })
    await nextTick()
    expect(getSetCalls()).toBe(initialSetCalls)
    expect(style?.textContent).not.toBe(initialStyle)
    wrapper.unmount()
  })

  it('discards stale enhancement work when code changes quickly', async () => {
    const { registry } = installHighlightApi()
    const wrapper = mount(CssHighlightCodeBlock, {
      props: {
        node: { type: 'code_block' as const, language: 'typescript', code: 'const staleValue = 123456789', raw: '', loading: false },
      },
    })
    await wrapper.setProps({ node: { type: 'code_block' as const, language: 'typescript', code: 'const fresh = 1', raw: '', loading: false } })
    await nextTick()
    await nextTick()
    const ranges = [...registry.values()].flatMap((value: any) => value.ranges ?? [])
    expect(ranges.every((range: any) => range.endOffset <= 'const fresh = 1'.length)).toBe(true)
    wrapper.unmount()
  })

  it('can be selected through the scoped code_block override', async () => {
    installHighlightApi()
    setCustomComponents(customId, { code_block: CssHighlightCodeBlock })
    const wrapper = mount(NodeRenderer, {
      props: {
        customId,
        content: '```ts\nconst answer = 42\n```',
        final: true,
        batchRendering: false,
        deferNodesUntilVisible: false,
      },
    })
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-markstream-css-highlight]').exists()).toBe(true)
    wrapper.unmount()
  })
})
