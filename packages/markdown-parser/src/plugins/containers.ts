import type { MarkdownIt, Token } from '../markdown-it-types'
import type { MarkdownToken } from '../types'
import markdownItContainer from 'markdown-it-container'

function parseLooseInlineAttrs(input: string): Record<string, unknown> | null {
  const s = String(input ?? '').trim()
  if (!s.startsWith('{') || !s.endsWith('}'))
    return null

  const inner = s.slice(1, -1).trim()
  if (!inner)
    return {}

  // Only support a shallow object literal: {key:value, foo:"bar"}
  // No nested objects/arrays/functions.
  if (inner.includes('{') || inner.includes('[') || inner.includes(']'))
    return null

  const parts: string[] = []
  let buf = ''
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '\\') {
      buf += ch
      if (i + 1 < inner.length) {
        buf += inner[i + 1]
        i++
      }
      continue
    }
    if (!inDouble && ch === '\'') {
      inSingle = !inSingle
      buf += ch
      continue
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      buf += ch
      continue
    }
    if (!inSingle && !inDouble && ch === ',') {
      parts.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim())
    parts.push(buf.trim())

  const out: Record<string, unknown> = {}
  for (const part of parts) {
    if (!part)
      continue
    let inS = false
    let inD = false
    let split = -1
    for (let i = 0; i < part.length; i++) {
      const ch = part[i]
      if (ch === '\\') {
        i++
        continue
      }
      if (!inD && ch === '\'') {
        inS = !inS
        continue
      }
      if (!inS && ch === '"') {
        inD = !inD
        continue
      }
      if (!inS && !inD && ch === ':') {
        split = i
        break
      }
    }
    if (split === -1)
      return null

    const rawKey = part.slice(0, split).trim()
    const rawVal = part.slice(split + 1).trim()
    if (!rawKey)
      return null

    let key = rawKey
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith('\'') && key.endsWith('\''))) {
      try {
        key = JSON.parse(key.replace(/^'/, '"').replace(/'$/, '"'))
      }
      catch {
        return null
      }
    }
    // Restrict unquoted keys to simple identifiers.
    if (!/^[_$A-Z][\w$-]*$/i.test(key))
      return null

    let value: unknown
    if (!rawVal) {
      value = ''
    }
    else if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith('\'') && rawVal.endsWith('\''))) {
      try {
        value = JSON.parse(rawVal.replace(/^'/, '"').replace(/'$/, '"'))
      }
      catch {
        value = rawVal
      }
    }
    else if (/^-?\d+(?:\.\d+)?$/.test(rawVal)) {
      value = Number(rawVal)
    }
    else if (rawVal === 'true' || rawVal === 'false') {
      value = rawVal === 'true'
    }
    else if (rawVal === 'null') {
      value = null
    }
    else {
      value = rawVal
    }

    out[key] = value
  }

  return out
}

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
        // Narrow the shape with `unknown` -> specific minimal interface.
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
      type MutableMarkdownToken = MarkdownToken & {
        attrSet: (name: string, value: string) => void
        meta?: Record<string, unknown> | null
      }
      interface ParserState {
        bMarks: number[]
        tShift: number[]
        eMarks: number[]
        src: string
        env: Record<string, unknown>
        push: (type: string, tag?: string, nesting?: number) => MutableMarkdownToken
        tokens: MarkdownToken[]
        md: MarkdownIt
        line: number
      }
      const s = state as unknown as ParserState
      const startPos = s.bMarks[startLine] + s.tShift[startLine]
      const lineMax = s.eMarks[startLine]
      const line = s.src.slice(startPos, lineMax)

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
      const trimmedRest = rest.trim()

      // Support both:
      // - ::: name {"json"}
      // - :::name args {"json"}
      // - :::name args
      let argsStr: string | undefined
      let jsonStr: string | undefined

      const jsonStart = trimmedRest.indexOf('{')
      const jsonCandidate = jsonStart >= 0 ? trimmedRest.slice(jsonStart).trimStart() : undefined

      if (jsonStart === -1) {
        argsStr = trimmedRest || undefined
      }
      else {
        const before = trimmedRest.slice(0, jsonStart).trim()
        argsStr = before || undefined

        // Improved JSON matching: find balanced braces instead of simple non-greedy match
        if (jsonCandidate?.startsWith('{')) {
          let depth = 0
          let jsonEnd = -1
          for (let i = 0; i < jsonCandidate.length; i++) {
            if (jsonCandidate[i] === '{')
              depth++
            else if (jsonCandidate[i] === '}')
              depth--
            if (depth === 0) {
              jsonEnd = i + 1
              break
            }
          }
          if (jsonEnd > 0) {
            jsonStr = jsonCandidate.slice(0, jsonEnd)
          }
        }

        // Streaming mid-state: if we saw a '{' but didn't find a balanced '}',
        // treat the whole remainder as a plain args string.
        // Example: "::: viewcode:stream {xxx:yyy" => attrs.args === "{xxx:yyy"
        if (!jsonStr)
          argsStr = trimmedRest || undefined
      }

      if (silent)
        return true

      const envFinal = !!s.env.__markstreamFinal

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
      // Streaming optimization:
      // - If we have an opening ":::name" but no closing ":::" yet, still emit a container.
      //   Treat the remainder of the document as the container body.
      // - The structured parser will expose this as `loading: true` until it closes,
      //   or until `final=true` is provided.
      if (!found)
        nextLine = endLine

      const tokenOpen = s.push('vmr_container_open', 'div', 1)
      // `tokenOpen` is runtime token object; keep using runtime helpers.
      tokenOpen.attrSet('class', `vmr-container vmr-container-${name}`)

      // Mark unclosed containers for downstream consumers (optional).
      tokenOpen.meta = { ...(tokenOpen.meta ?? {}), unclosed: !found && !envFinal }

      // If args are present (non-JSON payload right after the name), preserve them as a data attribute.
      if (argsStr)
        tokenOpen.attrSet('data-args', argsStr)

      // If JSON attributes are present, store them as data attributes
      if (jsonStr) {
        try {
          const attrs = JSON.parse(jsonStr)
          for (const [key, value] of Object.entries(attrs)) {
            const isComplexValue = value != null && typeof value === 'object'
            tokenOpen.attrSet(
              `data-${key}`,
              isComplexValue ? JSON.stringify(value) : String(value),
            )
          }
        }
        catch {
          // If strict JSON parsing fails, try a small loose-object syntax: {xxx:yyy}
          const loose = parseLooseInlineAttrs(jsonStr)
          if (loose) {
            for (const [key, value] of Object.entries(loose)) {
              const isComplexValue = value != null && typeof value === 'object'
              tokenOpen.attrSet(
                `data-${key}`,
                isComplexValue ? JSON.stringify(value) : String(value),
              )
            }
          }
          else {
            // If parsing fails, store the raw string as a data attribute
            tokenOpen.attrSet('data-attrs', jsonStr)
          }
        }
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

        // The last token should be the current vm_container_open token
        const prevToken = s.tokens[s.tokens.length - 1]

        // Save the inner Markdown content as raw
        if (prevToken) {
          prevToken.raw = innerSrc
        }

        const innerTokens: Token[] = []
        // Use the same env as the parent block parser to ensure all block rules are available
        s.md.block.parse(innerSrc, s.md, s.env, innerTokens)
        s.tokens.push(...(innerTokens as unknown as MarkdownToken[]))
      }

      if (found)
        s.push('vmr_container_close', 'div', -1)

      s.line = found ? (nextLine + 1) : nextLine
      return true
    },
    {
      // Ensure this rule can terminate an active paragraph so content immediately
      // above `:::` isn't swallowed into the same paragraph block.
      alt: ['paragraph', 'reference', 'blockquote', 'list'],
    },
  )
}
