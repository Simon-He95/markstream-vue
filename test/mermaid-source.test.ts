import { applyMermaidThemeDirective } from 'markstream-core'
import { describe, expect, it } from 'vitest'

const directive = '%%{init: {"theme":"dark"}}%%\n'
const diagram = 'flowchart LR\n  A --> B'

describe('mermaid theme directive placement', () => {
  it.each(['\n', '\r\n', '\r'])('preserves frontmatter with %j line endings', (newline) => {
    const header = `--- ${newline}title: Example${newline}config:${newline}  theme: forest${newline}--- ${newline}`
    expect(applyMermaidThemeDirective(header + diagram, directive)).toBe(header + directive + diagram)
    const authored = `${header}  %%{init: {"theme":"forest"}}%%\n${diagram}`
    expect(applyMermaidThemeDirective(authored, directive)).toBe(authored)
  })

  it.each(['', diagram, `\n  ${diagram}`, '---\ntitle: Example\n'])('keeps the existing prefix behavior without complete frontmatter (%j)', (code) => {
    expect(applyMermaidThemeDirective(code, directive)).toBe(directive + code)
  })

  it('preserves an author directive without frontmatter', () => {
    const code = `\n  %%{init: {"theme":"forest"}}%%\n${diagram}`
    expect(applyMermaidThemeDirective(code, directive)).toBe(code)
  })
})
