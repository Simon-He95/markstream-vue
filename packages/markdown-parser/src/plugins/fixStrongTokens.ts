import type { MarkdownIt } from '../markdown-it-types'
import type { MarkdownToken } from '../types'

export function applyFixStrongTokens(md: MarkdownIt) {
  // Run after inline tokenization to normalize strong/em tokens in
  // each inline token's children. This ensures downstream inline
  // parsers receive a normalized token list.
  md.core.ruler.after('inline', 'fix_strong_tokens', (state: unknown) => {
    const s = state as unknown as { tokens?: MarkdownToken[] }
    const toks = s.tokens ?? []
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]
      if (t && t.type === 'inline' && Array.isArray(t.children)) {
        try {
          t.children = fixStrongTokens(t.children)
        }
        catch (e) {
          // don't break parsing on plugin error

          console.error('[applyFixStrongTokens] failed to fix inline children', e)
        }
      }
    }
  })
}

function fixStrongTokens(tokens: MarkdownToken[]): MarkdownToken[] {
  let strongIndex = 0
  const cleansStrong = new Set<number>()
  const cleansEm = new Set<number>()
  let emIndex = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const type = t.type
    if (type === 'strong_open') {
      strongIndex++
      const markup = String(t.markup ?? '')
      let j = i - 1
      while (j >= 0 && tokens[j].type === 'text' && tokens[j].content === '') {
        j--
      }
      const preToken = tokens[j]
      let k = i + 1
      while (k < tokens.length && tokens[k].type === 'text' && tokens[k].content === '') {
        k++
      }
      const postToken = tokens[k]

      if (markup === '__' && (preToken?.content?.endsWith('_') || postToken?.content?.startsWith('_') || postToken?.markup?.includes('_'))) {
        t.type = 'text'
        t.tag = ''
        t.content = markup
        t.raw = markup
        t.markup = ''
        t.attrs = null
        t.map = null
        t.info = ''
        t.meta = null
        cleansStrong.add(strongIndex)
      }
    }
    else if (type === 'strong_close') {
      if (cleansStrong.has(strongIndex) && t.markup === '__') {
        t.type = 'text'
        t.content = t.markup
        t.raw = String(t.markup ?? '')
        t.tag = ''
        t.markup = ''
        t.attrs = null
        t.map = null
        t.info = ''
        t.meta = null
      }
      strongIndex--
      if (strongIndex < 0)
        strongIndex = 0
    }
    else if (type === 'em_open') {
      emIndex++
      const markup = String(t.markup ?? '')
      let j = i - 1
      while (j >= 0 && tokens[j].type === 'text' && tokens[j].content === '') {
        j--
      }
      const preToken = tokens[j]
      let k = i + 1
      while (k < tokens.length && tokens[k].type === 'text' && tokens[k].content === '') {
        k++
      }
      const postToken = tokens[k]
      if (markup === '_' && (preToken?.content?.endsWith('_') || postToken?.content?.startsWith('_') || postToken?.markup?.includes('_'))) {
        t.type = 'text'
        t.tag = ''
        t.content = markup
        t.raw = markup
        t.markup = ''
        t.attrs = null
        t.map = null
        t.info = ''
        t.meta = null
        cleansEm.add(emIndex)
      }
    }
    else if (type === 'em_close') {
      if (cleansEm.has(emIndex) && t.markup === '_') {
        t.type = 'text'
        t.content = t.markup
        t.raw = String(t.markup ?? '')
        t.tag = ''
        t.markup = ''
        t.attrs = null
        t.map = null
        t.info = ''
        t.meta = null
      }
      emIndex--
      if (emIndex < 0)
        emIndex = 0
    }
  }
  if (tokens.length < 5)
    return tokens
  const i = tokens.length - 4
  const token = tokens[i]
  let fixedTokens = [...tokens]
  const nextToken = tokens[i + 1]
  const tokenContent = String(token.content ?? '')
  if (token.type === 'link_open' && tokens[i - 1]?.type === 'em_open' && tokens[i - 2]?.type === 'text' && tokens[i - 2].content?.endsWith('*')) {
    const textContent = String(tokens[i - 2].content ?? '').slice(0, -1)

    const replaceTokens = [
      {
        type: 'strong_open',
        tag: 'strong',
        attrs: null,
        map: null,
        children: null,
        content: '',
        markup: '**',
        info: '',
        meta: null,
        raw: '',
      },
      tokens[i],
      tokens[i + 1],
      tokens[i + 2],
      {
        type: 'strong_close',
        tag: 'strong',
        attrs: null,
        map: null,
        children: null,
        content: '',
        markup: '**',
        info: '',
        meta: null,
        raw: '',
      },
    ]
    if (textContent) {
      replaceTokens.unshift({
        type: 'text',
        content: textContent,
        raw: textContent,
      })
    }
    fixedTokens.splice(i - 2, 6, ...replaceTokens)
  }
  else if (token.type === 'text' && tokenContent.endsWith('*') && nextToken.type === 'em_open') {
    // 解析有问题，要合并 emphasis 和 前面的 * 为 strong
    const _nextToken = tokens[i + 2]
    const count = _nextToken?.type === 'text' ? 4 : 3
    const insert = [
      {
        type: 'strong_open',
        tag: 'strong',
        attrs: null,
        map: null,
        children: null,
        content: '',
        markup: '**',
        info: '',
        meta: null,
        raw: '',
      },
      {
        type: 'text',
        content: _nextToken?.type === 'text' ? String(_nextToken.content ?? '') : '',
        raw: _nextToken?.type === 'text' ? String(_nextToken.content ?? '') : '',
      },
      {
        type: 'strong_close',
        tag: 'strong',
        attrs: null,
        map: null,
        children: null,
        content: '',
        markup: '**',
        info: '',
        meta: null,
        raw: '',
      },
    ] as MarkdownToken[]
    const beforeText = tokenContent.slice(0, -1)
    if (beforeText) {
      insert.unshift({
        type: 'text',
        content: beforeText,
        raw: beforeText,
      })
    }
    fixedTokens.splice(i, count, ...insert)
  }

  // Fix: markdown-it + math inline can incorrectly split a single strong span
  // into multiple strong nodes and leave the closing `**` inside a trailing text token.
  // Example:
  //   **化简集合\\( P \\)并求补集**：...
  // Tokens may become:
  //   strong_open, text('化简集合'), strong_close, strong_open, math_inline, strong_close, text('并求补集**：...')
  // Normalize into:
  //   strong_open, text('化简集合'), math_inline, text('并求补集'), strong_close, text('：...')
  fixedTokens = mergeBrokenStrongAroundMathInline(fixedTokens)

  return fixedTokens
}

function mergeBrokenStrongAroundMathInline(tokens: MarkdownToken[]): MarkdownToken[] {
  if (tokens.length < 7)
    return tokens

  const out: MarkdownToken[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t0 = tokens[i]
    const t1 = tokens[i + 1]
    const t2 = tokens[i + 2]
    const t3 = tokens[i + 3]
    const t4 = tokens[i + 4]
    const t5 = tokens[i + 5]
    const t6 = tokens[i + 6]

    if (
      t0?.type === 'strong_open'
      && t1?.type === 'text'
      && t2?.type === 'strong_close'
      && t3?.type === 'strong_open'
      && t4?.type === 'math_inline'
      && t5?.type === 'strong_close'
      && t6?.type === 'text'
    ) {
      const textContent = String(t6.content ?? '')
      const closeIdx = textContent.indexOf('**')
      if (closeIdx !== -1) {
        const beforeClose = textContent.slice(0, closeIdx)
        const afterClose = textContent.slice(closeIdx + 2)

        out.push(t0)
        out.push(t1)
        out.push(t4)

        if (beforeClose) {
          out.push({
            ...t6,
            type: 'text',
            content: beforeClose,
            raw: beforeClose,
          } as MarkdownToken)
        }

        // Reuse one of the strong_close tokens to close the merged strong span.
        out.push(t5)

        if (afterClose) {
          out.push({
            ...t6,
            type: 'text',
            content: afterClose,
            raw: afterClose,
          } as MarkdownToken)
        }

        i += 6
        continue
      }
    }

    if (
      t0?.type === 'strong_open'
      && t1?.type === 'text'
      && t2?.type === 'strong_close'
      && t3?.type === 'strong_open'
      && t4?.type === 'math_inline'
      && t5?.type === 'strong_close'
    ) {
      const close = findTrailingTextStrongClose(tokens, i + 6)
      if (close) {
        out.push(t0)
        out.push(t1)
        out.push(t4)

        for (let j = i + 6; j < close.index; j++) {
          out.push(tokens[j])
        }

        if (close.beforeClose) {
          out.push({
            ...tokens[close.index],
            type: 'text',
            content: close.beforeClose,
            raw: close.beforeClose,
          } as MarkdownToken)
        }

        out.push(t5)

        if (close.afterClose) {
          out.push({
            ...tokens[close.index],
            type: 'text',
            content: close.afterClose,
            raw: close.afterClose,
          } as MarkdownToken)
        }

        i = close.index
        continue
      }
    }

    out.push(t0)
  }

  return out
}

function findTrailingTextStrongClose(tokens: MarkdownToken[], startIndex: number) {
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i]
    if (token?.type === 'strong_open')
      return null
    if (token?.type !== 'text')
      continue

    const content = String(token.content ?? '')
    const closeIdx = content.indexOf('**')
    if (closeIdx === -1)
      continue

    return {
      index: i,
      beforeClose: content.slice(0, closeIdx),
      afterClose: content.slice(closeIdx + 2),
    }
  }

  return null
}
