# stream-markdown-parser

[![NPM version](https://img.shields.io/npm/v/stream-markdown-parser?color=a1b858&label=)](https://www.npmjs.com/package/stream-markdown-parser)
[![中文版](https://img.shields.io/badge/docs-中文文档-blue)](README.zh-CN.md)
[![NPM downloads](https://img.shields.io/npm/dm/stream-markdown-parser)](https://www.npmjs.com/package/stream-markdown-parser)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/stream-markdown-parser)](https://bundlephobia.com/package/stream-markdown-parser)
[![License](https://img.shields.io/npm/l/stream-markdown-parser)](https://github.com/Simon-He95/markstream-vue/blob/main/license)

Pure markdown parser and renderer utilities with streaming support - framework agnostic.

This package contains the core markdown parsing logic extracted from `markstream-vue`, making it usable in any JavaScript/TypeScript project without Vue dependencies.

## Features

- 🚀 **Pure JavaScript** - No framework dependencies
- 📦 **Lightweight** - Minimal bundle size
- 🔧 **Extensible** - Plugin-based architecture
- 🎯 **Type-safe** - Full TypeScript support
- ⚡ **Fast** - Optimized for performance
- 🌊 **Streaming-friendly** - Progressive parsing support

> ℹ️ We now build on top of [`markdown-it-ts`](https://www.npmjs.com/package/markdown-it-ts), a TypeScript-first distribution of markdown-it. The API stays the same, but we only rely on its parsing pipeline and ship richer typings for tokens and hooks.

## Documentation

The full usage guide lives alongside the markstream-vue docs:

- English: https://markstream-vue-docs.simonhe.me/guide/api
- 中文: https://markstream-vue-docs.simonhe.me/zh/guide/api

This README highlights the parser-specific APIs; visit the docs for end-to-end integration tutorials (VitePress, workers, Tailwind, troubleshooting, etc.).

## Installation

```bash
pnpm add stream-markdown-parser
# or
npm install stream-markdown-parser
# or
yarn add stream-markdown-parser
```

## Quick API (TL;DR)

- `getMarkdown(msgId?, options?)` — create a `markdown-it-ts` instance with built-in plugins (task lists, sub/sup, math helpers, etc.). Also accepts `plugin`, `apply`, and `i18n` options.
- `registerMarkdownPlugin(plugin)` / `clearRegisteredMarkdownPlugins()` — add or remove global plugins that run for every `getMarkdown()` call (useful for feature flags or tests).
- `parseMarkdownToStructure(markdown, md, parseOptions)` — convert Markdown into the streaming-friendly AST consumed by `markstream-vue` and other renderers.
- `processTokens(tokens)` / `parseInlineTokens(children, content?, preToken?, options?)` — low-level helpers if you want to bypass the built-in AST pipeline.
- `sanitizeImageSrc(value)` — apply the same strict image URL policy used by Markstream image renderers.
- `sanitizeMermaidSvg(svg)` / `toSafeMermaidSvgMarkup(svg)` / `toSafeSvgElement(svg)` / `isBrokenMermaidSvg(svg)` — sanitize or validate Mermaid SVG with `DOMParser`; in plain Node runtimes without `DOMParser`, the sanitizer helpers return `null` / `''` / `null`.
- `applyMath`, `applyContainers`, `normalizeStandaloneBackslashT`, `findMatchingClose`, etc. — utilities for custom parsing or linting workflows.

## Usage

### Streaming-friendly pipeline

```
Markdown string
   ↓ getMarkdown() → markdown-it-ts instance with plugins
parseMarkdownToStructure(markdown, md) → AST (ParsedNode[])
   ↓ feed into your renderer (markstream-vue, custom UI, workers)
```

Reuse the same `md` instance when parsing multiple documents—plugin setup is the heaviest step. When integrating with [`markstream-vue`](https://www.npmjs.com/package/markstream-vue), pass the AST to `<MarkdownRender :nodes="nodes" />` or supply raw `content` and hand it the same parser options.

### Incremental / streaming example

When consuming an AI or SSE stream you can keep appending to a buffer, parse with the same `md` instance, and send the AST to the UI (e.g., `markstream-vue`) on every chunk:

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
let buffer = ''

async function handleChunk(chunk: string) {
  buffer += chunk
  const nodes = parseMarkdownToStructure(buffer, md)
  postMessage({ type: 'markdown:update', nodes })
}
```

In the UI layer, render `nodes` with `<MarkdownRender :nodes="nodes" />` to avoid re-parsing. See the [docs usage guide](https://markstream-vue-docs.simonhe.me/guide/usage) for end-to-end wiring.

### Basic example

```typescript
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

// Create a markdown-it-ts instance with default plugins
const md = getMarkdown()

// Parse markdown to our streaming-friendly AST structure
const nodes = parseMarkdownToStructure('# Hello World', md)
console.log(nodes)
// [{ type: 'heading', level: 1, children: [...] }]

// markdown-it-ts still exposes render() if you need HTML output,
// but this package now focuses on the token -> AST pipeline.
const html = md.render?.('# Hello World\n\nThis is **bold**.')
```

### With Math Options

```typescript
import { getMarkdown, setDefaultMathOptions } from 'stream-markdown-parser'

// Set global math options
setDefaultMathOptions({
  commands: ['infty', 'perp', 'alpha'],
  escapeExclamation: true
})

const md = getMarkdown()
```

### With Custom i18n

```typescript
import { getMarkdown } from 'stream-markdown-parser'

// Using translation map
const md = getMarkdown('editor-1', {
  i18n: {
    'common.copy': '复制',
  }
})

// Or using a translation function
const md = getMarkdown('editor-1', {
  i18n: (key: string) => translateFunction(key)
})
```

### With Plugins

```typescript
import customPlugin from 'markdown-it-custom-plugin'
import { getMarkdown } from 'stream-markdown-parser'

const md = getMarkdown('editor-1', {
  plugin: [
    [customPlugin, { /* options */ }]
  ]
})
```

### Advanced: Custom Rules

```typescript
import { getMarkdown } from 'stream-markdown-parser'

const md = getMarkdown('editor-1', {
  apply: [
    (md) => {
      // Add custom inline rule
      md.inline.ruler.before('emphasis', 'custom', (state, silent) => {
        // Your custom logic
        return false
      })
    }
  ]
})
```

### Extending globally

Need to add a plugin everywhere without touching each call site? Use the helper exports:

```ts
import {
  clearRegisteredMarkdownPlugins,
  registerMarkdownPlugin,
} from 'stream-markdown-parser'

registerMarkdownPlugin(myPlugin)

const md = getMarkdown()
// md now has `myPlugin` enabled in addition to anything passed via options

// For tests or teardown flows:
clearRegisteredMarkdownPlugins()
```

- `plugin` option → array of `md.use` invocations scoped to a single `getMarkdown` call.
- `apply` option → imperatively mutate the instance (`md.inline.ruler.before(...)`). Wrap in try/catch if you need to surface errors differently; the helper logs to console to preserve legacy behaviour.
- `registerMarkdownPlugin` → global singleton registry (handy in SSR or worker contexts where you want feature flags to apply everywhere).

## API

### Main Functions

#### `getMarkdown(msgId?, options?)`

Creates a configured `markdown-it-ts` instance (API-compatible with markdown-it).

**Parameters:**
- `msgId` (string, optional): Unique identifier for this instance. Default: `editor-${Date.now()}`
- `options` (GetMarkdownOptions, optional): Configuration options

**Options:**
```typescript
interface GetMarkdownOptions {
  // Array of markdown-it/markdown-it-ts plugins to use
  plugin?: Array<Plugin | [Plugin, any]>

  // Array of functions to mutate the md instance
  apply?: Array<(md: MarkdownIt) => void>

  // Translation function or translation map
  i18n?: ((key: string) => string) | Record<string, string>
}
```

#### `parseMarkdownToStructure(content, md, options?)`

Parses markdown content into a structured node tree.

**Parameters:**
- `content` (string): The markdown content to parse
- `md` (MarkdownItCore): A markdown-it-ts instance created with `getMarkdown()`
- `options` (ParseOptions, optional): Parsing options with hooks

> Warning: The default `streamParse: 'auto'` uses markdown-it-ts' stream parser
> for non-final top-level parses when `md.stream.enabled === true` and keeps the
> parser's latest source and token cache on that `md` instance. Final one-shot
> parses use the regular parser unless you pass `{ streamParse: true }`; if you
> reuse one `md` instance for unrelated one-shot documents, pass `{ final: true }`
> or `{ streamParse: false }`. Callers that do not want stream cache can opt out:

```ts
const oneShotNodes = parseMarkdownToStructure(source, md, { final: true })
const optOutNodes = parseMarkdownToStructure(source, md, { streamParse: false })
```

**Returns:** `ParsedNode[]` - An array of parsed nodes

#### `processTokens(tokens)`

Processes raw markdown-it tokens into a flat array.

#### `parseInlineTokens(tokens, content?, preToken?, options?)`

Parses inline markdown-it-ts tokens into renderer nodes. Pass the inline token array plus the optional raw `content` string (from the parent token), an optional previous token, and inline parse options (`requireClosingStrong`, `customHtmlTags`, `validateLink`).

### Configuration Functions

#### `setDefaultMathOptions(options)`

Set global math rendering options.

**Parameters:**
- `options` (MathOptions): Math configuration options

```typescript
interface MathOptions {
  commands?: readonly string[] // LaTeX commands to escape
  escapeExclamation?: boolean // Escape standalone '!' (default: true)
}
```

### Parse hooks (fine-grained transforms)

ParseOptions supports the following hooks and flags:

```ts
interface ParseOptions {
  preTransformTokens?: (tokens: Token[]) => Token[]
  postTransformTokens?: (tokens: Token[]) => Token[]
  // Custom HTML-like tags to emit as custom nodes (e.g. ['thinking'])
  // Use tag-like names such as 'thinking', 'answer-box', or 'my_component'.
  customHtmlTags?: string[]
  // Validate link href before emitting a `link` node; false -> plain text
  validateLink?: (url: string) => boolean
  // When true, treats the input as complete (end-of-stream)
  final?: boolean
  // 'auto' uses stream parsing for non-final top-level documents.
  // Set true to force stream parsing for final parses; false to opt out.
  streamParse?: boolean | 'auto'
  // Require closing `**` for strong parsing (default: false)
  requireClosingStrong?: boolean
}
```

Example — flag AI “thinking” blocks:

```ts
const parseOptions = {
  customHtmlTags: ['thinking'],
}

const nodes = parseMarkdownToStructure(markdown, md, parseOptions)
const tagged = nodes.map(node =>
  node.type === 'html_block' && /<thinking>/.test((node as any).content ?? '')
    ? { ...node, meta: { type: 'thinking' } }
    : node,
)
```

Use the metadata in your renderer to show custom UI without mangling the original Markdown.

Example — enforce safe link protocols:

```ts
const md = getMarkdown('safe-links')
md.set?.({
  validateLink: (url: string) => !/^\s*javascript:/i.test(url.trim()),
})

const nodes = parseMarkdownToStructure(
  '[ok](https://example.com) [bad](javascript:alert(1))',
  md,
  { final: true },
)
// "ok" stays a link node; "bad" is downgraded to plain text
```

### Unknown HTML-like tags

By default, non-standard HTML-like tags (for example `<question>`) are rendered as raw HTML elements once they are complete. Incomplete or malformed fragments stay as **literal text** so they do not swallow surrounding content during streaming or final renders. If you want them emitted as custom nodes (`type: 'question'` with parsed attrs/content), opt in via `customHtmlTags`.

### Utility Functions

#### `isMathLike(content)`

Heuristic function to detect if content looks like mathematical notation.

**Parameters:**
- `content` (string): Content to check

**Returns:** `boolean`

#### `findMatchingClose(src, startIdx, open, close)`

Find the matching closing delimiter in a string, handling nested pairs.

**Parameters:**
- `src` (string): Source string
- `startIdx` (number): Start index to search from
- `open` (string): Opening delimiter
- `close` (string): Closing delimiter

**Returns:** `number` - Index of matching close, or -1 if not found

## Tips & troubleshooting

- **Reuse parser instances**: cache `getMarkdown()` results per worker/request to avoid re-registering plugins.
- **Server-side parsing**: run `parseMarkdownToStructure` on the server, ship the AST to the client, and hydrate with `markstream-vue` for deterministic output.
- **Custom HTML widgets**: pre-extract `<MyWidget>` blocks before parsing (replace with placeholders) and reinject them during rendering instead of mutating `html_block` nodes post-parse.
- **Styling**: when piping nodes into `markstream-vue`, follow the docs [CSS checklist](https://markstream-vue-docs.simonhe.me/guide/troubleshooting#css-looks-wrong-start-here) so Tailwind/UnoCSS don’t override library styles.
- **Error handling**: the `apply` hook swallows exceptions to maintain backwards compatibility. If you want strict mode, wrap your mutators before passing them in and rethrow/log as needed.

#### `parseFenceToken(token)`

Parse a code fence token into a CodeBlockNode.

**Parameters:**
- `token` (MarkdownToken): markdown-it token

**Returns:** `CodeBlockNode`

#### `normalizeStandaloneBackslashT(content, options?)`

Normalize backslash-t sequences in math content.

**Parameters:**
- `content` (string): Content to normalize
- `options` (MathOptions, optional): Math options

**Returns:** `string`

### Lower-level helpers

If you need full control over how tokens are transformed, you can import the primitive builders directly:

```ts
import type { MarkdownToken } from 'stream-markdown-parser'
import {

  parseInlineTokens,
  processTokens
} from 'stream-markdown-parser'

const tokens: MarkdownToken[] = md.parse(markdown, {})
const nodes = processTokens(tokens)
// or operate at inline granularity:
const inlineNodes = parseInlineTokens(tokens[0].children ?? [], tokens[0].content ?? '')
```

`processTokens` is what `parseMarkdownToStructure` uses internally, so you can remix the AST pipeline without reimplementing the Markdown-it loop.

### Plugin Functions

#### `applyMath(md, options?)`

Apply math plugin to markdown-it instance.

**Parameters:**
- `md` (MarkdownIt): markdown-it instance
- `options` (MathOptions, optional): Math rendering options

#### `applyContainers(md)`

Apply container plugins to markdown-it instance.

**Parameters:**
- `md` (MarkdownIt): markdown-it instance

### Constants

#### `KATEX_COMMANDS`

Array of common KaTeX commands for escaping.

#### `TEX_BRACE_COMMANDS`

Array of TeX commands that use braces.

#### `ESCAPED_TEX_BRACE_COMMANDS`

Escaped version of TEX_BRACE_COMMANDS for regex use.

## Types

All TypeScript types are exported:

```typescript
import type {
  // Node types
  CodeBlockNode,
  GetMarkdownOptions,
  HeadingNode,
  ListItemNode,
  ListNode,
  MathOptions,
  ParagraphNode,
  ParsedNode,
  ParseOptions,
  // ... and more
} from 'stream-markdown-parser'
```

### Node Types

The parser exports various node types representing different markdown elements:

- `TextNode`, `HeadingNode`, `ParagraphNode`
- `ListNode`, `ListItemNode`
- `CodeBlockNode`, `InlineCodeNode`
- `LinkNode`, `ImageNode`
- `BlockquoteNode`, `TableNode`
- `MathBlockNode`, `MathInlineNode`
- And many more...

## Default Plugins

This package comes with the following markdown-it plugins pre-configured:

- `markdown-it-sub` - Subscript support (`H~2~O`)
- `markdown-it-sup` - Superscript support (`x^2^`)
- `markdown-it-mark` - Highlight/mark support (`==highlighted==`)
- `markdown-it-task-checkbox` - Task list support (`- [ ] Todo`)
- `markdown-it-ins` - Insert tag support (`++inserted++`)
- `markdown-it-footnote` - Footnote support
- `markdown-it-container` - Custom container support (`::: warning`, `::: tip`, etc.)
- Math support - LaTeX math rendering with `$...$` and `$$...$$`

## Framework Integration

While this package is framework-agnostic, it's designed to work seamlessly with:

- ✅ **Node.js** - Server-side rendering
- ✅ **Vue 3** - Use with `markstream-vue` (or your own renderer)
- ✅ **React** - Use parsed nodes for custom rendering
- ✅ **Vanilla JS** - Direct HTML rendering
- ✅ **Any framework** - Parse to AST and render as needed

### Example — dedicated worker feeding markstream-vue

Offload parsing to a Web Worker while the UI renders via `markstream-vue`:

```ts
// worker.ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
let buffer = ''

globalThis.addEventListener('message', (event) => {
  if (event.data.type === 'chunk') {
    buffer += event.data.value
    const nodes = parseMarkdownToStructure(buffer, md)
    globalThis.postMessage({ type: 'update', nodes })
  }
})
```

```ts
// ui.ts
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
worker.addEventListener('message', (event) => {
  if (event.data.type === 'update')
    nodes.value = event.data.nodes
})
```

```vue
<MarkdownRender :nodes="nodes" />
```

This pattern keeps Markdown-it work off the main thread and lets you reuse the same AST in any framework.

## Migration from `markstream-vue` (parser exports)

If you're currently importing parser helpers from `markstream-vue`, you can switch to the dedicated package:

```typescript
// before
import { getMarkdown } from 'markstream-vue'

// after
import { getMarkdown } from 'stream-markdown-parser'
```

All APIs remain the same. See the [migration guide](https://markstream-vue-docs.simonhe.me/monorepo-migration) for details.

## Performance

- **Lightweight**: ~65KB minified (13KB gzipped)
- **Fast**: Optimized for real-time parsing
- **Tree-shakeable**: Only import what you need
- **Few dependencies**: `markdown-it-ts` + a small set of markdown-it plugins

## Contributing

Issues and PRs welcome! Please read the [contribution guidelines](https://github.com/Simon-He95/markstream-vue/blob/main/CONTRIBUTING.md).

## License

MIT © Simon He

## Related

- [markstream-vue](https://www.npmjs.com/package/markstream-vue) - Full-featured Vue 3 Markdown renderer
