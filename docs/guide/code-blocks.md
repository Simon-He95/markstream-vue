# Code Block Rendering

## Overview

Code blocks can be rendered in three ways depending on which optional dependencies you install and how you configure the library:

- Monaco (recommended for large/interactive code blocks): installs and uses `stream-monaco` to provide an editor-like, incremental rendering experience. The library lazy-loads `stream-monaco` at runtime when available.
- Markdown mode (streaming Markdown-based renderer): install `stream-markdown` and override the `code_block` node via `setCustomComponents` to provide a Markdown-driven code block renderer.
- Fallback (no extra deps): if neither optional package is installed, code blocks render as plain `<pre><code>` blocks (basic styling / no Monaco features).

## Monaco (recommended)

- Install:

```bash
pnpm add stream-monaco
# or
npm i stream-monaco
```

- Behavior: when `stream-monaco` is present the built-in `CodeBlockNode` will use Monaco-based streaming updates for large or frequently-updated code blocks.

- Vite worker note: Monaco and some worker-backed features require appropriate worker bundling configuration in your bundler (Vite) so the editor/workers are available at runtime. See [/nuxt-ssr](/nuxt-ssr) for guidance and examples of configuring workers and client-only initialization.
- See also: [/guide/monaco](/guide/monaco) for Vite `?worker` examples and explicit worker registration snippets.

## Markdown mode (use stream-markdown)

- Install:

```bash
pnpm add stream-markdown
# or
npm i stream-markdown
```

- Override the `code_block` node via `setCustomComponents` to register a Markdown-style code block renderer. Example:

```ts
import { setCustomComponents } from 'markstream-vue'
import MyMarkdownCodeBlock from './MyMarkdownCodeBlock.vue'

setCustomComponents({ code_block: MyMarkdownCodeBlock })
```

Once set, Markdown-based renderers (from `stream-markdown` or your own component) will be used for `code_block` nodes.

## Fallback

If you don't install either optional package the renderer falls back to a simple `pre`/`code` representation.

## Links & further reading

- Worker / SSR guidance: [/nuxt-ssr](/nuxt-ssr)
- Installation notes: [/guide/installation](/guide/installation)

Try this — simple CodeBlock render:

```vue
<CodeBlockNode :node="{ type: 'code_block', language: 'js', code: 'console.log(42)', raw: 'console.log(42)' }" />
```
