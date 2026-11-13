import type { ExplicitBracketMathContext, ExplicitBracketMathStreamState, ParserRuntime } from '../runtime'
import { normalizeCustomHtmlTags } from '../../customHtmlTags'
import { STANDARD_BLOCK_HTML_TAGS } from '../../htmlTags'
import { findTagCloseIndexOutsideQuotes } from '../../htmlTagUtils'
import { isMathLike } from '../../plugins/isMathLike'
import {
  getTolerantMathBlockBoundaryStreamKey,
  hasMarkstreamMathPlugin,
  mayContainTolerantMathBlockBoundaryOpener,
} from '../../plugins/math'
import {
  consumeMarkdownIndent,
  countRepeatedChar,
  findCodeSpanCloseIndex,
  getMarkdownIndent,
  isEscapedDelimiterAt,
  matchMarkdownFenceMarker,
  stripMarkdownBlockquotePrefix,
  stripMarkdownListPrefix,
} from '../markdown-context'

const TOLERANT_BOUNDARY_SPLIT_OPENERS = ['$', '\\[']
const STREAMING_ADMONITION_OPEN_RE = /(^|\r?\n)[\t ]*:::[\t ]*(?:warning|info|note|tip|danger|caution|error)(?=[\t ]|\r?\n|$)[^\r\n]*(?:\r?\n[\t ]*)*$/
type TolerantBoundaryScanWindowCache = NonNullable<ParserRuntime['tolerantMathBoundary']>['scanWindow']

function createExplicitBracketMathContext(): ExplicitBracketMathContext {
  return {
    fenceChar: '',
    fenceInBlockquote: false,
    fenceInList: false,
    fenceLen: 0,
    fenceListIndent: 0,
    inDollarMath: false,
    inFence: false,
    inMath: false,
    listContentIndent: null,
    dollarMathOpenOffset: null,
    mathOpenOffset: null,
  }
}

function cloneExplicitBracketMathContext(context: ExplicitBracketMathContext): ExplicitBracketMathContext {
  return { ...context }
}

function setTolerantMathBoundaryStreamCache(
  runtime: ParserRuntime,
  source: string,
  key: string | null,
  explicitBracketMath: ExplicitBracketMathStreamState = scanExplicitBracketMathStreamState(source).state,
  scanWindow: TolerantBoundaryScanWindowCache = { lineOffset: 0, windowStart: 0 },
) {
  runtime.tolerantMathBoundary = {
    explicitBracketMath,
    source,
    key,
    pendingCandidate: key === null && mayContainTolerantMathBlockBoundaryOpener(source, scanWindow),
    scanWindow,
  }
}

function sourceEndsWithSplitTolerantBoundaryPrefix(source: string) {
  return source.endsWith('$') || source.endsWith('\\')
}

function sourceEndsWithCompleteTolerantBoundaryOpener(source: string) {
  const lastLineStart = Math.max(source.lastIndexOf('\n') + 1, 0)
  const lastLine = source.slice(lastLineStart).replace(/[\t ]+$/, '')
  return TOLERANT_BOUNDARY_SPLIT_OPENERS.some(open => lastLine.endsWith(open))
}

function appendedChunkMayAffectTolerantMathBoundary(previousSource: string, appended: string) {
  if (!appended)
    return false

  if (appended.includes('$$') || appended.includes('\\['))
    return true

  if (previousSource.endsWith('$') && appended[0] === '$')
    return true

  if (previousSource.endsWith('\\') && appended[0] === '[')
    return true

  // The opener may have arrived in the previous chunk:
  //
  //   "prefix $$" + "\na = 1"
  //   "prefix \\[" + "\nx + y = z"
  if (sourceEndsWithCompleteTolerantBoundaryOpener(previousSource) && /[\r\n]/.test(appended))
    return true

  return false
}

export function isInsideOpenMarkdownFenceBeforeOffset(markdown: string, offset: number) {
  let inFence = false
  let fenceChar: '`' | '~' | '' = ''
  let fenceLen = 0
  let fenceInBlockquote = false
  let fenceInList = false
  let fenceListIndent = 0
  let listContentIndent: number | null = null
  let index = 0

  while (index < offset) {
    const newlineIndex = markdown.indexOf('\n', index)
    const lineEnd = newlineIndex === -1 || newlineIndex >= offset ? offset : newlineIndex
    const rawLine = markdown.slice(index, lineEnd)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const lineIndent = getMarkdownIndent(line)
    const listPrefix = stripMarkdownListPrefix(line)

    if (inFence && fenceInBlockquote && line.trim() && stripMarkdownBlockquotePrefix(line) == null) {
      inFence = false
      fenceChar = ''
      fenceLen = 0
      fenceInBlockquote = false
      fenceInList = false
      fenceListIndent = 0
    }

    if (
      inFence
      && fenceInList
      && line.trim()
      && lineIndent.column < fenceListIndent
      && !listPrefix
    ) {
      inFence = false
      fenceChar = ''
      fenceLen = 0
      fenceInBlockquote = false
      fenceInList = false
      fenceListIndent = 0
    }

    if (listPrefix) {
      listContentIndent = listPrefix.contentIndent
    }
    else if (line.trim() && listContentIndent != null && lineIndent.column < listContentIndent && !inFence) {
      listContentIndent = null
    }

    const fenceMatch = matchMarkdownFenceMarker(line)
    if (fenceMatch) {
      if (inFence) {
        if (
          fenceMatch.markerChar === fenceChar
          && fenceMatch.markerLen >= fenceLen
          && /^\s*$/.test(fenceMatch.rest)
        ) {
          inFence = false
          fenceChar = ''
          fenceLen = 0
          fenceInBlockquote = false
          fenceInList = false
          fenceListIndent = 0
        }
      }
      else {
        inFence = true
        fenceChar = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
        fenceInBlockquote = fenceMatch.inBlockquote
        fenceInList = fenceMatch.inList
          || (
            listContentIndent != null
            && !fenceMatch.inBlockquote
            && lineIndent.column >= listContentIndent
          )
        fenceListIndent = fenceMatch.listIndent || listContentIndent || 0
      }
    }

    if (newlineIndex === -1 || newlineIndex >= offset)
      break
    index = newlineIndex + 1
  }

  return inFence
}

function isInsideOpenStandardHtmlBlockBeforeOffset(markdown: string, offset: number) {
  const isWs = (ch: string) => ch === ' ' || ch === '\t'
  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90)
      || (c >= 97 && c <= 122)
      || (c >= 48 && c <= 57)
      || ch === '_'
      || ch === '-'
      || ch === ':'
    )
  }
  const parseLineStartTag = (line: string) => {
    if (line[0] !== '<')
      return null

    let index = 1
    while (index < line.length && isWs(line[index]))
      index++

    const closing = line[index] === '/'
    if (closing) {
      index++
      while (index < line.length && isWs(line[index]))
        index++
    }

    const nameStart = index
    while (index < line.length && isNameChar(line[index]))
      index++
    if (index === nameStart)
      return null

    const tag = line.slice(nameStart, index).toLowerCase()
    if (!STANDARD_BLOCK_HTML_TAGS.has(tag))
      return null

    const boundary = line[index]
    if (boundary && boundary !== ' ' && boundary !== '\t' && boundary !== '>' && boundary !== '/')
      return null

    const tagEnd = findTagCloseIndexOutsideQuotes(line)
    if (tagEnd === -1)
      return null

    let beforeEnd = tagEnd - 1
    while (beforeEnd >= 0 && isWs(line[beforeEnd]))
      beforeEnd--

    return {
      closing,
      tag,
      selfClosing: !closing && line[beforeEnd] === '/',
      after: line.slice(tagEnd + 1),
    }
  }
  const hasSameLineClose = (line: string, tag: string) => {
    const lower = line.toLowerCase()
    let index = 0
    while (index < lower.length) {
      const closeStart = lower.indexOf('</', index)
      if (closeStart === -1)
        return false
      index = closeStart + 2
      while (index < lower.length && isWs(lower[index]))
        index++
      if (lower.startsWith(tag, index)) {
        const boundary = lower[index + tag.length]
        if (!boundary || boundary === ' ' || boundary === '\t' || boundary === '>')
          return true
      }
    }
    return false
  }

  const stack: string[] = []
  let inComment = false
  let inDeclaration = false
  let inProcessingInstruction = false
  let index = 0

  while (index < offset) {
    const newlineIndex = markdown.indexOf('\n', index)
    const lineEnd = newlineIndex === -1 || newlineIndex >= offset ? offset : newlineIndex
    const rawLine = markdown.slice(index, lineEnd)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const indent = consumeMarkdownIndent(line)
    if (indent) {
      const rest = line.slice(indent.index)
      if (inComment) {
        inComment = !rest.includes('-->')
      }
      else if (inDeclaration) {
        inDeclaration = !rest.includes('>')
      }
      else if (inProcessingInstruction) {
        inProcessingInstruction = !rest.includes('?>')
      }
      else if (rest.startsWith('<!--')) {
        inComment = !rest.includes('-->')
      }
      else if (rest.startsWith('<?')) {
        inProcessingInstruction = !rest.includes('?>')
      }
      else if (rest.startsWith('<!')) {
        inDeclaration = !rest.includes('>')
      }
      else {
        const tagInfo = parseLineStartTag(rest)
        if (tagInfo) {
          if (tagInfo.closing) {
            for (let i = stack.length - 1; i >= 0; i--) {
              if (stack[i] === tagInfo.tag) {
                stack.length = i
                break
              }
            }
          }
          else if (!tagInfo.selfClosing) {
            if (!hasSameLineClose(tagInfo.after, tagInfo.tag))
              stack.push(tagInfo.tag)
          }
        }
      }
    }

    if (newlineIndex === -1 || newlineIndex >= offset)
      break
    index = newlineIndex + 1
  }

  return inComment || inDeclaration || inProcessingInstruction || stack.length > 0
}

function isInsideOpenCustomHtmlBlockBeforeOffset(markdown: string, offset: number, customHtmlTags?: readonly string[]) {
  if (!customHtmlTags?.length)
    return false

  const tagSet = new Set(normalizeCustomHtmlTags(customHtmlTags))
  if (!tagSet.size)
    return false

  const isNameChar = (ch: string) => {
    const c = ch.charCodeAt(0)
    return (
      (c >= 65 && c <= 90)
      || (c >= 97 && c <= 122)
      || (c >= 48 && c <= 57)
      || ch === '_'
      || ch === '-'
      || ch === ':'
    )
  }
  const isWs = (ch: string) => ch === ' ' || ch === '\t'
  const parseLineStartTag = (line: string) => {
    if (line[0] !== '<')
      return null

    let index = 1
    while (index < line.length && isWs(line[index]))
      index++

    const closing = line[index] === '/'
    if (closing) {
      index++
      while (index < line.length && isWs(line[index]))
        index++
    }

    const nameStart = index
    while (index < line.length && isNameChar(line[index]))
      index++
    if (index === nameStart)
      return null

    const tag = line.slice(nameStart, index).toLowerCase()
    if (!tagSet.has(tag))
      return null

    const boundary = line[index]
    if (boundary && boundary !== ' ' && boundary !== '\t' && boundary !== '>' && boundary !== '/')
      return null

    const tagEnd = line.indexOf('>', index)
    if (tagEnd === -1)
      return null

    let beforeEnd = tagEnd - 1
    while (beforeEnd >= 0 && isWs(line[beforeEnd]))
      beforeEnd--

    return {
      closing,
      tag,
      selfClosing: !closing && line[beforeEnd] === '/',
      after: line.slice(tagEnd + 1),
    }
  }
  const hasSameLineClose = (line: string, tag: string) => {
    const lower = line.toLowerCase()
    let index = 0
    while (index < lower.length) {
      const closeStart = lower.indexOf('</', index)
      if (closeStart === -1)
        return false
      index = closeStart + 2
      while (index < lower.length && isWs(lower[index]))
        index++
      if (lower.startsWith(tag, index)) {
        const boundary = lower[index + tag.length]
        if (!boundary || boundary === ' ' || boundary === '\t' || boundary === '>')
          return true
      }
    }
    return false
  }

  const stack: string[] = []
  let index = 0

  while (index < offset) {
    const newlineIndex = markdown.indexOf('\n', index)
    const lineEnd = newlineIndex === -1 || newlineIndex >= offset ? offset : newlineIndex
    const rawLine = markdown.slice(index, lineEnd)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const indent = consumeMarkdownIndent(line)
    if (indent) {
      const rest = line.slice(indent.index)
      const tagInfo = parseLineStartTag(rest)
      if (tagInfo) {
        if (tagInfo.closing) {
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i] === tagInfo.tag) {
              stack.length = i
              break
            }
          }
        }
        else if (!tagInfo.selfClosing) {
          if (!hasSameLineClose(tagInfo.after, tagInfo.tag))
            stack.push(tagInfo.tag)
        }
      }
    }

    if (newlineIndex === -1 || newlineIndex >= offset)
      break
    index = newlineIndex + 1
  }

  return stack.length > 0
}

export function getStreamingAdmonitionOpenTailReplacement(markdown: string, customHtmlTags?: readonly string[]) {
  const match = STREAMING_ADMONITION_OPEN_RE.exec(markdown)
  if (!match)
    return null

  const separator = match[1] ?? ''
  const lineStart = match.index + separator.length
  const lineEnd = markdown.indexOf('\n', lineStart)
  const rawLine = markdown.slice(lineStart, lineEnd === -1 ? markdown.length : lineEnd)
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
  if (!consumeMarkdownIndent(line))
    return null

  if (isInsideOpenMarkdownFenceBeforeOffset(markdown, lineStart))
    return null

  if (isInsideOpenStandardHtmlBlockBeforeOffset(markdown, lineStart))
    return null

  if (isInsideOpenCustomHtmlBlockBeforeOffset(markdown, lineStart, customHtmlTags))
    return null

  return `${markdown.slice(0, match.index)}${separator}`
}

function resetExplicitBracketFenceContext(context: ExplicitBracketMathContext) {
  context.inFence = false
  context.fenceChar = ''
  context.fenceLen = 0
  context.fenceInBlockquote = false
  context.fenceInList = false
  context.fenceListIndent = 0
}

function scanLineForExplicitBracketMathState(
  line: string,
  context: ExplicitBracketMathContext,
  lineStart: number,
  appendStart: number | null,
  openAtAppendStart: boolean,
) {
  let index = 0
  let closedOpenMath = false

  while (index < line.length) {
    const sourceIndex = index

    if (context.inMath) {
      if (line.startsWith('\\]', index) && !isEscapedDelimiterAt(line, sourceIndex)) {
        if (appendStart != null && openAtAppendStart && lineStart + index + 2 > appendStart)
          closedOpenMath = true
        context.inMath = false
        context.mathOpenOffset = null
        index += 2
        continue
      }

      index++
      continue
    }

    if (context.inDollarMath) {
      if (line.startsWith('$$', index) && !isEscapedDelimiterAt(line, sourceIndex)) {
        if (appendStart != null && openAtAppendStart && lineStart + index + 2 > appendStart)
          closedOpenMath = true
        context.inDollarMath = false
        context.dollarMathOpenOffset = null
        index += 2
        continue
      }

      index++
      continue
    }

    if (line[index] === '`' && !isEscapedDelimiterAt(line, sourceIndex)) {
      const markerLen = countRepeatedChar(line, index, '`')
      const closeIndex = findCodeSpanCloseIndex(line, index + markerLen, markerLen)
      if (closeIndex === -1)
        break
      index = closeIndex + markerLen
      continue
    }

    if (line.startsWith('\\[', index) && !isEscapedDelimiterAt(line, sourceIndex)) {
      context.inMath = true
      context.mathOpenOffset = lineStart + index
      index += 2
      continue
    }

    if (line.startsWith('$$', index) && !isEscapedDelimiterAt(line, sourceIndex)) {
      context.inDollarMath = true
      context.dollarMathOpenOffset = lineStart + index
      index += 2
      continue
    }

    index++
  }

  return closedOpenMath
}

export function stripPendingExplicitMathTail(markdown: string, runtime: ParserRuntime, useCache = true) {
  const md = runtime.markdownIt
  if (!hasMarkstreamMathPlugin(md))
    return markdown

  const previous = useCache ? runtime.pendingExplicitMathTail : undefined
  const state = previous?.source === markdown
    ? previous.state
    : previous && runtime.sourceExtends(previous.source, markdown)
      ? updateExplicitBracketMathStreamState(
        previous.state,
        runtime.getSafeChunk(previous.source, markdown) ?? markdown.slice(previous.source.length),
        previous.source.length - previous.state.lineBuffer.length,
      ).state
      : scanExplicitBracketMathStreamState(markdown).state
  if (useCache)
    runtime.pendingExplicitMathTail = { source: markdown, state }

  const { context } = state
  const openOffset = context.inMath
    ? context.mathOpenOffset
    : context.inDollarMath ? context.dollarMathOpenOffset : null
  if (openOffset == null)
    return markdown

  const content = markdown.slice(openOffset + 2)
  const lineStart = markdown.lastIndexOf('\n', openOffset - 1) + 1
  const startsBlockLine = markdown.slice(lineStart, openOffset).trim() === ''
  if (!startsBlockLine && !/^\r?\n/.test(content))
    return markdown
  if (/^\s*!\[/.test(content))
    return markdown

  const stripped = content.trim()
  const weakSingleVariable = /^(?:[a-z]|pi)$/i.test(stripped)
  if (isMathLike(content) && !weakSingleVariable)
    return markdown

  return markdown.slice(0, openOffset)
}

function scanExplicitBracketMathLine(
  line: string,
  context: ExplicitBracketMathContext,
  lineStart: number,
  appendStart: number | null,
  openAtAppendStart: boolean,
) {
  const lineIndent = getMarkdownIndent(line)
  const listPrefix = stripMarkdownListPrefix(line)

  if (context.inFence && context.fenceInBlockquote && line.trim() && stripMarkdownBlockquotePrefix(line) == null)
    resetExplicitBracketFenceContext(context)

  if (
    context.inFence
    && context.fenceInList
    && line.trim()
    && lineIndent.column < context.fenceListIndent
    && !listPrefix
  ) {
    resetExplicitBracketFenceContext(context)
  }

  if (listPrefix) {
    context.listContentIndent = listPrefix.contentIndent
  }
  else if (
    line.trim()
    && context.listContentIndent != null
    && lineIndent.column < context.listContentIndent
    && !context.inFence
  ) {
    context.listContentIndent = null
  }

  if (!context.inMath && !context.inDollarMath) {
    const fenceMatch = matchMarkdownFenceMarker(line)
    if (fenceMatch) {
      if (context.inFence) {
        if (
          fenceMatch.markerChar === context.fenceChar
          && fenceMatch.markerLen >= context.fenceLen
          && /^\s*$/.test(fenceMatch.rest)
        ) {
          resetExplicitBracketFenceContext(context)
        }
      }
      else {
        context.inFence = true
        context.fenceChar = fenceMatch.markerChar
        context.fenceLen = fenceMatch.markerLen
        context.fenceInBlockquote = fenceMatch.inBlockquote
        context.fenceInList = fenceMatch.inList
          || (
            context.listContentIndent != null
            && !fenceMatch.inBlockquote
            && lineIndent.column >= context.listContentIndent
          )
        context.fenceListIndent = fenceMatch.listIndent || context.listContentIndent || 0
      }
    }
    else if (!context.inFence) {
      return scanLineForExplicitBracketMathState(line, context, lineStart, appendStart, openAtAppendStart)
    }
  }
  else {
    return scanLineForExplicitBracketMathState(line, context, lineStart, appendStart, openAtAppendStart)
  }

  return false
}

function scanExplicitBracketMathStreamState(
  source: string,
  initialContext: ExplicitBracketMathContext = createExplicitBracketMathContext(),
  appendStart: number | null = null,
  openAtAppendStart = false,
  sourceOffset = 0,
) {
  const context = cloneExplicitBracketMathContext(initialContext)
  let committedContext = cloneExplicitBracketMathContext(initialContext)
  let lineBuffer = ''
  let closedOpenMath = false
  let index = 0

  while (index < source.length) {
    const newlineIndex = source.indexOf('\n', index)
    const hasNewline = newlineIndex !== -1
    const lineEnd = hasNewline && newlineIndex > index && source[newlineIndex - 1] === '\r'
      ? newlineIndex - 1
      : hasNewline ? newlineIndex : source.length
    const line = source.slice(index, lineEnd)

    if (scanExplicitBracketMathLine(line, context, sourceOffset + index, appendStart, openAtAppendStart))
      closedOpenMath = true

    if (hasNewline) {
      committedContext = cloneExplicitBracketMathContext(context)
      lineBuffer = ''
    }
    else {
      lineBuffer = line
    }

    index = hasNewline ? newlineIndex + 1 : source.length
  }

  return {
    closedOpenMath,
    state: {
      committedContext,
      context,
      lineBuffer,
    },
  }
}

function updateExplicitBracketMathStreamState(
  previous: ExplicitBracketMathStreamState,
  appended: string,
  lineBufferStartOffset = 0,
) {
  if (
    appended
    && !previous.context.inMath
    && !previous.context.inDollarMath
    && !previous.context.inFence
    && !previous.committedContext.inFence
    && !/[\\$`~\r\n]/.test(appended)
    && !(previous.lineBuffer.endsWith('\\') && (appended[0] === '[' || appended[0] === ']'))
  ) {
    return {
      closedOpenMath: false,
      state: {
        committedContext: cloneExplicitBracketMathContext(previous.committedContext),
        context: cloneExplicitBracketMathContext(previous.context),
        lineBuffer: previous.lineBuffer + appended,
      },
    }
  }

  return scanExplicitBracketMathStreamState(
    previous.lineBuffer + appended,
    previous.committedContext,
    lineBufferStartOffset + previous.lineBuffer.length,
    previous.context.inMath || previous.context.inDollarMath,
    lineBufferStartOffset,
  )
}

export function syncTolerantMathBoundaryStreamCache(runtime: ParserRuntime, source: string) {
  const md = runtime.markdownIt
  if (!hasMarkstreamMathPlugin(md))
    return

  const stream = md.stream
  if (typeof stream?.reset !== 'function')
    return

  const previous = runtime.tolerantMathBoundary

  if (previous?.source === source)
    return

  const sourceExtendsPrevious = previous ? runtime.sourceExtends(previous.source, source) : false
  const safeChunk = previous && runtime.getSafeChunk(previous.source, source)
  const appended = sourceExtendsPrevious && previous
    ? safeChunk ?? source.slice(previous.source.length)
    : ''
  const explicitBracketMathUpdate = sourceExtendsPrevious && previous
    ? updateExplicitBracketMathStreamState(
        previous.explicitBracketMath,
        appended,
        previous.source.length - previous.explicitBracketMath.lineBuffer.length,
      )
    : scanExplicitBracketMathStreamState(source)
  const nextExplicitBracketMath = explicitBracketMathUpdate.state
  const completesExplicitBracketMathClose = sourceExtendsPrevious && previous
    ? explicitBracketMathUpdate.closedOpenMath
    : false

  if (previous && sourceExtendsPrevious) {
    const previousTail = safeChunk === undefined ? previous.source : previous.explicitBracketMath.lineBuffer
    if (
      previous.key === null
      && previous.pendingCandidate === false
      && !completesExplicitBracketMathClose
      && !appendedChunkMayAffectTolerantMathBoundary(previousTail, appended)
      && !sourceEndsWithSplitTolerantBoundaryPrefix(safeChunk ?? source)
    ) {
      previous.source = source
      previous.explicitBracketMath = nextExplicitBracketMath
      return
    }
  }

  const scanWindow = sourceExtendsPrevious && previous
    ? previous.scanWindow
    : { lineOffset: 0, windowStart: 0 }
  const nextKey = getTolerantMathBlockBoundaryStreamKey(source, scanWindow)
  const sourceWasReplaced = previous ? !sourceExtendsPrevious : false

  if (previous && (sourceWasReplaced || previous.key !== nextKey || completesExplicitBracketMathClose))
    runtime.resetStreamOnly()
  else if (!previous && nextKey)
    runtime.resetStreamOnly()

  setTolerantMathBoundaryStreamCache(runtime, source, nextKey, nextExplicitBracketMath, scanWindow)
}

export function shouldUseSyncParseForPendingTolerantMathBoundary(runtime: ParserRuntime) {
  const cache = runtime.tolerantMathBoundary
  return typeof cache?.key === 'string' && cache.key.startsWith('pending:')
}

export function createLatexSplitMathScanner(source: string) {
  let inFence = false
  let fenceMarker: '`' | '~' | '' = ''
  let fenceLen = 0
  let inDollarBlock = false
  let inBracketMath = false
  let singleDollarOpen = false
  let scanned = 0

  const processLine = (line: string, _lineStartOffset: number) => {
    const fenceMatch = matchMarkdownFenceMarker(line)
    if (fenceMatch) {
      if (inFence) {
        if (fenceMatch.markerChar === fenceMarker && fenceMatch.markerLen >= fenceLen && /^\s*$/.test(fenceMatch.rest)) {
          inFence = false
          fenceMarker = ''
          fenceLen = 0
        }
      }
      else {
        inFence = true
        fenceMarker = fenceMatch.markerChar
        fenceLen = fenceMatch.markerLen
      }
      return
    }

    if (inFence)
      return

    let i = 0
    while (i < line.length) {
      if (inDollarBlock) {
        if (line.startsWith('$$', i) && !isEscapedDelimiterAt(line, i)) {
          inDollarBlock = false
          i += 2
        }
        else {
          i++
        }
        continue
      }

      if (inBracketMath) {
        if (line.startsWith('\\]', i) && !isEscapedDelimiterAt(line, i)) {
          inBracketMath = false
          i += 2
        }
        else {
          i++
        }
        continue
      }

      const ch = line[i]
      if (ch === '`') {
        const runLen = countRepeatedChar(line, i, '`')
        const closeIndex = findCodeSpanCloseIndex(line, i + runLen, runLen)
        if (closeIndex === -1)
          break // unclosed span: the rest of the line is code
        i = closeIndex + runLen
        continue
      }

      if (ch === '\\') {
        const next = line[i + 1]
        if (next === '[' && !isEscapedDelimiterAt(line, i)) {
          inBracketMath = true
          i += 2
        }
        else if (next === ']' && !isEscapedDelimiterAt(line, i) && !inBracketMath) {
          i += 2
        }
        else {
          i += 2 // escaped char (\$, \`, \\, ...)
        }
        continue
      }

      if (ch === '$') {
        if (line[i + 1] === '$' && !isEscapedDelimiterAt(line, i)) {
          inDollarBlock = true
          singleDollarOpen = false
          i += 2
          continue
        }
        if (singleDollarOpen) {
          singleDollarOpen = false
          i++
          continue
        }
        // Opener when followed by non-whitespace, or at end of line (a split
        // can land right after the opener). A $ followed by a digit is
        // currency in prose ("$5 total") and must not open math.
        const after = line[i + 1]
        if (after === undefined || ((after !== ' ' && after !== '\t') && !/\d/.test(after)))
          singleDollarOpen = true
        i++
        continue
      }

      i++
    }
  }

  const scanTo = (target: number) => {
    while (scanned < target) {
      const newlineIndex = source.indexOf('\n', scanned)
      const lineEndRaw = newlineIndex === -1 || newlineIndex >= target ? target : newlineIndex
      const lineEnd = lineEndRaw > scanned && source[lineEndRaw - 1] === '\r' ? lineEndRaw - 1 : lineEndRaw
      const line = source.slice(scanned, lineEnd)
      processLine(line, scanned)
      if (newlineIndex === -1 || newlineIndex >= target) {
        scanned = target
        break
      }
      singleDollarOpen = false // single-$ math never spans a line
      scanned = newlineIndex + 1
    }
  }

  return {
    scanTo,
    inMath: () => inDollarBlock || inBracketMath || singleDollarOpen,
  }
}
