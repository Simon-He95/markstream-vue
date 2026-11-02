const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/

// Windows drive or UNC prefix followed by one or more backslash separators.
// The UNC server name is restricted to hostname characters and path segments
// stop at Markdown punctuation so escaped text such as `\\[brackets\\]` is not
// mistaken for a path. The lookbehind avoids matching inside identifiers.
const WINDOWS_PATH_PATTERN
  = /(?<![a-z0-9])(?:[a-z]:|\\\\[\w.-]+)(?:\\[^\s\\/"'`<>|[\]*]+)+/gi

function normalizeWindowsPaths(text: string): string {
  return text.replace(WINDOWS_PATH_PATTERN, (path) => {
    // The leading pair in a UNC path is the server prefix, not an escape.
    const isUnc = path.startsWith('\\\\')
    const rest = isUnc ? path.slice(2) : path
    // A doubled backslash inside the path is an explicit Markdown escape that
    // already renders as one separator; rewriting it would duplicate it.
    if (rest.includes('\\\\'))
      return path
    return isUnc ? `//${rest.replace(/\\/g, '/')}` : path.replace(/\\/g, '/')
  })
}

/**
 * Normalize Windows absolute path separators before a Markdown parser sees the
 * source. CommonMark treats backslash + ASCII punctuation as an escape, so a
 * path such as `G:\Tangula\_lookbook\index.html` loses the separator before
 * `_lookbook` and renders as `G:\Tangula_lookbook\index.html`. Link
 * destinations are percent-encoded instead, which produces the same broken
 * path once decoded.
 *
 * Fenced code blocks are left untouched: backslashes there are literal content
 * and may be copied into shell commands or source files. Inline code spans are
 * normalized too because markdown-it-ts unescapes their content as well, so a
 * file chip would otherwise point at a missing path.
 */
export function normalizeWindowsPathsInMarkdown(markdown: string): string {
  if (!markdown.includes('\\'))
    return markdown

  let fence: { marker: string, length: number } | null = null
  const normalizedLines = markdown.split('\n').map((line) => {
    const match = FENCE_PATTERN.exec(line)
    if (fence) {
      if (match && match[1]![0] === fence.marker && match[1]!.length >= fence.length)
        fence = null
      return line
    }
    if (match) {
      fence = { marker: match[1]![0]!, length: match[1]!.length }
      return line
    }
    return normalizeWindowsPaths(line)
  })

  return normalizedLines.join('\n')
}
