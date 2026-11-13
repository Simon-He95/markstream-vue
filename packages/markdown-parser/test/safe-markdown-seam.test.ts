import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'
import { createChunkParserPrototype } from '../src/chunk-prototype'

/**
 * Regression: the streaming safe-markdown tail window must be cut with a
 * RAW-SOURCE index, not a safeMarkdown index. Char-inserting fixes earlier in
 * the document (`\n(abla|eq|ot|exists)` / `\r(ight|ho)`) make the two index
 * spaces diverge; cutting the raw source at a safeMarkdown index silently
 * dropped/repeated characters at the seam on every subsequent commit.
 */
describe('streaming safe-markdown tail-window seam', () => {
  it('appended output matches cold parse when the prefix contains a newline-macro fix point', () => {
    const md = getMarkdown('safe-markdown-seam-1')
    const coldMd = getMarkdown('safe-markdown-seam-1')

    // `\n(abla)` fix point at the very START of the doc (before the window
    // cut ~1KB from the end), padded beyond 1040 chars so the seam lands
    // inside the padding run.
    const head = 'x\nabla y\n\n'
    const commit1 = `${head}${'b'.repeat(1050)}\n\npara one two three`
    const commit2 = `${commit1} four five six`

    parseMarkdownToStructure(commit1, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    })

    const nodes2 = parseMarkdownToStructure(commit2, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    })
    const cold2 = parseMarkdownToStructure(commit2, coldMd, { final: false, streamParse: false })

    expect(JSON.stringify(nodes2)).toBe(JSON.stringify(cold2))
  })

  it('falls back to a full transform (correct output) when the overlap region contains a fix point', () => {
    const md = getMarkdown('safe-markdown-seam-2')
    const coldMd = getMarkdown('safe-markdown-seam-2')

    // The last chars of commit1 end with `abla` on a fresh line, so the
    // append completes a `\n(abla)` fix exactly at the seam; the overlap
    // verification must fail and fall back to a full-document transform.
    const commit1 = `${'a'.repeat(1500)}\n\nabla z\n\n${'c'.repeat(50)}\n\nabla`
    const commit2 = `${commit1} y\n`

    parseMarkdownToStructure(commit1, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    })

    const nodes2 = parseMarkdownToStructure(commit2, md, {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    })
    const cold2 = parseMarkdownToStructure(commit2, coldMd, { final: false, streamParse: false })

    expect(JSON.stringify(nodes2)).toBe(JSON.stringify(cold2))
  })

  it.each([
    ['\n\n$', '$', '\n', 'f(', 'x)', '\n$', '$', '\n\nNext'],
    ['\n\n\\', '[', '\n', 'f(', 'x)', '\n\\', ']', '\n\nNext'],
    ['\n\nWord\r', 'ight', '\n\nNext'],
  ])('keeps chunk and string ASTs aligned through a tail rewrite (%s)', (...chunks) => {
    const parser = createChunkParserPrototype(getMarkdown('safe-window'))
    const oracle = getMarkdown('safe-window')
    const options = { streamParse: true, reuseStableTopLevelNodes: true }
    let source = ''
    let nodes: ReturnType<typeof parseMarkdownToStructure> = []
    for (const chunk of ['Ordinary paragraph.\n\n'.repeat(60), 'Warm-up', ' text', ...chunks]) {
      source += chunk
      const update = parser.append(chunk)
      nodes = nodes.slice(0, update.start).concat(update.nodes)
      expect(nodes).toEqual(parseMarkdownToStructure(source, oracle, { ...options, final: false }))
    }
    const update = parser.finish()
    expect(nodes.slice(0, update.start).concat(update.nodes))
      .toEqual(parseMarkdownToStructure(source, oracle, { ...options, final: true }))
  })
})
