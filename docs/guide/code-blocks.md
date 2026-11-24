---
title: Code Block Rendering
description: How markstream-vue renders code blocks with the optional stream-diffs File/FileDiff surface or the plain pre/code fallback.
keywords:
  - code block rendering
  - streaming code blocks
  - stream-diffs
  - code block options
---
# Code Block Rendering

## Overview

Code blocks can be rendered in two ways depending on which optional dependency you install:

- Enhanced surface (recommended for large or interactive code blocks): install `stream-diffs` for File and FileDiff rendering, syntax highlighting, and diff interactions. `CodeBlockNode` loads the core runtime on demand after the code block has completed streaming and entered the viewport.
- Fallback (no extra deps): if `stream-diffs` is not installed, code blocks render as plain `<pre><code>` blocks with basic styling.

## stream-diffs surface (recommended)

- Install:

```bash
pnpm add stream-diffs
# or
npm i stream-diffs
```

- Boundary: the `stream-diffs` root entry is framework-agnostic. Its controllers receive an `HTMLElement` and plain code/diff data; it has no Vue lifecycle. `stream-diffs/vue` is a separate optional convenience entry and is not used by `markstream-vue`.
- Behavior: this Vue adapter keeps one shared `PreCodeBlock` surface while content is streaming. `renderCodeBlocksAsPre` uses that exact component and the same resolved defaults. Once the block is complete and visible, `CodeBlockNode` mounts one `stream-diffs` File or FileDiff surface and applies language highlighting.
- The shared pre and enhanced surfaces use the same resolved font size, line height, font family, tab size, padding, overflow, line-number gutter, and theme background. The zero-config pre background is `vitesse-dark` (`#121212`) when `isDark` is true and `vitesse-light` (`#ffffff`) otherwise, matching the default enhanced theme before the first highlighted frame.
- The fallback and enhanced surfaces reserve a four-character minimum line-number column. This keeps the gutter stable while streamed content crosses the 10, 100, or 1000 line boundary; longer line numbers expand the column as needed.
- `CodeBlockShell` owns the title and action bar. The inner `data-diffs-header` is disabled so File surfaces do not render a second header.
- No worker plugin or extra CSS import is required for this integration. See also: [/guide/code-block-runtime](/guide/code-block-runtime) for runtime and preload details.

### Streaming blocks highlight once, by design

While a fence is still streaming, the block renders the shared plain `PreCodeBlock`: themed background, foreground, gutter, and line numbers, but no token colors. Syntax highlighting runs once, after the fence closes and the block is in or near the viewport; a block that finishes off-screen is highlighted when it scrolls into range.

This is deliberate, not a rendering regression. Re-tokenizing a growing fence on every chunk costs more than it returns, and an unfinished line has no stable grammar to color. Expect plain text mid-stream and colors after it settles.

The regression worth watching for is the opposite shape: a block that already showed token colors falling back to plain text. `pnpm test:e2e:codeblock-highlight-stability` fails on exactly that transition.

### Configuration

Use the renderer-neutral `codeBlockOptions` prop on either `MarkdownRender` / `NodeRenderer` or a directly mounted `CodeBlockNode`. The same public `CodeBlockOptions` type is exported by all six framework adapters.

```vue
<script setup lang="ts">
import type { CodeBlockOptions } from 'markstream-vue'

const codeBlockOptions: CodeBlockOptions = {
  fontSize: 13,
  overflow: 'wrap',
  diffStyle: 'unified',
  expandUnchanged: false,
  enableLineSelection: true,
}
</script>

<template>
  <MarkdownRender
    :content="content"
    :code-block-options="codeBlockOptions"
  />
</template>
```

Typography/layout fields (`fontSize`, `lineHeight`, `fontFamily`, numeric-pixel `maxHeight`, numeric-pixel symmetric `padding`, `tabSize`) are coordinated by Markstream so the streaming fallback and finalized surface match. Supported File/FileDiff fields include `disableLineNumbers`, `overflow`, highlighter limits, diff layout/folding, interactions, selection callbacks, annotations, `onController`, and `workerManager`. Theme, language/content, streaming state, header, mounting, reveal, and disposal stay host-owned and take precedence.

Themes are registered string names. Direct `CodeBlockNode.theme` accepts a string or `{ dark, light }`, while `themes` is the `[dark, light]` pair to load. A former Monaco JSON theme object has no direct rename: use `registerCustomTheme` from `stream-diffs/pierre`, then pass its name.

See [/guide/code-block-runtime](/guide/code-block-runtime) for the full runtime behavior, diff interactions, and optional preload.

### Theming the fallback surface

The shared `PreCodeBlock` fallback (shown while content streams, used by `renderCodeBlocksAsPre`, and retained when no enhanced runtime is installed) resolves its background from the same host-owned theme selection as the enhanced surface. The default pair is `vitesse-dark` / `vitesse-light`; custom theme names may provide matching fallback colors through `--markstream-code-theme-bg` and `--markstream-code-theme-fg`. The remaining shell tokens — `--code-border`, `--code-header-bg`, `--code-action-fg`, `--code-line-number`, etc. — continue to control shared chrome.

### Language icon lazy loading

To keep the main bundle smaller, infrequent language icons are split into an async chunk:

- Common languages (JS/TS/HTML/CSS/JSON/Python/etc.) stay in the main bundle.
- Rare languages load on demand and will update icon output automatically after the async chunk resolves.
- If you prefer to avoid first-hit fallback icons, preload once during app idle:

```ts twoslash
import { preloadExtendedLanguageIcons } from 'markstream-vue'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

## Fallback

If you don't install `stream-diffs`, the code block loader returns `null` and the renderer falls back to a simple `pre`/`code` representation. The fallback still shows line numbers and follows the `--code-*` theming tokens.

Fallback line numbers count logical source lines delimited by `\n`, `\r\n`, or `\r`. When `codeBlockOptions.overflow` is `wrap`, a long logical line may occupy multiple visual rows, but it keeps one line number and pushes the next logical line down by its wrapped height:

```text
1 │ const short = true
2 │ const long = "one logical source line that wraps
  │ onto another visual row"
3 │ return long
```

Automatic wrapping never creates an additional source line number or diff row. The default is `overflow: 'wrap'`, and the same value is applied to the fallback and enhanced code surface. With `overflow: 'scroll'`, both surfaces keep non-wrapping content and horizontal scrolling.

For unified and split diffs, the fallback and finalized surface use the same unchanged-region threshold. `No newline at end of file` is shown only for a source that actually lacks a final LF, uses a neutral metadata foreground/background, and occupies the same visible height in both surfaces. Added and removed line backgrounds have the same effective composited color in both surfaces; the fallback must not paint the same translucent fill in overlapping layers. When diff rows wrap, the added/removed content background, gutter marker, and line-number background fill the complete logical row; changing between wrap and scroll discards the previous measured row height immediately.

`maxHeight` is also a shared visibility boundary. Content that fits below it remains fully visible in both surfaces. Content that exceeds it remains reachable through the same internal scrolling behavior; the finalized diff host must not clip rows with `overflow: hidden` while the outer shell keeps a larger blank height.

## Links & further reading

- Worker / SSR guidance: [/nuxt-ssr](/nuxt-ssr)
- Installation notes: [/guide/installation](/guide/installation)

Try this — simple CodeBlock render:

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(42)',
  raw: 'console.log(42)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode
    :node="node"
    :code-block-options="{ overflow: 'wrap', disableLineNumbers: true }"
  />
</template>
```
