import type { InternalParseOptions, MarkdownToken, ParseOptions } from '../types'

function clampNonNegative(n: number) {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function lineToIndex(source: string, line: number) {
  const targetLine = clampNonNegative(line)
  if (!source || targetLine <= 0)
    return 0

  let currentLine = 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      currentLine++
      if (currentLine === targetLine)
        return i + 1
    }
  }
  return source.length
}

export function withInlineSourceStartAt(options: ParseOptions | undefined, inlineSourceStart: number): ParseOptions | undefined {
  if (!Number.isFinite(inlineSourceStart) || inlineSourceStart < 0)
    return options

  return {
    ...options,
    __inlineSourceStart: inlineSourceStart,
  } as InternalParseOptions
}

export function withInlineSourceStart(
  token: MarkdownToken,
  options?: ParseOptions,
  sourceToken: MarkdownToken = token,
): ParseOptions | undefined {
  const source = String((options as InternalParseOptions | undefined)?.__sourceMarkdown ?? '')
  const map = Array.isArray(token.map) ? token.map : sourceToken.map
  if (!source || !Array.isArray(map))
    return options

  return withInlineSourceStartAt(options, lineToIndex(source, Number(map?.[0] ?? 0)))
}
