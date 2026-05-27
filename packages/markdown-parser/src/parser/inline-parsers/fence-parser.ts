import type { CodeBlockNode, MarkdownToken } from '../../types'

// Strip a final line that looks like a fence marker (``` etc.)
const TRAILING_FENCE_LINE_RE = /\r?\n[ \t]*`+\s*$/
// Unified diff metadata/header line prefixes to skip when splitting a diff
const DIFF_HEADER_PREFIXES = ['diff ', 'index ', '--- ', '+++ ', '@@ ']
// Newline splitter reused in this module
const NEWLINE_RE = /\r?\n/

function isPotentialDiffMetadataTail(line: string) {
  const value = String(line ?? '')

  if (!value)
    return false

  return DIFF_HEADER_PREFIXES.some(prefix =>
    prefix.startsWith(value) || value.startsWith(prefix),
  )
}

function flushPendingDiffHunk(
  orig: string[],
  updated: string[],
  pendingOrig: string[],
  pendingUpdated: string[],
) {
  if (pendingOrig.length > 0)
    orig.push(...pendingOrig)
  if (pendingUpdated.length > 0)
    updated.push(...pendingUpdated)
  pendingOrig.length = 0
  pendingUpdated.length = 0
}

function splitUnifiedDiff(content: string, closed: boolean) {
  const orig: string[] = []
  const updated: string[] = []
  const pendingOrig: string[] = []
  const pendingUpdated: string[] = []
  const lines = content.split(NEWLINE_RE)
  const endsWithNewline = /\r?\n$/.test(content)
  const hasUnifiedDiffHeaders = lines.some(line =>
    line.startsWith('diff ')
    || line.startsWith('--- ')
    || line.startsWith('+++ ')
    || line.startsWith('@@ '),
  )

  const processLine = (rawLine: string) => {
    const line = rawLine
    // skip diff metadata lines
    if (DIFF_HEADER_PREFIXES.some(p => line.startsWith(p)))
      return

    if (line.startsWith('-')) {
      const body = line.slice(1)
      pendingOrig.push(!hasUnifiedDiffHeaders && body.startsWith(' ') ? ` ${body}` : body)
    }
    else if (line.startsWith('+')) {
      const body = line.slice(1)
      pendingUpdated.push(!hasUnifiedDiffHeaders && body.startsWith(' ') ? ` ${body}` : body)
    }
    else {
      flushPendingDiffHunk(orig, updated, pendingOrig, pendingUpdated)
      const contextLine = hasUnifiedDiffHeaders && line.startsWith(' ') ? line.slice(1) : line
      orig.push(contextLine)
      updated.push(contextLine)
    }
  }

  const lineCountToProcess = endsWithNewline
    ? Math.max(0, lines.length - 1)
    : lines.length

  for (let index = 0; index < lineCountToProcess; index++) {
    const line = lines[index] ?? ''
    const isStreamingTail = !closed && !endsWithNewline && index === lineCountToProcess - 1

    if (isStreamingTail && isPotentialDiffMetadataTail(line))
      continue

    processLine(line)
  }

  if (closed || pendingOrig.length > 0 || pendingUpdated.length > 0)
    flushPendingDiffHunk(orig, updated, pendingOrig, pendingUpdated)

  const originalCode = orig.join('\n')
  const updatedCode = updated.join('\n')

  return {
    original: closed && endsWithNewline && originalCode ? `${originalCode}\n` : originalCode,
    updated: closed && endsWithNewline && updatedCode ? `${updatedCode}\n` : updatedCode,
  }
}

export function parseFenceToken(token: MarkdownToken): CodeBlockNode {
  const hasMap = Array.isArray(token.map) && token.map.length === 2
  const tokenMeta = (token.meta ?? {}) as unknown as { closed?: boolean }
  const metaClosed = typeof tokenMeta.closed === 'boolean' ? tokenMeta.closed : undefined
  const closed = metaClosed === true || (metaClosed !== false && hasMap)
  const info = String(token.info ?? '')
  const diff = info.startsWith('diff')
  const language = diff
    ? (() => {
        const s = info
        const sp = s.indexOf(' ')
        return sp === -1
          ? ''
          : String(s.slice(sp + 1) ?? '')
      })()
    : info

  // Defensive sanitization: sometimes a closing fence line (e.g. ``` or ``)
  // can accidentally end up inside `token.content` (for example when
  // the parser/mapping is confused). Remove a trailing line that only
  // contains backticks and optional whitespace so we don't render stray
  // ` or `` characters at the end of the code output. This is a
  // conservative cleanup and only strips a final line that looks like a
  // fence marker (starts with optional spaces then one or more ` and
  // only whitespace until end-of-string).
  let content = String(token.content ?? '')
  if (TRAILING_FENCE_LINE_RE.test(content))
    content = content.replace(TRAILING_FENCE_LINE_RE, '')

  if (diff) {
    const { original, updated } = splitUnifiedDiff(content, closed === true)
    // 返回时保留原来的 code 字段为 updated（编辑后代码），并额外附加原始与更新的文本
    return {
      type: 'code_block',
      language,
      code: String(updated ?? ''),
      raw: String(content ?? ''),
      diff,
      loading: metaClosed === true ? false : metaClosed === false ? true : !hasMap,
      originalCode: original,
      updatedCode: updated,
    }
  }

  return {
    type: 'code_block',
    language,
    code: String(content ?? ''),
    raw: String(content ?? ''),
    diff,
    loading: metaClosed === true ? false : metaClosed === false ? true : !hasMap,
  }
}
