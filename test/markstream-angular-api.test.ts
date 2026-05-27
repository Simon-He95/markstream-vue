import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveParsedNodes } from '../packages/markstream-angular/src/components/shared/node-helpers'
import {
  clearGlobalCustomComponents,
  getCustomNodeComponents,
  removeCustomComponents,
  setCustomComponents,
} from '../packages/markstream-angular/src/customComponents'
import {
  disableKatex,
  enableKatex,
  isKatexEnabled,
  setKatexLoader,
} from '../packages/markstream-angular/src/optional/katex'
import {
  disableMermaid,
  enableMermaid,
  isMermaidEnabled,
  setMermaidLoader,
} from '../packages/markstream-angular/src/optional/mermaid'
import { buildKaTeXCDNWorkerSource } from '../packages/markstream-angular/src/workers/katexCdnWorker'
import { buildMermaidCDNWorkerSource } from '../packages/markstream-angular/src/workers/mermaidCdnWorker'

describe('markstream-angular api parity helpers', () => {
  it('merges global and scoped custom components like react/vue2', () => {
    const GlobalCode = class {}
    const ScopedThinking = class {}

    clearGlobalCustomComponents()
    setCustomComponents({ code_block: GlobalCode as any })
    setCustomComponents('scope-a', { thinking: ScopedThinking as any })

    expect(getCustomNodeComponents()).toMatchObject({
      code_block: GlobalCode,
    })
    expect(getCustomNodeComponents('scope-a')).toMatchObject({
      code_block: GlobalCode,
      thinking: ScopedThinking,
    })

    removeCustomComponents('scope-a')
    clearGlobalCustomComponents()
    expect(getCustomNodeComponents('scope-a')).toEqual({})
  })

  it('supports toggling katex and mermaid loaders', () => {
    const katexLoader = () => ({ renderToString: () => '<span />' })
    const mermaidLoader = () => ({
      render: async () => ({ svg: '<svg />' }),
      initialize() {},
    })

    disableKatex()
    disableMermaid()
    expect(isKatexEnabled()).toBe(false)
    expect(isMermaidEnabled()).toBe(false)

    enableKatex(katexLoader)
    enableMermaid(mermaidLoader)
    expect(isKatexEnabled()).toBe(true)
    expect(isMermaidEnabled()).toBe(true)

    setKatexLoader(null)
    setMermaidLoader(null)
    expect(isKatexEnabled()).toBe(false)
    expect(isMermaidEnabled()).toBe(false)

    enableKatex()
    enableMermaid()
  })

  it('passes customHtmlTags through top-level streaming parsing', () => {
    const nodes = resolveParsedNodes({
      content: '<thinking>我们需要给出一个全面的回答',
      final: false,
      customHtmlTags: ['thinking'],
    })

    expect(nodes).toHaveLength(1)
    expect((nodes[0] as any)?.type).toBe('thinking')
    expect((nodes[0] as any)?.loading).toBe(true)
    expect(String((nodes[0] as any)?.content || '')).toContain('全面的回答')
  })

  it('keeps footnote ids and anchors in sync', () => {
    const footnoteSource = readFileSync(resolve(process.cwd(), 'packages/markstream-angular/src/components/FootnoteNode/FootnoteNode.component.ts'), 'utf8')
    const referenceSource = readFileSync(resolve(process.cwd(), 'packages/markstream-angular/src/components/FootnoteReferenceNode/FootnoteReferenceNode.component.ts'), 'utf8')
    const anchorSource = readFileSync(resolve(process.cwd(), 'packages/markstream-angular/src/components/FootnoteAnchorNode/FootnoteAnchorNode.component.ts'), 'utf8')

    expect(footnoteSource).toMatch(/return `fnref--\$\{getString\(\(this\.node as any\)\?\.id\)\}`/)
    expect(referenceSource).toContain('[attr.id]="referenceId"')
    expect(referenceSource).toMatch(/return `#fnref--\$\{this\.id\}`/)
    expect(referenceSource).toMatch(/return `fnref-\$\{this\.id\}`/)
    expect(anchorSource).toMatch(/return `#fnref-\$\{this\.id\}`/)
  })

  it('keeps streaming thinking content grouped across mixed markdown prefixes', () => {
    const source = `<thinking>
我们需要给出一个全面的回答，可能包括不同的实现方法及其分析。

$x = a$

- 递归
- 动态规划
`

    for (const size of [16, 36, 72, source.length]) {
      const nodes = resolveParsedNodes({
        content: source.slice(0, size),
        final: false,
        customHtmlTags: ['thinking'],
      })

      expect(nodes).toHaveLength(1)
      expect((nodes[0] as any)?.type).toBe('thinking')
      expect(String((nodes[0] as any)?.content || '')).not.toContain('<thinking>')
    }
  })

  it('exposes worker helper source builders for katex and mermaid parity', () => {
    const katexSource = buildKaTeXCDNWorkerSource({
      katexUrl: 'https://cdn.example.com/katex.mjs',
      mode: 'module',
    })
    const mermaidSource = buildMermaidCDNWorkerSource({
      mermaidUrl: 'https://cdn.example.com/mermaid.mjs',
      mode: 'module',
    })

    expect(katexSource).toContain('renderToString')
    expect(katexSource).toContain('postMessage')
    expect(mermaidSource).toContain('findPrefix')
    expect(mermaidSource).toContain('canParse')
  })
})
