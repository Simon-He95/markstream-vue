import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const codeBlockSource = readFileSync(
  resolve(process.cwd(), 'packages/markstream-svelte/src/components/CodeBlockNode.svelte'),
  'utf8',
)
const playgroundSource = readFileSync(
  resolve(process.cwd(), 'playground-svelte/src/App.svelte'),
  'utf8',
)

describe('markstream-svelte code block handoff geometry', () => {
  it('uses the same default font family for the fallback and highlighted surface', () => {
    expect(codeBlockSource).toContain(
      'const defaultPreFallbackFontFamily = \'"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace\'',
    )
    expect(codeBlockSource).toContain('const fontFamily = getCodeFontFamily()')
    expect(codeBlockSource).toContain('fontFamily: getCodeFontFamily()')
  })

  it('reserves the fallback two-character line-number column in stream-diffs', () => {
    const gutterRule = '--diffs-min-number-column-width-default: 2ch !important'
    expect(codeBlockSource).toContain(gutterRule)
    expect(codeBlockSource.indexOf(gutterRule)).toBeLessThan(
      codeBlockSource.lastIndexOf('configuredUnsafeCSS'),
    )
  })

  it('does not add a pixel to the single-editor height', () => {
    const heightFunctionStart = codeBlockSource.indexOf('function computeEditorContentHeight()')
    const singleEditorBranchStart = codeBlockSource.indexOf('const editor = helpers?.getEditorView?.()', heightFunctionStart)
    const singleEditorHeightBranch = codeBlockSource.slice(
      singleEditorBranchStart,
      codeBlockSource.indexOf('catch {}', singleEditorBranchStart),
    )

    expect(singleEditorHeightBranch).toContain('return Math.ceil(height)')
    expect(singleEditorHeightBranch).not.toContain('return Math.ceil(height + 1)')
  })

  it('disables node enter fades on both handoff comparison renderers', () => {
    const handoffTemplate = playgroundSource.slice(
      playgroundSource.indexOf('{#if currentPath === LINE_NUMBER_HANDOFF_PATH}'),
      playgroundSource.indexOf('{:else}', playgroundSource.indexOf('{#if currentPath === LINE_NUMBER_HANDOFF_PATH}')),
    )

    expect(handoffTemplate.match(/fade=\{false\}/g)).toHaveLength(2)
  })
})
