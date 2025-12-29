import type { MarkdownIt } from 'markdown-it-ts'
import type { MarkdownToken } from '../types'

// Small helpers to reduce repetition when building token fragments
function textToken(content: string) {
  return {
    type: 'text',
    content,
    raw: content,
  }
}

function pushEmOpen(arr: any[], type: number) {
  if (type === 1) {
    arr.push({ type: 'em_open', tag: 'em', nesting: 1 })
  }
  else if (type === 2) {
    arr.push({ type: 'strong_open', tag: 'strong', nesting: 1 })
  }
  else if (type === 3) {
    arr.push({ type: 'strong_open', tag: 'strong', nesting: 1 })
    arr.push({ type: 'em_open', tag: 'em', nesting: 1 })
  }
}

function pushEmClose(arr: any[], type: number) {
  if (type === 1) {
    arr.push({ type: 'em_close', tag: 'em', nesting: -1 })
  }
  else if (type === 2) {
    arr.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
  }
  else if (type === 3) {
    arr.push({ type: 'em_close', tag: 'em', nesting: -1 })
    arr.push({ type: 'strong_close', tag: 'strong', nesting: -1 })
  }
}

function createLinkToken(text: string, href: string, loading: boolean) {
  let title = ''
  if (href.includes('"')) {
    const temps = href.split('"')
    href = temps[0].trim()
    title = temps[1].trim()
  }
  return {
    type: 'link',
    loading,
    href,
    title,
    text,
    children: [
      {
        type: 'text',
        content: text,
        raw: text,
      },
    ],
    raw: String(`[${text}](${href})`),
  }
}

export function applyFixLinkTokens(md: MarkdownIt) {
  // Run after the inline rule so markdown-it has produced inline tokens
  // for block-level tokens; we then adjust each inline token's children
  // so downstream code receives corrected token arrays during the same
  // parsing pass.
  md.core.ruler.after('inline', 'fix_link_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: Array<{ type?: string, children?: any[] }> }
    const toks = s.tokens ?? []
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]
      if (t && t.type === 'inline' && Array.isArray(t.children)) {
        try {
          t.children = fixLinkToken(t.children)
        }
        catch (e) {
          // Swallow errors to avoid breaking parsing; keep original children
          // so parse still succeeds even if our fix fails for an unexpected shape.
          // Errors should be rare and indicate malformed token arrays.

          console.error('[applyFixLinkTokens] failed to fix inline children', e)
        }
      }
    }
  })
}

function fixLinkToken(tokens: MarkdownToken[]): MarkdownToken[] {
  if (tokens.length < 4)
    return tokens

  for (let i = 0; i <= tokens.length - 1; i++) {
    if (i < 0) {
      i = 0
    }
    const curToken = tokens[i]
    if (!curToken)
      break
    if (curToken?.type === 'em_open' && tokens[i - 1]?.type === 'text' && tokens[i - 1].content?.endsWith('*')) {
      const beforeText = tokens[i - 1].content?.replace(/(\*+)$/, '') || ''
      tokens[i - 1].content = beforeText
      // 修改当前 type 'em_open' -> 'strong_open'
      curToken.type = 'strong_open'
      curToken.tag = 'strong'
      curToken.markup = '**'
      // 还需要把对应的 em_close 也修改为 strong_close
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j]?.type === 'em_close') {
          tokens[j].type = 'strong_close'
          tokens[j].tag = 'strong'
          tokens[j].markup = '**'
          break
        }
      }
    }
    else if (curToken?.type === 'text' && curToken.content?.endsWith('(') && tokens[i + 1]?.type === 'link_open') {
      const match = curToken.content!.match(/\[([^\]]+)\]/)
      if (match) {
        let beforeText = curToken.content!.slice(0, match.index)
        const emphasisMatch = beforeText.match(/(\*+)$/)
        const replacerTokens = []
        if (emphasisMatch) {
          beforeText = beforeText.slice(0, emphasisMatch.index)
          if (beforeText)
            replacerTokens.push(textToken(beforeText))
          const text = match[1]
          const type = emphasisMatch[1].length
          pushEmOpen(replacerTokens, type)
          let href = tokens[i + 2]?.content || ''
          if (tokens[i + 4]?.type === 'text' && !tokens[i + 4].content?.startsWith(')')) {
            href += tokens[i + 4]?.content || ''
            tokens[i + 4].content = ''
          }
          replacerTokens.push(createLinkToken(text, href, !tokens[i + 4]?.content?.startsWith(')')))
          pushEmClose(replacerTokens, type)
          if (tokens[i + 4]?.type === 'text') {
            const afterText = tokens[i + 4].content?.replace(/^\)\**/, '')
            if (afterText)
              replacerTokens.push(textToken(afterText))
            tokens.splice(i, 5, ...replacerTokens)
          }
          else {
            tokens.splice(i, 4, ...replacerTokens)
          }
        }
        else {
          if (beforeText)
            replacerTokens.push(textToken(beforeText))
          let text = match[1]
          const emphasisMatch = text.match(/^\*+/)
          if (emphasisMatch) {
            const type = emphasisMatch[0].length
            text = text.replace(/^\*+/, '').replace(/\*+$/, '')
            // Put emphasis inside the link children when the asterisks are inside the brackets
            // so link nodes will contain the emphasis node as a child.
            let href = tokens[i + 2]?.content || ''
            if (tokens[i + 4]?.type === 'text' && !tokens[i + 4].content?.startsWith(')')) {
              href += tokens[i + 4]?.content || ''
              tokens[i + 4].content = ''
            }
            // wrap the link with emphasis open/close tokens
            pushEmOpen(replacerTokens, type)
            replacerTokens.push(createLinkToken(text, href, !tokens[i + 4]?.content?.startsWith(')')))
            pushEmClose(replacerTokens, type)
            // we've already pushed the link, skip the standard push below
            if (tokens[i + 4]?.type === 'text') {
              const afterText = tokens[i + 4].content?.replace(/^\)/, '')
              if (afterText)
                replacerTokens.push(textToken(afterText))
              tokens.splice(i, 5, ...replacerTokens)
            }
            else {
              tokens.splice(i, 4, ...replacerTokens)
            }
            if (i === 0) {
              i = replacerTokens.length - 1
            }
            else {
              i -= (replacerTokens.length - 1)
            }
            continue
          }
          let href = tokens[i + 2]?.content || ''
          if (tokens[i + 4]?.type === 'text' && !tokens[i + 4].content?.startsWith(')')) {
            href += tokens[i + 4]?.content || ''
            tokens[i + 4].content = ''
          }
          replacerTokens.push(createLinkToken(text, href, !tokens[i + 4]?.content?.startsWith(')')))
          if (tokens[i + 4]?.type === 'text') {
            const afterText = tokens[i + 4].content?.replace(/^\)/, '')
            if (afterText)
              replacerTokens.push(textToken(afterText))
            tokens.splice(i, 5, ...replacerTokens)
          }
          else {
            tokens.splice(i, 4, ...replacerTokens)
          }
        }
        i -= (replacerTokens.length - 1)
        continue
      }
    }
    else if (curToken.type === 'link_open' && curToken.markup === 'linkify' && tokens[i - 1]?.type === 'text' && tokens[i - 1].content?.endsWith('(')) {
      if (tokens[i - 2]?.type === 'link_close') {
        // 合并link
        const replacerTokens = []
        const text = (tokens[i - 3].content || '')
        let href = curToken.attrs?.find(attr => attr[0] === 'href')?.[1] || ''

        if (tokens[i + 3]?.type === 'text') {
          const m = (tokens[i + 3]?.content ?? '').indexOf(')')
          const loading = m === -1
          if (m === -1) {
            href += (tokens[i + 3]?.content?.slice(0, m) || '')
            tokens[i + 3].content = ''
          }

          replacerTokens.push(createLinkToken(text, href, loading))
          const afterText = tokens[i + 3].content?.replace(/^\)\**/, '')
          if (afterText)
            replacerTokens.push(textToken(afterText))
          tokens.splice(i - 4, 8, ...replacerTokens)
        }
        else {
          replacerTokens.push({
            type: 'link',
            loading: true,
            href,
            title: '',
            text,
            children: [
              {
                type: 'text',
                content: href,
                raw: href,
              },
            ],
            raw: String(`[${text}](${href})`),
          })
          tokens.splice(i - 4, 7, ...replacerTokens)
        }
        continue
      }
      else if (tokens[i - 1].content === '](' && tokens[i - 3]?.type === 'text' && tokens[i - 3].content?.endsWith(')')) {
        // 移除 i-3 的 link部分，合并到 link_open 下的 text中
        if (tokens[i - 2]?.type === 'strong_open') {
          const [beforeText, linText] = tokens[i - 3].content?.split('[**') || []
          tokens[i + 1].content = linText || ''
          tokens[i - 3].content = beforeText || ''
          tokens[i - 1].content = ''
        }
        else if (tokens[i - 2]?.type === 'em_open') {
          const [beforeText, linText] = tokens[i - 3].content?.split('[*') || []
          tokens[i + 1].content = linText || ''
          tokens[i - 3].content = beforeText || ''
          tokens[i - 1].content = ''
        }
        else {
          const [beforeText, linText] = tokens[i - 3].content?.split('[') || []
          tokens[i + 1].content = linText || ''
          tokens[i - 3].content = beforeText || ''
          tokens[i - 1].content = ''
        }
      }
    }
    if (curToken.type === 'link_close' && curToken.nesting === -1 && tokens[i + 1]?.type === 'text' && tokens[i - 1]?.type === 'text') {
      // 修复链接后多余文本被包含在链接内的问题
      const text = tokens[i - 1].content || ''
      const attrs = tokens[i - 2].attrs || []
      const href = attrs.find(a => a[0] === 'href')?.[1] || ''
      const title = attrs.find(a => a[0] === 'title')?.[1] || ''
      let count = 3
      let deleteCount = 2
      const beforeText = tokens[i - 3]?.content || ''
      const emphasisMatch = beforeText.match(/^(\*+)$/)
      const replacerTokens: any[] = []
      if (emphasisMatch) {
        deleteCount += 1
        const type = emphasisMatch[1].length
        pushEmOpen(replacerTokens, type)
      }

      if (curToken.markup !== 'linkify' && tokens[i + 1].type === 'text' && tokens[i + 1]?.content?.startsWith('](')) {
        count += 1
        for (let j = i + 1; j < tokens.length; j++) {
          const type = emphasisMatch ? emphasisMatch[1].length : tokens[i - 3].markup!.length
          const t = tokens[j]
          if (type === 1 && t.type === 'em_close') {
            break
          }
          else if (type === 2 && t.type === 'strong_close') {
            break
          }
          else if (type === 3) {
            if (t.type === 'em_close' || t.type === 'strong_close') {
              break
            }
          }
          count += 1
        }
      }

      replacerTokens.push({
        type: 'link',
        loading: false,
        href,
        title,
        text,
        children: [
          {
            type: 'text',
            content: text,
            raw: text,
          },
        ],
        raw: String(`[${text}](${href})`),
      } as any)
      if (emphasisMatch) {
        const type = emphasisMatch[1].length
        pushEmClose(replacerTokens, type)
      }
      tokens.splice(i - deleteCount, count, ...replacerTokens)
      i -= (replacerTokens.length - 1)
      continue
    }
    else if (curToken.content?.startsWith('](') && tokens[i - 1].markup?.includes('*') && tokens[i - 4]?.type === 'text' && tokens[i - 4].content?.endsWith('[')) {
      const type = tokens[i - 1].markup!.length
      const replacerTokens = []
      const beforeText = tokens[i - 4].content!.slice(0, tokens[i - 4].content!.length - type)
      if (beforeText)
        replacerTokens.push(textToken(beforeText))
      pushEmOpen(replacerTokens, type)
      const text = tokens[i - 2].content || ''
      let href = curToken.content!.slice(2)
      let loading = true
      if (tokens[i + 1]?.type === 'text') {
        const m = (tokens[i + 1]?.content ?? '').indexOf(')')
        loading = m === -1
        if (m === -1) {
          href += (tokens[i + 1]?.content?.slice(0, m) || '')
          tokens[i + 1].content = ''
        }
      }
      replacerTokens.push(createLinkToken(text, href, loading))
      pushEmClose(replacerTokens, type)
      if (tokens[i + 1]?.type === 'text') {
        const afterText = tokens[i + 1].content?.replace(/^\)\**/, '')
        if (afterText)
          replacerTokens.push(textToken(afterText))
        tokens.splice(i - 4, 8, ...replacerTokens)
      }
      else if (tokens[i + 1]?.type === 'link_open') {
        // 特殊情况其实要把href也处理，这里可以直接跳过
        tokens.splice(i - 4, 10, ...replacerTokens)
      }
      else {
        tokens.splice(i - 4, 7, ...replacerTokens)
      }
      i -= (replacerTokens.length - 1)
      continue
    }
    else if (curToken.content?.startsWith('](') && tokens[i - 1].type === 'strong_close' && tokens[i - 4]?.type === 'text' && tokens[i - 4]?.content?.includes('**[')) {
      // 此时的场景是 link 被 strong 包裹，link 中又包含了强调符号
      const replacerTokens = []
      const beforeText = tokens[i - 4].content!.split('**[')[0]
      if (beforeText)
        replacerTokens.push(textToken(beforeText))
      pushEmOpen(replacerTokens, 2)
      const text = tokens[i - 2].content || ''
      let href = curToken.content!.slice(2)
      let loading = true
      if (tokens[i + 1]?.type === 'text') {
        const m = (tokens[i + 1]?.content ?? '').indexOf(')')
        loading = m === -1
        if (m === -1) {
          href += (tokens[i + 1]?.content?.slice(0, m) || '')
          tokens[i + 1].content = ''
        }
      }
      replacerTokens.push(createLinkToken(text, href, loading))
      pushEmClose(replacerTokens, 2)
      if (tokens[i + 1]?.type === 'text') {
        const afterText = tokens[i + 1].content?.replace(/^\)\**/, '')
        if (afterText)
          replacerTokens.push(textToken(afterText))
        tokens.splice(i - 4, 8, ...replacerTokens)
      }
      else if (tokens[i + 1]?.type === 'link_open') {
        // 特殊情况其实要把href也处理，这里可以直接跳过
        tokens.splice(i - 4, 10, ...replacerTokens)
      }
      else {
        tokens.splice(i - 4, 7, ...replacerTokens)
      }
      i -= (replacerTokens.length - 1)
      continue
    }
    else if (curToken.type === 'strong_close' && tokens[i + 1]?.type === 'text' && tokens[i + 1].content?.includes('](') && tokens[i - 1].type === 'text' && /\[.*$/.test(tokens[i - 1].content || '')) {
      const replacerTokens = []
      const [beforeText, afterText] = tokens[i - 1].content?.split('[') || ['', '']
      if (beforeText)
        replacerTokens.push(textToken(beforeText))
      pushEmOpen(replacerTokens, 2)
      let [text, href] = tokens[i + 1].content!.split('](')
      text = afterText + text
      let deleteCount = 4
      if (tokens[i + 2]?.type === 'link_open') {
        const _href = tokens[i + 2].attrs?.find(a => a[0] === 'href')?.[1]
        if (tokens[i + 5]?.type === 'text' && tokens[i + 5].content === '.') {
          href = (_href || href) + tokens[i + 5].content
          tokens[i + 5].content = ''
        }
        else {
          href = _href || href
        }

        deleteCount += 3
      }
      let loading = true
      if (curToken.nesting === -1) {
        // 嵌套 strong_close，需要去掉尾部的 **
        text = text.replace(/\*+$/, '')
      }
      if (tokens[i + 2]?.type === 'text') {
        const m = (tokens[i + 2]?.content ?? '').indexOf(')')
        loading = m === -1
        if (m === -1) {
          href += (tokens[i + 2]?.content?.slice(0, m) || '')
          tokens[i + 2].content = ''
        }
      }
      replacerTokens.push(createLinkToken(text, href, loading))
      pushEmClose(replacerTokens, 2)
      tokens.splice(i - 2, deleteCount, ...replacerTokens)
    }
    // 处理强调 + 链接拆分：首个 text 含前导星号与 '['，后续出现独立的 "]("、link_open、href、link_close、")"、strong_close。
    // 期望合并为：strong_open + 复合 link(label 尾部补回星号) + strong_close。
    if (
      curToken.type === 'text'
      && /\*+\[[^\]]*$/.test(curToken.content || '')
      && tokens[i + 1]?.type === 'strong_open'
      && tokens[i + 2]?.type === 'text' && tokens[i + 2].content === ']('
      && tokens[i + 3]?.type === 'link_open'
      && tokens[i + 5]?.type === 'link_close'
      && tokens[i + 6]?.type === 'text' && tokens[i + 6].content === ')'
      && tokens[i + 7]?.type === 'strong_close'
    ) {
      const contentVal = curToken.content || ''
      const startMatch = contentVal.match(/^(\*+)\[(.*)$/)
      if (startMatch) {
        const innerLabel = startMatch[2] || ''
        // 将前导星号数量追加到标签末尾
        const finalLabel = innerLabel + startMatch[1]
        // 获取 href：优先使用 link_open 的属性，若为空则回退到后续文本 token 内容
        let href = tokens[i + 3]?.attrs?.find(a => a[0] === 'href')?.[1] || ''
        if (!href && tokens[i + 4]?.type === 'text') {
          href = tokens[i + 4].content || ''
        }
        const out: MarkdownToken[] = []
        pushEmOpen(out as any[], 2)
        out.push(createLinkToken(finalLabel, href, false))
        pushEmClose(out as any[], 2)
        tokens.splice(i, 9, ...out)
        i -= (out.length - 1)
        continue
      }
    }
  }
  return tokens
}
