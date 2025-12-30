import type { MarkdownIt } from 'markdown-it-ts'
import markdownItContainer from 'markdown-it-container'

export function applyContainers(md: MarkdownIt) {
  ;[
    'admonition',
    'info',
    'warning',
    'error',
    'tip',
    'danger',
    'note',
    'caution',
  ].forEach((name) => {
    md.use(markdownItContainer, name, {
      render(tokens: unknown, idx: number) {
        const tokensAny = tokens as unknown as import('../types').MarkdownToken[]
        const token = tokensAny[idx]
        // `nesting` is a runtime-only property present on MarkdownIt tokens.
        // Narrow the shape with `unknown` -> specific minimal interface to avoid `as any`.
        const tokenShape = token as unknown as { nesting?: number }
        if (tokenShape.nesting === 1) {
          return `<div class="vmr-container vmr-container-${name}">`
        }
        else {
          return '</div>\n'
        }
      },
    })
  })

  // fallback for simple ::: blocks (kept for backwards compat)
  md.block.ruler.before(
    'fence',
    'vmr_container_fallback',
    (state: unknown, startLine: number, endLine: number, silent: boolean) => {
      interface ParserState {
        bMarks: number[]
        tShift: number[]
        eMarks: number[]
        src: string
        env: unknown
        push: (type: string, tag?: string, nesting?: number) => any
        tokens: any[]
        md: any
        line: number
      }
      const s = state as unknown as ParserState
      const startPos = s.bMarks[startLine] + s.tShift[startLine]
      const lineMax = s.eMarks[startLine]
      const line = s.src.slice(startPos, lineMax)
      console.log({ startPos, lineMax, line })

      // Match ::: container syntax: ::: name {"json"}
      // Using separate patterns to avoid backtracking issues
      // Allow both "::: name" and ":::name", and stop before inline JSON attrs.
      const nameMatch = line.match(/^:::\s*([^\s{]+)/)
      if (!nameMatch)
        return false

      const name = nameMatch[1]
      // Validate name is not empty (handles edge case like ":::   ")
      if (!name.trim())
        return false

      const rest = line.slice(nameMatch[0].length)
      // Improved JSON matching: find balanced braces instead of simple non-greedy match
      let jsonStr: string | undefined
      const trimmedRest = rest.trim()
      if (trimmedRest.startsWith('{')) {
        let depth = 0
        let jsonEnd = -1
        for (let i = 0; i < trimmedRest.length; i++) {
          if (trimmedRest[i] === '{')
            depth++
          else if (trimmedRest[i] === '}')
            depth--
          if (depth === 0) {
            jsonEnd = i + 1
            break
          }
        }
        if (jsonEnd > 0) {
          jsonStr = trimmedRest.slice(0, jsonEnd)
        }
      }

      if (silent)
        return true

      let nextLine = startLine + 1
      let found = false
      while (nextLine <= endLine) {
        const sPos = s.bMarks[nextLine] + s.tShift[nextLine]
        const ePos = s.eMarks[nextLine]
        if (s.src.slice(sPos, ePos).trim() === ':::') {
          found = true
          break
        }
        nextLine++
      }
      if (!found)
        return false

      const tokenOpen = s.push('vmr_container_open', 'div', 1)
      // `tokenOpen` is runtime token object; keep using runtime helpers but avoid casting `s` to `any`.
      tokenOpen.attrSet('class', `vmr-container vmr-container-${name}`)

      // If JSON attributes are present, store them as data attributes
      if (jsonStr) {
        tokenOpen.attrSet('data-json-attrs', jsonStr)
      }

      // Parse inner content as full block markdown so block-level constructs
      // (especially fenced code blocks) are preserved inside the container.
      const contentLines: string[] = []
      for (let i = startLine + 1; i < nextLine; i++) {
        const sPos = s.bMarks[i] + s.tShift[i]
        const ePos = s.eMarks[i]
        contentLines.push(s.src.slice(sPos, ePos))
      }
      const hasContent = contentLines.some(line => line.trim().length > 0)
      if (hasContent) {
        // Always end with two newlines to ensure block separation (esp. for lists/paragraphs)
        let innerSrc = contentLines.join('\n')
        if (!innerSrc.endsWith('\n'))
          innerSrc += '\n'
        if (!innerSrc.endsWith('\n\n'))
          innerSrc += '\n'
        const innerTokens: any[] = []
        // Use the same env as the parent block parser to ensure all block rules are available
        s.md.block.parse(innerSrc, s.md, s.env, innerTokens)
        s.tokens.push(...innerTokens)
      }

      s.push('vmr_container_close', 'div', -1)

      s.line = nextLine + 1
      return true
    },
  )
}
