import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CodeBlockNode,
  MarkdownRender,
  NodeRenderer,
  resetCodeBlockRuntimeReadyForTest,
  SolidCodeBlockNode,
  useSmoothMarkdownStream,
} from '../src/index'

describe('markstream-solid public export classification', () => {
  it('keeps product aliases and the documented test hook on the real package entry', () => {
    expect(MarkdownRender).toBe(NodeRenderer)
    expect(SolidCodeBlockNode).toBe(CodeBlockNode)
    expect(typeof resetCodeBlockRuntimeReadyForTest).toBe('function')
    expect(typeof useSmoothMarkdownStream).toBe('function')
  })

  it('documents unwired virtualization props as compatibility no-ops in the shipped props type', () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/node-helpers.ts'), 'utf8')
    expect(source).toContain('Compatibility no-op: the main Solid renderer does not attach a performance monitor')
    expect(source).toContain('Compatibility no-op: render-window virtualization is exported as a tool, not used by NodeRenderer')
    expect(source).toContain('Compatibility no-op: nodes are not deferred with IntersectionObserver')
    expect(source).toContain('Compatibility no-op: virtualization window is not used by the main renderer')
  })
})
