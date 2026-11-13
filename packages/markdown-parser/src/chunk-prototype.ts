import type { MarkdownIt } from './markdown-it-types'
import { parseMarkdownToStructure } from './parser'
import { getParserRuntime } from './parser/runtime'

/**
 * Experimental append-only parser with an exclusive MarkdownIt instance.
 * Each result replaces the consumer's top-level nodes from `start` onward.
 */
export function createChunkParserPrototype(md: MarkdownIt) {
  const runtime = getParserRuntime(md)
  const options = { streamParse: true, reuseStableTopLevelNodes: true, final: false }
  let source = ''
  let tokenizerAppendCalls = 0

  function parse(chunk: string, final: boolean) {
    const previous = source
    source += chunk
    options.final = final
    const update = { previous, source, chunk, start: 0, tokenStart: 0, coreSourceStart: 0 as number | null, appended: false }
    runtime.chunkUpdate = update
    try {
      const nodes = parseMarkdownToStructure(source, md, options)
      tokenizerAppendCalls += Number(update.appended)
      return { start: update.start, nodes: nodes.slice(update.start), coreSourceStart: update.coreSourceStart }
    }
    finally {
      runtime.chunkUpdate = undefined
    }
  }

  return {
    append: (chunk: string) => parse(chunk, false),
    finish: () => parse('', true),
    stats: () => ({ tokenizerAppendCalls, stream: md.stream?.stats?.() }),
  }
}
