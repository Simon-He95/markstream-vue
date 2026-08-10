---
title: Parser & API
description: Overview of the markstream-vue streaming-friendly parser built on markdown-it-ts, covering getMarkdown and parseMarkdownToStructure helpers.
keywords:
  - markdown parser
  - markdown-it-ts
  - parse markdown to structure
  - getmarkdown helper
---
# Parser & API

markstream-vue builds on top of `markdown-it-ts` and exposes a streaming-friendly parser.

For the full parser API reference, see:
- [/guide/parser-api](/guide/parser-api)
- `stream-markdown-parser` README (parser-only package): https://www.npmjs.com/package/stream-markdown-parser

Highlights:

- `getMarkdown()` — create and configure a `markdown-it-ts` instance
- `parseMarkdownToStructure(content, md)` — turn a Markdown string into parsed nodes used by `MarkdownRender`
- `setDefaultMathOptions()` — global math options
- Streaming inline HTML mid-states (`html_inline`) — suppress partial tags and auto-close unclosed inline HTML for flicker-free streaming.

If you only need the parser (no Vue), install and import from `stream-markdown-parser`. Otherwise, `markstream-vue` re-exports the same helpers for convenience.

Try this quickly — parse a small string and render the result in your app:

```ts
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# Hello\n\nThis is a test', md)
// Render nodes with <MarkdownRender :nodes="nodes" />
```
