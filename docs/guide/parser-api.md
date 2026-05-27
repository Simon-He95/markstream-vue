---
description: Use the parser API to hook into tokens, AST transforms, and markdown-it customization before markstream-vue renders nodes.
---

# Parser — API Deep Dive

This page extracts the most important functions, types and helpers from `packages/markdown-parser` for a focused API reference.

## Main functions

### `getMarkdown(msgId?, options?)`
Create a configured `markdown-it-ts` instance.

Parameters:
- `msgId` (string | optional): identifier for this instance
- `options` (GetMarkdownOptions | optional): configuration options

Options include:
- `plugin`: list of Markdown-it plugins
- `apply`: functions to mutate the `MarkdownIt` instance
- `i18n`: translator map or function
- `customHtmlTags`: custom HTML-like tags treated as common during streaming mid‑state handling (e.g. `['thinking']`)

### `parseMarkdownToStructure(content, md, options?)`
Parse a Markdown string into a streaming-friendly AST used by the renderer.

Parameters:
- `content` (string): markdown to parse
- `md` (MarkdownItCore): a markdown-it-ts instance created by `getMarkdown()`
- `options` (ParseOptions, optional): contains transform hooks described below

> Warning: The default `streamParse: 'auto'` uses `md.stream.parse` for non-final top-level parses when available and retains the latest source/token cache on the `md` instance. Final one-shot parses use the regular parser unless you pass `{ streamParse: true }`; pass `{ streamParse: false }` to opt out. If you reuse one `md` instance for unrelated one-shot documents, pass `{ final: true }` or `{ streamParse: false }`.

```ts
const oneShotNodes = parseMarkdownToStructure(source, md, { final: true })
```

> Tip for custom components: for simple HTML‑like tags such as `<thinking>`, prefer the built‑in `customHtmlTags` / `custom-html-tags` allowlist so the parser emits custom nodes directly. Use `preTransformTokens` only when you need to reshape `content`/`attrs`. See [custom component parsing](/guide/advanced#custom-component-parsing) for details.

Returns: `ParsedNode[]`

### ParseOptions: `final` (end-of-stream mode)

In streaming contexts (SSE / AI chat), the parser intentionally emits some **mid-state (`loading`) nodes** to reduce flicker and keep rendering stable while content is incomplete, for example:
- Unclosed block math (starts with `$$` but the closing `$$` hasn’t arrived yet)
- Unclosed code fences (only the opening ``` has arrived)

When you know the message is complete, switch the parser to “final” mode:

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure(buffer, md, { final: true })
```

What `final: true` does:
- Disables mid-state loading behavior for unclosed constructs (so trailing `$$...` won’t produce perpetual `math_block/loading` nodes).
- Treats EOF as an implicit closing fence so code blocks don’t get stuck in loading.

### `processTokens(tokens)`
Converts raw markdown-it tokens into a processed token list ready for the AST phase.

### `parseInlineTokens(tokens, content?, preToken?, options?)`
Parse inline tokens into inline nodes usable by the renderer.

## Configuration & helpers

### `setDefaultMathOptions(options)`
Set global math rendering options for KaTeX. Example:

```ts
setDefaultMathOptions({
  commands: ['infty', 'perp'],
  escapeExclamation: true
})
```

### Heuristics and utilities
- `isMathLike(content)` — heuristic to detect whether a string looks like math
- `findMatchingClose(src, startIdx, open, close)` — find matching delimiter
- `parseFenceToken(token)` — parse code fence into `CodeBlockNode`
- `normalizeStandaloneBackslashT(content, options?)` — normalize backslash-t sequences in math content
- `sanitizeImageSrc(value)` — apply the same strict image URL policy used by the built-in image renderers
- `sanitizeMermaidSvg(svg)` / `toSafeMermaidSvgMarkup(svg)` / `toSafeSvgElement(svg)` / `isBrokenMermaidSvg(svg)` — sanitize or validate Mermaid SVG with `DOMParser`; in plain Node runtimes without `DOMParser`, the sanitizer helpers return `null` / `''` / `null`

## Parse hooks (advanced)
When calling `parseMarkdownToStructure` you can pass `ParseOptions` with these hooks:
- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — operate immediately after the `markdown-it` parser runs
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — transform tokens after internal fixes

If you need to reshape the AST, post-process the returned `ParsedNode[]` and pass it to `MarkdownRender` via the `nodes` prop.

These hooks are also available via `parseOptions` prop on the `MarkdownRender` component (applies only when using `content` instead of `nodes`).

### Unknown HTML-like tags (default behavior)

Non-standard HTML-like tags (for example `<question>`) render as raw HTML elements once complete. Incomplete or malformed fragments are kept as **literal text** so they do not swallow surrounding content.

If you want a custom tag to be emitted as a custom node (so it can be mapped via `setCustomComponents` with parsed attrs/content), add it to `customHtmlTags`.

### ParseOptions: `requireClosingStrong`

`requireClosingStrong` (boolean | optional) controls how the parser treats unmatched `**` strong delimiters inside inline content. Default: `false` (streaming-friendly).

- **true**: The parser requires a matching closing `**` to create a strong node. Unclosed `**` are left as plain text. This is the recommended, strict mode for non-interactive rendering and avoids incorrect strong parsing inside constructs like link text (for example, `[**cxx](xxx)`).
- **false**: The parser allows mid-state/unfinished `**` (useful for editor live-preview scenarios), which can produce a temporary strong node even when the closing `**` is missing.

Example — strict parsing (recommended for non-streaming):

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('[**cxx](xxx)', md, { requireClosingStrong: true })
// the text `[**cxx](xxx)` will be preserved without creating a dangling strong node
```

Example — editor-friendly parsing:

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('[**cxx](xxx)', md, { requireClosingStrong: false })
// allows creating a temporary/"mid-state" strong node for live-edit previews
```

### ParseOptions: `validateLink`

`validateLink` (`(url: string) => boolean` | optional) controls whether a parsed link is emitted as a `link` node.

- Returns **true**: emit a normal `link` node.
- Returns **false**: downgrade the link to plain text (keep link text only).

Priority and integration:
- `parseMarkdownToStructure(..., { validateLink })` has highest priority.
- If omitted, the parser reuses the rule from the MarkdownIt instance when available (for example via `md.set({ validateLink })` or `md.options.validateLink`).

Example — block unsafe schemes while keeping normal https links:

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown('safe-links')
md.set?.({
  validateLink: (url: string) => !/^\s*javascript:/i.test(url.trim()),
})

const nodes = parseMarkdownToStructure(
  '[safe](https://example.com) [unsafe](javascript:alert(1))',
  md,
  { final: true },
)
// "safe" is emitted as a link node; "unsafe" is emitted as plain text
```

### Stray `$$` delimiters (empty math)

Sometimes streams contain an accidental `$$` sequence, e.g.

```md
adasd $$ dasdsa
dasdsad
```

If `$$` is misinterpreted as a math delimiter with empty content, the renderer can appear “stuck” because there is no math content to render. The parser now treats empty `$$` as plain text to avoid perpetual loading spinners.

### Streaming inline HTML mid-states (`html_inline`)

For streaming/chat/editor scenarios, inline HTML often arrives in partial chunks. The parser applies a conservative mid‑state strategy to reduce flicker while still rendering stable HTML as soon as possible.

Behavior:
- **Suppress incomplete tags** in text tokens until `>` arrives. Examples of suppressed fragments: `<span class="a"`, trailing `<`, `</sp`, trailing `</`. These fragments are not emitted as plain text nodes to avoid jitter.
- **Recognize complete open tags** for common HTML tags (conservative allowlist). Once `<tag ...>` is complete, it becomes an `html_inline` node.
- **If no explicit closing tag exists yet**, the parser:
  - Treats all following inline tokens as that tag’s inner content.
  - Auto‑appends `</tag>` to `content/raw` so the fragment is valid HTML for rendering.
  - Marks the node as `loading: true` and `autoClosed: true` to indicate the source is still incomplete.
- **When the real closing tag arrives**, `autoClosed` disappears and `loading` becomes `false`.

Extending the allowlist:
To apply the same mid‑state suppression for custom tags (for example `<thinking>`), pass `customHtmlTags` when creating the markdown instance:

```ts
const md = getMarkdown('chat', { customHtmlTags: ['thinking'] })
```

Emitting custom nodes:
If you want those tags to become custom node types (so `setCustomComponents` can map them directly), also pass `customHtmlTags` in `ParseOptions` or use the `custom-html-tags` prop on `MarkdownRender` (which wires this automatically):

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown('chat', { customHtmlTags: ['thinking'] })
const nodes = parseMarkdownToStructure(source, md, { customHtmlTags: ['thinking'] })
```

Renderer note:
- `HtmlInlineNode` renders raw text only when `loading === true` and `autoClosed !== true`.
  Auto‑closed mid‑states still render HTML (via `innerHTML`) but keep `loading=true` for UX/state.

## Types
A condensed list of exported types to reference in your code:

- `CodeBlockNode`, `GetMarkdownOptions`, `HeadingNode`, `ListItemNode`, `ListNode`, `MathOptions`, `ParagraphNode`, `ParsedNode`, `ParseOptions`, etc.

Use `import type { ParsedNode, CodeBlockNode } from 'stream-markdown-parser'` in your TypeScript code.

## Plugins & Defaults
This package includes a set of parsing helpers and convenience plugins for common flows (for example: footnotes, task checkboxes, sub/sup/mark). Note that emoji handling is no longer enabled by default — consumers who want emoji support should register the emoji plugin explicitly.

You can add custom plugins in several ways:
- Pass plugins to `getMarkdown` via the `plugin` option.
- Use `apply` functions in `getMarkdown` options to mutate the returned `MarkdownIt` instance.
- When using the `MarkdownRender` component, use the `customMarkdownIt` prop to receive and mutate the `MarkdownIt` instance used for that renderer.

Example — enable emoji via the component prop:

```vue
<script setup lang="ts">
import type { MarkdownIt } from 'markdown-it-ts'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import MarkdownRender from 'markstream-vue'

function enableEmoji(md: MarkdownIt) {
  md.use(markdownItEmoji)
  return md
}
</script>

<template>
  <MarkdownRender :content="source" :custom-markdown-it="enableEmoji" />
</template>
```

## Examples
Use the playground to test custom‑tag parsing quickly. For simple tags like `<thinking>`, pass `customHtmlTags` (or `custom-html-tags` on the component) so the parser emits `type: 'thinking'` nodes automatically, then map them via `setCustomComponents`.

For full details and more examples, see `packages/markdown-parser/README.md` in the repository.

Try this — quick test of a parse option:

```ts
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('Hello **world**', md)
console.log(nodes)
// Render with <MarkdownRender :nodes="nodes" />
```

### Custom components and tag-like elements

Tag-like custom elements (for example `<MyWidget ...>...</MyWidget>`) produce complex `html_block`/inline token shapes that are often difficult to reconstruct reliably from the parsed AST using simple regex or string splicing. To reduce maintenance cost and avoid brittle post-processing, we recommend extracting those raw component strings before feeding the remaining content to the Markdown parser and rendering the extracted parts separately as Vue components.

Recommended approach:
- Pre-scan the incoming Markdown content and extract custom-component blocks into a small map keyed by an id (or placeholder).
- Replace the original markup in the Markdown string with a stable placeholder token (for example `[[CUSTOM:1]]`).
- Let the Markdown parser run on the placeholder-bearing content and then render the AST as usual.
- In your rendering layer, render placeholders by looking up the extracted component string and mounting the corresponding Vue component (or compile it via a lightweight renderer).

Benefits:
- Avoids brittle AST post-processing for nested/tag-like HTML.
- Keeps the Markdown parsing focused on Markdown semantics.
- Allows you to control hydration and scope for custom components separately.

Example (simple sketch):

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

// 1) extract custom tags
const extracted = new Map<string, string>()
let id = 1
const contentWithPlaceholders = source.replace(/<MyWidget[\s\S]*?<\/MyWidget>/g, (m) => {
  const key = `[[CUSTOM:${id++}]]`
  extracted.set(key, m)
  return key
})

// 2) parse the markdown with placeholders
const md = getMarkdown()
const nodes = parseMarkdownToStructure(contentWithPlaceholders, md)

// 3) render: when you encounter a placeholder node, mount your extracted component
// Example pseudo-Vue render logic:
// if (node.type === 'text' && extracted.has(node.content)) {
//   return h(CustomWrapper, { raw: extracted.get(node.content) })
// }
```

### Thinking blocks and small inline-rich fragments

If you only need lightweight rendering for short "thinking" fragments (for example AI assistant thinking traces), extract those fragments and parse them separately, then render with a dedicated `MarkdownRender` instance. Keep complex tag-like custom components extracted as shown above so they don’t get mixed into the main AST.

This hybrid approach minimizes fragile string-manipulation of the Markdown AST while giving you full control over custom component hydration and rendering scope.
