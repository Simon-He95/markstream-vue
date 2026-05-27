import { describe, expect, it } from 'vitest'
import { parseFenceToken } from '../src'

function parseStreamingDiff(content: string, closed = false) {
  return parseFenceToken({
    type: 'fence',
    info: 'diff json:package.json',
    content,
    map: [0, 1],
    meta: { closed },
  } as any)
}

describe('parseFenceToken - streaming unified diff stability', () => {
  it('splits standard unified diff lines without requiring a space after the marker', () => {
    const node = parseFenceToken({
      type: 'fence',
      info: 'diff typescript',
      content: [
        'diff --git a/src/render.ts b/src/render.ts',
        'index 0000000..1111111 100644',
        '--- a/src/render.ts',
        '+++ b/src/render.ts',
        '@@ -1,7 +1,12 @@',
        '-export function render(input) {',
        '-  return input',
        '+export function render(input: string) {',
        '+  if (!input.trim())',
        '+    return \'empty\'',
        '+',
        '+  const normalized = input.replace(/\\r\\n/g, \'\\n\')',
        '+  return normalized',
        ' }',
      ].join('\n'),
      map: [0, 1],
      meta: { closed: true },
    } as any)

    expect(node.language).toBe('typescript')
    expect(node.originalCode).toBe([
      'export function render(input) {',
      '  return input',
      '}',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      'export function render(input: string) {',
      '  if (!input.trim())',
      '    return \'empty\'',
      '',
      '  const normalized = input.replace(/\\r\\n/g, \'\\n\')',
      '  return normalized',
      '}',
    ].join('\n'))
  })

  it('streams an unfinished removed line before the added side is available', () => {
    const node = parseStreamingDiff([
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
    ].join('\n'))

    expect(node.originalCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.49",',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      '{',
      '  "name": "markstream-vue",',
    ].join('\n'))
  })

  it('flushes a finished replacement hunk once the added line becomes stable', () => {
    const node = parseStreamingDiff([
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
      '+ "version": "0.0.54-beta.1",',
      '',
    ].join('\n'))

    expect(node.originalCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.49",',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.54-beta.1",',
    ].join('\n'))
  })

  it('streams a trailing incomplete added line before newline', () => {
    const node = parseStreamingDiff([
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
      '+ "version": "0.0.54-b',
    ].join('\n'))

    expect(node.originalCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.49",',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.54-b',
    ].join('\n'))
  })

  it('streams incomplete added lines into updatedCode before newline', () => {
    const node = parseStreamingDiff('+ con')

    expect(node.originalCode).toBe('')
    expect(node.updatedCode).toBe('  con')
  })

  it('streams incomplete removed lines into originalCode before newline', () => {
    const node = parseStreamingDiff('- oldVal')

    expect(node.originalCode).toBe('  oldVal')
    expect(node.updatedCode).toBe('')
  })

  it('does not render partial diff metadata as code while streaming', () => {
    const node = parseStreamingDiff('diff --gi')

    expect(node.originalCode).toBe('')
    expect(node.updatedCode).toBe('')
  })

  it('streams an added tail after a context line', () => {
    const node = parseStreamingDiff([
      ' const a = 1',
      '+ const b',
    ].join('\n'))

    expect(node.originalCode).toContain('const a = 1')
    expect(node.updatedCode).toContain('const a = 1')
    expect(node.updatedCode).toContain('const b')
  })

  it('flushes the trailing hunk once the fence is closed', () => {
    const node = parseStreamingDiff([
      '{',
      '  "name": "markstream-vue",',
      '- "version": "0.0.49",',
    ].join('\n'), true)

    expect(node.originalCode).toBe([
      '{',
      '  "name": "markstream-vue",',
      '  "version": "0.0.49",',
    ].join('\n'))
    expect(node.updatedCode).toBe([
      '{',
      '  "name": "markstream-vue",',
    ].join('\n'))
  })
})
