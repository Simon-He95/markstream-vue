import type { MarkdownToken, ParsedNode } from '../../types'
import type { InlineParseState } from './inline-parser-state'
import { parseCheckboxInputToken, parseCheckboxToken } from './checkbox-parser'
import { parseEmojiToken } from './emoji-parser'
import { parseEmphasisToken } from './emphasis-parser'
import { parseFenceToken } from './fence-parser'
import { parseFootnoteRefToken } from './footnote-ref-parser'
import { parseHardbreakToken } from './hardbreak-parser'
import { parseHighlightToken } from './highlight-parser'
import { parseHtmlInlineCodeToken } from './html-inline-code-parser'
import { parseInlineCodeToken } from './inline-code-parser'
import { parseInsertToken } from './insert-parser'
import {
  handleFallbackToken,
  handleImageToken,
  handleLinkOpen,
} from './link-image-recovery'
import { parseMathInlineToken } from './math-inline-parser'
import { parseReferenceToken } from './reference-parser'
import { parseStrikethroughToken } from './strikethrough-parser'
import { parseStrongToken } from './strong-parser'
import { parseSubscriptToken } from './subscript-parser'
import { parseSuperscriptToken } from './superscript-parser'
import { handleTextToken } from './text-token-handler'

export function dispatchInlineToken(state: InlineParseState, token: MarkdownToken) {
  switch (token.type) {
    case 'text': {
      handleTextToken(state, token)
      break
    }
    case 'softbreak':
      if (state.currentTextNode) {
        // Append newline to the current text node
        state.currentTextNode.content += '\n'
        state.currentTextNode.raw += '\n' // Assuming raw should also reflect the newline
      }
      else {
        state.currentTextNode = {
          type: 'text',
          content: '\n',
          raw: '\n',
        }
        state.result.push(state.currentTextNode)
      }
      // Don't create a node for softbreak itself, just modify text
      state.index++
      break
    case 'code_inline':
      state.pushParsed(parseInlineCodeToken(token))
      state.index++
      break
    case 'html_inline': {
      const [node, index] = parseHtmlInlineCodeToken(token, state.tokens, state.index, state.parseInlineTokens, state.raw, state.pPreToken, state.options)
      state.pushParsed(node)
      state.index = index
      break
    }
    case 'link_open': {
      handleLinkOpen(state, token)
      break
    }
    case 'image':
      handleImageToken(state, token)
      break
    case 'strong_open': {
      state.resetCurrentTextNode()
      const { node, nextIndex } = parseStrongToken(state.tokens, state.index, state.parseInlineTokens, token.content, state.options)
      state.pushParsed(node)
      state.index = nextIndex
      break
    }
    case 'em_open': {
      state.resetCurrentTextNode()
      const { node, nextIndex } = parseEmphasisToken(state.tokens, state.index, state.parseInlineTokens, state.options)
      state.pushParsed(node)
      state.index = nextIndex
      break
    }
    case 's_open': {
      state.resetCurrentTextNode()
      const { node, nextIndex } = parseStrikethroughToken(state.tokens, state.index, state.parseInlineTokens, state.options)
      state.pushParsed(node)
      state.index = nextIndex
      break
    }
    case 'mark_open': {
      state.resetCurrentTextNode()
      const { node, nextIndex } = parseHighlightToken(state.tokens, state.index, state.parseInlineTokens, state.options)
      state.pushParsed(node)
      state.index = nextIndex
      break
    }
    case 'ins_open': {
      state.resetCurrentTextNode()
      const { node, nextIndex } = parseInsertToken(state.tokens, state.index, state.parseInlineTokens, state.options)
      state.pushParsed(node)
      state.index = nextIndex
      break
    }
    case 'sub_open': {
      state.resetCurrentTextNode()
      const { node, nextIndex } = parseSubscriptToken(state.tokens, state.index, state.parseInlineTokens, state.options)
      state.pushParsed(node)
      state.index = nextIndex
      break
    }
    case 'sup_open': {
      state.resetCurrentTextNode()
      const { node, nextIndex } = parseSuperscriptToken(state.tokens, state.index, state.parseInlineTokens, state.options)
      state.pushParsed(node)
      state.index = nextIndex
      break
    }
    case 'sub':
      state.resetCurrentTextNode()
      state.pushParsed({
        type: 'subscript',
        children: [
          {
            type: 'text',
            content: String(token.content ?? ''),
            raw: String(token.content ?? ''),
          },
        ],
        raw: `~${String(token.content ?? '')}~`,
      })
      state.index++
      break
    case 'sup':
      state.resetCurrentTextNode()
      state.pushParsed({
        type: 'superscript',
        children: [
          {
            type: 'text',
            content: String(token.content ?? ''),
            raw: String(token.content ?? ''),
          },
        ],
        raw: `^${String(token.content ?? '')}^`,
      })
      state.index++
      break
    case 'emoji': {
      state.resetCurrentTextNode()
      const preToken = state.tokens[state.index - 1]
      if (preToken?.type === 'text' && /\|:-+/.test(String(preToken.content ?? ''))) {
        // 处理表格中的 emoji，跳过
        state.pushText('', '')
      }
      else {
        state.pushParsed(parseEmojiToken(token))
      }
      state.index++
      break
    }
    case 'checkbox':
      state.resetCurrentTextNode()
      state.pushParsed(parseCheckboxToken(token))
      state.index++
      break
    case 'checkbox_input':
      state.resetCurrentTextNode()
      state.pushParsed(parseCheckboxInputToken(token))
      state.index++
      break
    case 'footnote_ref':
      state.resetCurrentTextNode()
      state.pushParsed(parseFootnoteRefToken(token))
      state.index++
      break
    case 'footnote_anchor': {
      // Emit a footnote_anchor node so NodeRenderer can render a backlink
      // element (e.g. a small "↩" that scrolls back to the reference).
      state.resetCurrentTextNode()
      const meta = (token.meta ?? {}) as Record<string, unknown>
      const id = String(meta.label ?? token.content ?? '')
      state.pushParsed({
        type: 'footnote_anchor',
        id,
        raw: String(token.content ?? ''),
      } as ParsedNode)
      state.index++
      break
    }
    case 'hardbreak':
      state.resetCurrentTextNode()
      state.pushParsed(parseHardbreakToken())
      state.index++
      break
    case 'fence': {
      state.resetCurrentTextNode()
      // Handle fenced code blocks with language specifications
      state.pushParsed(parseFenceToken(state.tokens[state.index]))
      state.index++
      break
    }
    case 'math_inline': {
      state.resetCurrentTextNode()
      state.pushParsed(parseMathInlineToken(token))
      state.index++
      break
    }
    case 'reference': {
      handleReference(state, token)
      break
    }
    case 'text_special': {
      // treat as plain text (merge into adjacent text nodes)
      state.pushText(String(token.content ?? ''), String(token.content ?? ''))
      state.index++
      break
    }
    default: {
      handleFallbackToken(state, token)
      break
    }
  }
}

function handleReference(state: InlineParseState, token: MarkdownToken) {
  state.resetCurrentTextNode()
  state.pushParsed(parseReferenceToken(token))
  state.index++
}
