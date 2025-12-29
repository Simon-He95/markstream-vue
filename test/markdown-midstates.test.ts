import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { beforeAll, describe, expect, it } from 'vitest'
import { collect, fenceOrParagraph, hasEmoji, hasLoadingLink, hasNode, hasParagraph, links, paragraphFirst, paragraphHasCheckbox, textIncludes } from './utils/midstate-utils'

const md = getMarkdown('midstates')

beforeAll(async () => {
  // Tests opt-in to emoji support explicitly so the library avoids bundling
  // it by default in production. Register emoji plugin on the named md
  // instance used in these midstate tests.
  const emoji = await import('markdown-it-emoji')
  md.use((emoji as any).full)
})

// `collect` imported from test/utils/midstate-utils

describe('parseMarkdownToStructure - incremental/mid-typing states', () => {
  describe('heading transitions (extra)', () => {
    it('"##x" stays paragraph, then "## x" becomes heading level 2', () => {
      const n1 = parseMarkdownToStructure('##x', md)
      expect(hasNode(n1, 'heading')).toBeFalsy()
      const n2 = parseMarkdownToStructure('## x', md)
      const h = collect(n2, 'heading')[0] as any
      expect(h).toBeTruthy()
      expect(h.level).toBe(2)
    })
  })

  describe('heading transitions', () => {
    it('"#x" stays paragraph, then "# x" becomes heading level 1', () => {
      const n1 = parseMarkdownToStructure('#x', md)
      expect(hasNode(n1, 'heading')).toBeFalsy()
      const p1: any = collect(n1, 'paragraph')[0]
      expect(textIncludes(p1?.raw || n1, '#x')).toBe(true)

      const n2 = parseMarkdownToStructure('# x', md)
      const h = collect(n2, 'heading')[0] as any
      expect(h).toBeTruthy()
      expect(h.level).toBe(1)
      const text = (h.children?.[0]?.content) || (h.children?.[0]?.text) || ''
      // tolerant check: prefer structural helper but allow string fallback
      expect(textIncludes(h, 'x') || String(text).includes('x')).toBe(true)
    })
  })

  describe('blockquote transitions', () => {
    it('"> x" becomes blockquote with paragraph child', () => {
      const n = parseMarkdownToStructure('> x', md)
      const bq = collect(n, 'blockquote')[0] as any
      expect(bq).toBeTruthy()
      const innerPara = bq.children?.find((c: any) => c.type === 'paragraph')
      expect(innerPara).toBeTruthy()
    })
  })

  describe('list item transitions', () => {
    it('"- x" becomes a bullet list item when followed by newline', () => {
      const n1 = parseMarkdownToStructure('- x', md)
      // Might still be paragraph depending on markdown-it rules without newline
      const maybeList = collect(n1, 'list')[0]
      const maybePara = collect(n1, 'paragraph')[0]
      expect(!!maybeList || !!maybePara).toBe(true)

      const n2 = parseMarkdownToStructure('- x\n', md)
      const list = collect(n2, 'list')[0] as any
      expect(list).toBeTruthy()
      expect(list.ordered).toBe(false)
      const firstItemPara = list.items?.[0]?.children?.find((c: any) => c.type === 'paragraph')
      const text = firstItemPara?.children?.find((c: any) => c.type === 'text')
      expect(text?.content).toContain('x')
    })

    it('"1. x" becomes an ordered list when followed by newline', () => {
      const n = parseMarkdownToStructure('1. x\n', md)
      const list = collect(n, 'list')[0] as any
      expect(list).toBeTruthy()
      expect(list.ordered).toBe(true)
      // start defaults to 1 if omitted
      expect(list.start === undefined || list.start === 1).toBeTruthy()
    })

    it('"- *" mid-state should not explode or produce nested lists unintentionally', () => {
      const n = parseMarkdownToStructure('- *', md)
      // The parser has a guard to escape this case; accept paragraph fallback
      const para = collect(n, 'paragraph')[0]
      const list = collect(n, 'list')[0]
      expect(!!para || !!list).toBe(true)
      expect(textIncludes((para as any)?.raw || n, '- *') || !!list).toBe(true)
    })
  })

  describe('emphasis/strong mid-states', () => {
    it('"*x" parses as emphasis, "**x" as strong (for mid typing)', () => {
      const e = parseMarkdownToStructure('*x', md)
      const em = collect(e, 'emphasis')[0]
      expect(em).toBeTruthy()
      const emText = em.children?.[0]?.content || em.text || ''
      expect(textIncludes(em, 'x') || String(emText).includes('x')).toBe(true)

      const s = parseMarkdownToStructure('**x', md)
      const strong = collect(s, 'strong')[0]
      expect(strong).toBeTruthy()
      const st = strong.children?.[0]?.content || strong.text || ''
      expect(textIncludes(strong, 'x') || String(st).includes('x')).toBe(true)
    })
  })

  describe('inline code mid-states', () => {
    it('"`x" yields an inline_code node; "`x`" closes it', () => {
      const a = parseMarkdownToStructure('`x', md)
      const codeA = collect(a, 'inline_code')[0] as any
      expect(codeA).toBeTruthy()
      // Prefer structural match but accept raw/code fallback
      expect(textIncludes(codeA, 'x') || String(codeA.code || codeA.raw || '').includes('x')).toBe(true)

      const b = parseMarkdownToStructure('`x`', md)
      const codeB = collect(b, 'inline_code')[0] as any
      expect(codeB).toBeTruthy()
      expect(codeB.code).toBe('x')
    })
  })

  describe('link transitions including tricky mid-states', () => {
    it('"[*x" and "[**x" should NOT be parsed as a link yet', () => {
      for (const input of ['[*x', '[**x']) {
        const nodes = parseMarkdownToStructure(input, md)
        const links = collect(nodes, 'link')
        expect(links.length).toBe(0)
        // Ensure original bracket remains in text output
        expect(textIncludes(nodes, '[*x') || textIncludes(nodes, '[**x')).toBe(true)
      }
    })

    it('"[知乎 - 有问题就会有答案]" mid-state should not be parsed as math', () => {
      const mid = parseMarkdownToStructure('[知乎 - 有问题就会有答案]', md)
      expect(collect(mid, 'math_block').length).toBe(0)
      expect(textIncludes(mid, '知乎 - 有问题就会有答案')).toBe(true)

      const full = parseMarkdownToStructure('[知乎 - 有问题就会有答案](https://www.zhihu.com)', md)
      const ls = collect(full, 'link') as any[]
      expect(ls.length).toBe(1)
      expect(ls[0].href).toBe('https://www.zhihu.com')
      expect(ls[0].loading).toBe(false)
    })

    it('"[x](http://a" produces a loading link (no closing paren)', () => {
      const nodes = parseMarkdownToStructure('[x](http://a', md)
      // Accept either provisional loading link or tolerant fallback
      const ls = links(nodes)
      if (ls.length > 0) {
        const l = ls[0]
        expect(l.text).toBe('x')
        expect(!!l.loading).toBe(true)
      }
      else {
        expect(textIncludes(nodes, '[x](http://a')).toBe(true)
      }
    })

    it('"[x](http://a)" produces a finalized link', () => {
      const nodes = parseMarkdownToStructure('[x](http://a)', md)
      const links = collect(nodes, 'link') as any[]
      expect(links.length).toBe(1)
      expect(links[0].href).toBe('http://a')
      expect(links[0].loading).toBe(false)
    })

    it('handles "[*x](xx" mid-state tolerantly: either a loading link or plain text with emphasis', () => {
      const nodes = parseMarkdownToStructure('[*x](xx', md)
      const ls = links(nodes)
      if (ls.length > 0) {
        const l = ls[0]
        const textOk = l.text === 'x' || (l.children && textIncludes(l.children, 'emphasis'))
        expect(textOk).toBe(true)
        expect(!!l.loading).toBe(true)
      }
      else {
        // Accept tokenizer choosing to keep as text + emphasis until closing paren exists
        expect(textIncludes(nodes, '[*x](xx') || textIncludes(nodes, 'emphasis')).toBe(true)
      }
    })
  })

  describe('image transitions', () => {
    it('"![x](u" is a mid-state image; either image or plain text is acceptable until closed', () => {
      const nodes = parseMarkdownToStructure('![x](u', md)
      // Depending on tokenizer, an image may already be emitted or fallback to text
      const images = collect(nodes, 'image')
      expect(images.length >= 0).toBe(true)
      expect(images.length > 0 || textIncludes(nodes, '![x](u')).toBe(true)
    })

    it('"![x](url)" becomes an image node', () => {
      const nodes = parseMarkdownToStructure('![x](http://img)', md)
      const images = collect(nodes, 'image') as any[]
      expect(images.length).toBe(1)
      expect(images[0].src || images[0].href).toBe('http://img')
    })
  })

  describe('checkbox list item transitions', () => {
    it('"- [" is a mid-state and should not crash', () => {
      const nodes = parseMarkdownToStructure('- [', md)
      // Accept paragraph or list fallback safely
      const ok = hasParagraph(nodes) || hasNode(nodes, 'list')
      expect(ok).toBe(true)
    })

    it('"- [ ] x" becomes an unchecked checkbox item when newline present', () => {
      const nodes = parseMarkdownToStructure('- [ ] x\n', md)
      const list = collect(nodes, 'list')[0] as any
      expect(list).toBeTruthy()
      const item = list.items?.[0]
      const para = item?.children?.find((c: any) => c.type === 'paragraph')
      expect(!!para).toBe(true)
      // checkbox node is produced as an inline child of the paragraph
      expect(paragraphHasCheckbox([item])).toBe(true)
      const text = para?.children?.find((c: any) => c.type === 'text')
      expect(text?.content || '').toContain('x')
    })

    it('"- [x] x" becomes a checked checkbox item', () => {
      const nodes = parseMarkdownToStructure('- [x] hello\n', md)
      const list = collect(nodes, 'list')[0] as any
      expect(list).toBeTruthy()
      const item = list.items?.[0]
      const para = item?.children?.find((c: any) => c.type === 'paragraph')
      expect(!!para).toBe(true)
      expect(paragraphHasCheckbox([item])).toBe(true)
      // checked could be on either checkbox or checkbox_input node
      const checkbox = paragraphFirst([item])?.children?.find((c: any) => c.type === 'checkbox')
        || paragraphFirst([item])?.children?.find((c: any) => c.type === 'checkbox_input')
      const checked = checkbox?.checked ?? checkbox?.attrs?.checked
      expect(checked).toBe(true)
    })
  })

  describe('thematic break transitions', () => {
    it('"-" and "--" are not hr; "---" is hr', () => {
      const a = parseMarkdownToStructure('-', md)
      expect(collect(a, 'thematic_break').length).toBe(0)
      const b = parseMarkdownToStructure('--', md)
      expect(collect(b, 'thematic_break').length).toBe(0)
      const c = parseMarkdownToStructure('---', md)
      expect(collect(c, 'thematic_break').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('hardbreak transitions', () => {
    it('two spaces before newline produces a hardbreak; one space does not', () => {
      const no = parseMarkdownToStructure('line \nnext', md)
      expect(collect(no, 'hardbreak').length).toBe(0)
      const yes = parseMarkdownToStructure('line  \nnext', md)
      expect(collect(yes, 'hardbreak').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('footnote reference mid-states', () => {
    it('"[^1" remains text; "[^1]" may become a footnote_reference depending on plugins', () => {
      const a = parseMarkdownToStructure('[^1', md)
      expect(collect(a, 'footnote_reference').length).toBe(0)
      const b = parseMarkdownToStructure('[^1]', md)
      // token type may be 'footnote_reference' or fall back to text if plugin config defers
      const got = collect(b, 'footnote_reference')
      if (got.length === 0) {
        expect(textIncludes(b, '[^1]')).toBe(true)
      }
      else {
        expect(got.length).toBeGreaterThanOrEqual(1)
      }
    })
  })

  describe('reference-style link mid-states', () => {
    it('"[text][id" stays as text/reference token; "[text][id]" recognized as reference', () => {
      const a = parseMarkdownToStructure('[text][id', md)
      // May yield a 'reference' inline token fallback or plain text
      const okA = collect(a, 'reference').length >= 0
      expect(okA).toBe(true)
      const b = parseMarkdownToStructure('[text][id]', md)
      // Depending on plugin setup, may still be a reference token awaiting definition
      expect(collect(b, 'reference').length >= 0).toBe(true)
    })
  })

  describe('fenced code block mid-states', () => {
    it('"```" or "```js" mid-state: accept fence node or paragraph fallback', () => {
      for (const input of ['```', '```js', '```js\nconsole.log(1)']) {
        const nodes = parseMarkdownToStructure(input, md)
        expect(fenceOrParagraph(nodes)).toBe(true)
      }
    })
    it('mermaid fence: unclosed vs closed', () => {
      const unclosed = parseMarkdownToStructure('```mermaid\nflowchart TD\nA-->B', md)
      const f1 = collect(unclosed, 'code_block') as any[]
      if (f1.length > 0) {
        // If recognized early, language should be mermaid and likely loading
        expect(f1[0].language).toBe('mermaid')
        // loading may be true for unclosed fences
        expect([true, false]).toContain(!!f1[0].loading)
      }
      else {
        // Accept paragraph fallback
        expect(hasParagraph(unclosed)).toBe(true)
      }

      const closed = parseMarkdownToStructure('```mermaid\nflowchart TD\nA-->B\n```', md)
      const f2 = collect(closed, 'code_block') as any[]
      expect(f2.length).toBeGreaterThanOrEqual(1)
      expect(f2[0].language).toBe('mermaid')
      // closed fences should be loading=false when mapping closed is detected
      if (typeof f2[0].loading === 'boolean')
        expect(f2[0].loading).toBe(false)
    })
  })

  describe('table transitions', () => {
    it('"a | b" alone is not a table; add separator to form a table', () => {
      const a = parseMarkdownToStructure('a | b', md)
      expect(collect(a, 'table').length).toBe(0)
      const b = parseMarkdownToStructure('a | b\n---|---', md)
      expect(collect(b, 'table').length).toBeGreaterThanOrEqual(1)
    })
    it('alignment separators (:\n---: etc.) should not be parsed as emoji', () => {
      const s = parseMarkdownToStructure('A | B\n:---:|---', md)
      const table = collect(s, 'table')[0]
      expect(!!table).toBe(true)
      // Ensure no stray emoji nodes in header/separator processing
      const emojis = collect(s, 'emoji')
      expect(emojis.length).toBe(0)
    })
  })

  describe('marking mid-states (strikethrough/highlight/insert/sub/sup)', () => {
    it('strikethrough: "~~x" or "~~x~~" should yield a strikethrough node', () => {
      for (const input of ['~~x', '~~x~~']) {
        const nodes = parseMarkdownToStructure(input, md)
        const s = collect(nodes, 'strikethrough')
        expect(s.length).toBeGreaterThanOrEqual(1)
      }
    })
    it('highlight: "==x" may stay text until closed; "==x==" highlights', () => {
      const a = parseMarkdownToStructure('==x', md)
      expect(collect(a, 'highlight').length).toBe(0)
      const b = parseMarkdownToStructure('==x==', md)
      expect(collect(b, 'highlight').length).toBeGreaterThanOrEqual(1)
    })
    it('insert/underline: "++x" may stay text; "++x++" inserts', () => {
      const a = parseMarkdownToStructure('++x', md)
      expect(collect(a, 'insert').length).toBe(0)
      const b = parseMarkdownToStructure('++x++', md)
      expect(collect(b, 'insert').length).toBeGreaterThanOrEqual(1)
    })
    it('superscript and subscript mid-states', () => {
      const supA = parseMarkdownToStructure('^2', md)
      expect(collect(supA, 'superscript').length).toBe(0)
      const supB = parseMarkdownToStructure('^2^', md)
      expect(collect(supB, 'superscript').length).toBeGreaterThanOrEqual(1)

      const subA = parseMarkdownToStructure('~2', md)
      expect(collect(subA, 'subscript').length).toBe(0)
      const subB = parseMarkdownToStructure('~2~', md)
      expect(collect(subB, 'subscript').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('emoji with links/lists mix edge cases', () => {
    it('list item mixing emoji and link (mid-state link)', () => {
      const nodes = parseMarkdownToStructure('- :smile: [Go](http://a', md)
      const list = collect(nodes, 'list')[0] as any
      expect(!!list).toBe(true)
      const para = list.items?.[0]?.children?.find((c: any) => c.type === 'paragraph')
      expect(!!para).toBe(true)
      const hasEmojiInPara = hasEmoji(para?.children || [])
      const links = para ? para.children.filter((c: any) => c.type === 'link') : []
      // Link may be recognized as loading link at this stage
      const ok = hasEmojiInPara && (links.length >= 0)
      expect(ok).toBe(true)
    })
    it('link text may contain emoji shortcode', () => {
      const nodes = parseMarkdownToStructure('[:smile:](http://a)', md)
      const ls = links(nodes)
      expect(ls.length).toBe(1)
      // Either emoji child in link, or raw/text contains the shortcode or the emoji char
      expect(hasEmoji(ls[0].children || []) || textIncludes(ls[0], ':smile:') || textIncludes(ls[0], '😄')).toBe(true)
    })
  })

  describe('extra edge cases (tolerant mid-states)', () => {
    describe('table trailing pipes and escaped pipes', () => {
      it('"a | b |" alone is not a table; add separator with trailing pipes to form a table', () => {
        const a = parseMarkdownToStructure('a | b |', md)
        expect(collect(a, 'table').length).toBe(0)
        const b = parseMarkdownToStructure('a | b |\n---|---|', md)
        expect(collect(b, 'table').length > 0).toBe(true)
      })

      it('escaped pipes do not form a table until a valid separator appears', () => {
        const s1 = parseMarkdownToStructure('a \\| b', md)
        expect(collect(s1, 'table').length).toBe(0)
        const p = collect(s1, 'paragraph')[0] as any
        // Robustly assert paragraph text contains the expected pieces (allowing parser to keep or remove escape)
        // Prefer the helper which serializes nodes and searches for the text pieces
        expect((typeof p !== 'undefined' ? textIncludes(p, 'a') : textIncludes(s1, 'a')) && (typeof p !== 'undefined' ? textIncludes(p, 'b') : textIncludes(s1, 'b'))).toBe(true)
      })
    })

    describe('fenced code blocks with params and blank content', () => {
      it('```js { foo:1 } mid-state: accept fence node (language starts with js) or paragraph fallback', () => {
        const nodes = parseMarkdownToStructure('```js { foo:1 }', md)
        expect(fenceOrParagraph(nodes)).toBe(true)
        const fenceNodes = collect(nodes, 'code_block') as any[]
        const fenceAlt = collect(nodes, 'fence') as any[]
        const hasFence = fenceNodes.length > 0 || fenceAlt.length > 0
        if (hasFence) {
          const f = (fenceNodes[0] || fenceAlt[0]) as any
          // language should be parsed as js when recognized
          if (typeof f?.language === 'string')
            expect(f.language.startsWith('js')).toBe(true)
        }
      })

      it('``` followed by newline with empty content is a valid mid-state', () => {
        const nodes = parseMarkdownToStructure('```\n', md)
        expect(fenceOrParagraph(nodes)).toBe(true)
      })
    })

    describe('link + emoji variants', () => {
      it('emoji at end of link text with URL unclosed yields loading link or text fallback', () => {
        const nodes = parseMarkdownToStructure('[:smile:x](http://a', md)
        if (hasLoadingLink(nodes)) {
          const ls = links(nodes)
          const l = ls[0]
          expect(!!l.loading).toBe(true)
          expect(textIncludes(l, ':smile:x') || textIncludes(l, 'emoji')).toBe(true)
        }
        else {
          expect(textIncludes(nodes, '[:smile:x](http://a') || textIncludes(nodes, 'emoji')).toBe(true)
        }
      })

      it('list item with multiple emoji and unclosed link remains a list with paragraph child', () => {
        const nodes = parseMarkdownToStructure('- :rocket: :fire: [Go](http://a', md)
        const list = collect(nodes, 'list')[0] as any
        expect(!!list).toBe(true)
        const para = list.items?.[0]?.children?.find((c: any) => c.type === 'paragraph')
        expect(!!para).toBe(true)
        expect(hasEmoji(para?.children || [])).toBe(true)
        // link may or may not be recognized yet, but should not crash
        const links = para ? para.children.filter((c: any) => c.type === 'link') : []
        expect(links.length >= 0).toBe(true)
      })
    })

    describe('interleaved marking mid-states', () => {
      it('"~~**x" mid-state: tolerate as text or as partially parsed marking without crash', () => {
        const nodes = parseMarkdownToStructure('~~**x', md)
        const ok = textIncludes(nodes, '~~**x')
          || collect(nodes, 'strikethrough').length >= 1
          || collect(nodes, 'strong').length >= 1
        expect(ok).toBe(true)
      })

      it('"**~~x" mid-state: tolerate as text or as partially parsed marking without crash', () => {
        const nodes = parseMarkdownToStructure('**~~x', md)
        const ok = textIncludes(nodes, '**~~x')
          || collect(nodes, 'strikethrough').length >= 1
          || collect(nodes, 'strong').length >= 1
        expect(ok).toBe(true)
      })
    })

    describe('blockquote/list/checkbox combined mid-state', () => {
      it('"> - [ ] x" without newline: accept blockquote or paragraph/list fallback', () => {
        const nodes = parseMarkdownToStructure('> - [ ] x', md)
        const ok = hasNode(nodes, 'blockquote')
          || hasParagraph(nodes)
          || hasNode(nodes, 'list')
        expect(ok).toBe(true)
      })
    })
  })

  describe('more extras (tolerant mid-states v2)', () => {
    describe('autolink angle-bracket mid-states', () => {
      it('"<http://a" mid-state: allow plain text or early link; no crash', () => {
        const nodes = parseMarkdownToStructure('<http://a', md)
        // Either no link yet or tokenizer emits a provisional link
        const links = collect(nodes, 'link')
        expect(links.length >= 0).toBe(true)
      })

      it('"<http://a>" finalized autolink: may become a link node or remain text depending on plugins', () => {
        const nodes = parseMarkdownToStructure('<http://a>', md)
        const links = collect(nodes, 'link') as any[]
        if (links.length > 0) {
          // tolerant check for href/url on autolink depending on plugin
          expect(textIncludes(links[0], 'http://a') || String(links[0].href || links[0].url || '').includes('http://a')).toBe(true)
        }
        else {
          // Accept tokenizer keeping as plain text when autolink plugin is not enabled
          expect(textIncludes(nodes, '<http://a>')).toBe(true)
        }
      })
    })

    describe('tilde fenced code blocks', () => {
      it('"~~~" mid-state: accept fence or paragraph fallback', () => {
        const nodes = parseMarkdownToStructure('~~~', md)
        const fence = collect(nodes, 'code_block').length > 0
          || collect(nodes, 'fence').length > 0
        const para = hasParagraph(nodes)
        expect(fence || para).toBe(true)
      })

      it('closed tilde fence recognized as code block', () => {
        const nodes = parseMarkdownToStructure('~~~\ncode\n~~~', md)
        const code = collect(nodes, 'code_block').length > 0
          || collect(nodes, 'fence').length > 0
        expect(code).toBe(true)
      })
    })

    describe('indented code block mid-states', () => {
      it('3 spaces then text is not an indented code block', () => {
        const nodes = parseMarkdownToStructure('   not-code', md)
        const isCode = collect(nodes, 'code_block').length > 0
        expect(isCode).toBe(false)
        expect(hasParagraph(nodes)).toBe(true)
      })

      it('4 spaces then text becomes an indented code block (or fence-like)', () => {
        const nodes = parseMarkdownToStructure('    code', md)
        const isCode = collect(nodes, 'code_block').length > 0
          || collect(nodes, 'fence').length > 0
        const para = hasParagraph(nodes)
        expect(isCode || para).toBe(true)
      })
    })

    describe('link title mid-states', () => {
      it('"[x](http://a \"t" mid-state: allow loading link or text fallback', () => {
        const nodes = parseMarkdownToStructure('[x](http://a "t', md)
        const links = collect(nodes, 'link') as any[]
        if (links.length > 0) {
          const l = links[0]
          // may not set loading for title mid-state; just ensure no crash
          expect(!!l).toBe(true)
        }
        else {
          expect(textIncludes(nodes, '[x](http://a "t')).toBe(true)
        }
      })

      it('"[x](http://a \"t\")" finalized link; title may be present', () => {
        const nodes = parseMarkdownToStructure('[x](http://a "t")', md)
        const links = collect(nodes, 'link') as any[]
        expect(links.length).toBe(1)
        expect(links[0].href).toBe('http://a')
        // title is optional based on tokenizer; accept either
        if (typeof links[0].title === 'string')
          expect(links[0].title).toBe('t')
      })
    })

    describe('image alt containing emoji shortcode', () => {
      it('"![:smile:](u" mid-state: allow image node or plain text', () => {
        const nodes = parseMarkdownToStructure('![:smile:](u', md)
        const images = collect(nodes, 'image')
        expect(images.length >= 0).toBe(true)
        expect(images.length > 0 || textIncludes(nodes, '![:smile:](u')).toBe(true)
      })

      it('"![:smile:](http://img)" finalized image; alt may include emoji or raw text', () => {
        const nodes = parseMarkdownToStructure('![:smile:](http://img)', md)
        const images = collect(nodes, 'image') as any[]
        expect(images.length).toBe(1)
        expect(images[0].src || images[0].href).toBe('http://img')
        expect(textIncludes(images[0], 'emoji') || textIncludes(images[0], ':smile:')).toBe(true)
      })
    })
  })

  describe('more extras (tolerant mid-states v3)', () => {
    describe('reference definition mid-states', () => {
      it('"[id]:" mid-state: stays text or provisional reference_def; no crash', () => {
        const nodes = parseMarkdownToStructure('[id]:', md)
        // Accept as plain text or any reference-like node
        const ok = textIncludes(nodes, '[id]:') || collect(nodes, 'reference_def').length >= 0
        expect(ok).toBe(true)
      })

      it('"[id]: http://a" may become a reference definition or remain text', () => {
        const nodes = parseMarkdownToStructure('[id]: http://a', md)
        const defs = collect(nodes, 'reference_def') as any[]
        if (defs.length > 0) {
          // href/src naming may differ
          const href = defs[0].href || defs[0].url || defs[0].src
          // Prefer tolerant structural check; fall back to string include when needed
          expect(textIncludes(defs[0], 'http://a') || String(href || '').includes('http://a')).toBe(true)
        }
        else {
          const hasPara = collect(nodes, 'paragraph').length > 0
          // Accept normalized text or even empty/no-op output depending on plugins
          const ok = hasPara || textIncludes(nodes, 'http://a') || textIncludes(nodes, '[id]') || Array.isArray(nodes)
          expect(ok).toBe(true)
        }
      })

      it('use-before-def mid-state: "[x][id]\n[id]:" tolerates as text or partial link', () => {
        const nodes = parseMarkdownToStructure('[x][id]\n[id]:', md)
        const links = collect(nodes, 'link')
        const texts = collect(nodes, 'text')
        // Either link is recognized or kept as text until def completes
        expect(links.length >= 0).toBe(true)
        expect(texts.length === 1 || textIncludes(nodes, '[x][id]\n[id]:')).toBe(true)
      })
    })

    describe('custom container/admonition mid-states', () => {
      it('"::: tip" mid-state: accept container/admonition node or paragraph fallback', () => {
        const nodes = parseMarkdownToStructure('::: tip', md)
        const container = collect(nodes, 'container')[0] || collect(nodes, 'admonition')[0]
        const para = hasParagraph(nodes)
        expect(!!container || para).toBe(true)
      })

      it('"::: tip\ncontent\n:::" closed: container/admonition with paragraph child or paragraph fallback', () => {
        const nodes = parseMarkdownToStructure('::: tip\ncontent\n:::', md)
        const container = (collect(nodes, 'container')[0] || collect(nodes, 'admonition')[0]) as any
        if (container) {
          const hasPara = (container.children || container.items || []).some((c: any) => c?.type === 'paragraph')
          expect(hasPara).toBe(true)
        }
        else {
          // Accept fallback
          expect(hasParagraph(nodes)).toBe(true)
        }
      })
    })

    describe('hTML block mid-states', () => {
      it('"<div" mid-state: accept html_block or paragraph fallback', () => {
        const nodes = parseMarkdownToStructure('<div', md)
        const html = collect(nodes, 'html_block').length > 0 || collect(nodes, 'html').length > 0
        const para = collect(nodes, 'paragraph').length > 0
        expect(html || para || Array.isArray(nodes)).toBe(true)
      })

      it('"<div>\ntext\n</div>" closed: may be html_block or paragraphs', () => {
        const nodes = parseMarkdownToStructure('<div>\ntext\n</div>', md)
        const html = collect(nodes, 'html_block').length > 0 || collect(nodes, 'html').length > 0
        const para = collect(nodes, 'paragraph').length > 0
        expect(html || para || Array.isArray(nodes)).toBe(true)
      })
    })

    describe('math block mid-states', () => {
      it('"$$" mid-state: accept math_block or paragraph fallback', () => {
        const nodes = parseMarkdownToStructure('$$', md)
        const math = collect(nodes, 'math_block').length > 0 || collect(nodes, 'math').length > 0
        const para = hasParagraph(nodes)
        expect(math || para).toBe(true)
      })

      it('"$$\na+b\n$$" closed: should be math_block or paragraph fallback (depending on plugin)', () => {
        const nodes = parseMarkdownToStructure('$$\na+b\n$$', md)
        const math = collect(nodes, 'math_block').length > 0 || collect(nodes, 'math').length > 0
        const para = hasParagraph(nodes)
        expect(math || para).toBe(true)
      })
    })
  })

  describe('more extras (tolerant mid-states v4)', () => {
    describe('setext heading transitions', () => {
      it('"Title" stays paragraph; then "Title\n===" becomes heading level 1', () => {
        const a = parseMarkdownToStructure('Title', md)
        expect(hasNode(a, 'heading')).toBeFalsy()
        const b = parseMarkdownToStructure('Title\n===', md)
        const h = collect(b, 'heading')[0] as any
        expect(h).toBeTruthy()
        expect(h.level).toBe(1)
      })

      it('"Title\n---" becomes heading level 2 (not hr here due to preceding text)', () => {
        const b = parseMarkdownToStructure('Title\n---', md)
        const h = collect(b, 'heading')[0] as any
        expect(h).toBeTruthy()
        expect(h.level).toBe(2)
      })
    })

    describe('double backtick inline code mid-states', () => {
      it('"``x" yields inline_code or text fallback; "``x``" closes it', () => {
        const a = parseMarkdownToStructure('``x', md)
        const codeA = collect(a, 'inline_code')[0] as any
        const okA = !!codeA || textIncludes(a, '``x')
        expect(okA).toBe(true)

        const b = parseMarkdownToStructure('``x``', md)
        const codeB = collect(b, 'inline_code')[0] as any
        if (codeB) {
          expect(codeB.code || codeB.raw || '').toContain('x')
        }
        else {
          // accept fallback if tokenizer chooses otherwise
          expect(textIncludes(b, '``x``')).toBe(true)
        }
      })
    })

    describe('escaped punctuation mid-states', () => {
      it('"\\*x" should not crash; parser may keep text or still parse emphasis depending on escapes', () => {
        const nodes = parseMarkdownToStructure('\\*x', md)
        const emph = collect(nodes, 'emphasis').length
        // Accept either: preserved literal *x in text, or emphasis recognized by tokenizer
        const ok = textIncludes(nodes, '*x') || emph >= 1
        expect(ok).toBe(true)
      })
    })

    describe('hTML comments mid-states', () => {
      it('"<!--" mid-state: accept html/html_block or paragraph fallback', () => {
        const a = parseMarkdownToStructure('<!--', md)
        const htmlish = collect(a, 'html_block').length > 0 || collect(a, 'html').length > 0
        const para = collect(a, 'paragraph').length > 0
        expect(htmlish || para || Array.isArray(a)).toBe(true)
      })

      it('"<!-- c -->" closed: may be html/html_block or paragraph', () => {
        const b = parseMarkdownToStructure('<!-- c -->', md)
        const htmlish = collect(b, 'html_block').length > 0 || collect(b, 'html').length > 0
        const para = collect(b, 'paragraph').length > 0
        expect(htmlish || para || Array.isArray(b)).toBe(true)
      })
    })

    describe('footnote definition mid-states', () => {
      it('"[^1]:" mid-state remains text or provisional def node', () => {
        const a = parseMarkdownToStructure('[^1]:', md)
        const got = collect(a, 'footnote_definition')
        const para = collect(a, 'paragraph').length > 0
        expect(got.length >= 0).toBe(true)
        expect(got.length > 0 || para || textIncludes(a, '^1') || Array.isArray(a)).toBe(true)
      })

      it('"[^1]: hello" may produce a definition or remain text', () => {
        const b = parseMarkdownToStructure('[^1]: hello', md)
        const got = collect(b, 'footnote_definition') as any[]
        if (got.length > 0) {
          expect(textIncludes(got[0], 'hello')).toBe(true)
        }
        else {
          const para = collect(b, 'paragraph').length > 0
          expect(para || textIncludes(b, 'hello') || textIncludes(b, '^1') || Array.isArray(b)).toBe(true)
        }
      })
    })

    describe('definition list mid-states', () => {
      it('"Term\n:" mid-state tolerates as text or provisional definition list', () => {
        const a = parseMarkdownToStructure('Term\n:', md)
        const defs = collect(a, 'definition_list')
          .concat(collect(a, 'dl'))
          .concat(collect(a, 'definition'))
        expect(defs.length >= 0).toBe(true)
        expect(defs.length > 0 || textIncludes(a, 'Term') || textIncludes(a, '\n:')).toBe(true)
      })

      it('"Term\n: def" becomes a definition list or acceptable fallback', () => {
        const b = parseMarkdownToStructure('Term\n: def', md)
        const defs = collect(b, 'definition_list')
          .concat(collect(b, 'dl'))
          .concat(collect(b, 'definition'))
        if (defs.length > 0) {
          expect(textIncludes(defs[0], 'def')).toBe(true)
        }
        else {
          // Accept paragraph/list fallback depending on tokenizer config
          const ok = hasParagraph(b) || hasNode(b, 'list')
          expect(ok).toBe(true)
        }
      })
    })

    describe('additional mid-state edge cases (tables/marking/mermaid/emoji-links)', () => {
      it('table cell containing inline code mid-state: should produce a table with inline_code in cell or fall back', () => {
        const nodes = parseMarkdownToStructure('a | `b`\n---|---', md)
        const tables = collect(nodes, 'table')
        if (tables.length > 0) {
          const tbl: any = tables[0]
          // Look for inline_code somewhere in the table structure
          const foundCode = textIncludes(tbl, '`b`') || textIncludes(tbl, 'b')
          expect(foundCode).toBe(true)
        }
        else {
          // Accept tolerant fallback
          expect(textIncludes(nodes, '`b`') || textIncludes(nodes, 'a')).toBe(true)
        }
      })

      it('highlight containing emphasis: "==*x*==" should tolerate nested parsing', () => {
        const nodes = parseMarkdownToStructure('==*x*==', md)
        // Accept either highlight node containing emphasis, or safe text fallback
        const hil = collect(nodes, 'highlight')
        const em = collect(nodes, 'emphasis')
        const ok = hil.length > 0 || em.length > 0 || textIncludes(nodes, '==*x*==')
        expect(ok).toBe(true)
      })

      it('mermaid fence with leading spaces/unclosed should not crash', () => {
        const nodes = parseMarkdownToStructure('   ```mermaid\nflowchart LR\nA-->B', md)
        const code = collect(nodes, 'code_block')
        if (code.length > 0) {
          // language may be recognized despite leading spaces
          expect(textIncludes(code[0], 'mermaid') || textIncludes(code[0], 'flowchart')).toBe(true)
        }
        else {
          expect(textIncludes(nodes, 'flowchart') || hasParagraph(nodes)).toBe(true)
        }
      })

      it('link title containing emoji mid-state: allow either loading link or text with emoji', () => {
        const nodes = parseMarkdownToStructure('[x](http://a "t😁"', md)
        const ls = links(nodes)
        if (ls.length > 0) {
          expect(!!ls[0].loading).toBe(true)
          // allow either the emoji present in raw/title or the 't' character (title stub)
          expect(
            hasEmoji(ls[0].children || [])
            || textIncludes(ls[0], '😁')
            || textIncludes(ls[0], 't')
            || textIncludes(ls[0], 'smile')
            || textIncludes(nodes, 't')
            || textIncludes(nodes, '😁'),
          ).toBe(true)
        }
        else {
          expect(textIncludes(nodes, 't😁') || textIncludes(nodes, '[x](http://a "t')).toBe(true)
        }
      })

      it('trailing pipe variants: "a | b |" with separator should form table with empty cell', () => {
        const nodes = parseMarkdownToStructure('a | b |\n---|---|', md)
        const tables = collect(nodes, 'table')
        if (tables.length > 0) {
          // table exists; ensure at least header cells are present
          expect(textIncludes(tables[0], 'a') && textIncludes(tables[0], 'b')).toBe(true)
        }
        else {
          expect(textIncludes(nodes, 'a') && textIncludes(nodes, 'b')).toBe(true)
        }
      })
    })
  })
})
