# Monaco Editor Integration

Monaco integration is provided by `stream-monaco` and is optional. It supports fast, incremental updates for large code blocks.

Install:

```bash
pnpm add stream-monaco
```

Use `CodeBlockNode` (default) to render Monaco-powered code blocks. For read-only usage, use `MarkdownCodeBlockNode`.

Tips:
- Defer Monaco initialization for offscreen code blocks
- Use `codeBlockStream: false` to avoid partial updates if desired
- No additional CSS import is required

![Monaco demo](/screenshots/codeblock-demo.svg)

### Vite & worker setup

Monaco requires worker packaging for production builds. Use `vite-plugin-monaco-editor-esm` to ensure workers are bundled into your app's build output. Example config:

```ts
import path from 'node:path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: [
        'editorWorkerService',
        'typescript',
        'css',
        'html',
        'json',
      ],
      customDistPath(root, buildOutDir, base) {
        return path.resolve(buildOutDir, 'monacoeditorwork')
      },
    }),
  ],
})
```

### Preloading Monaco

To avoid a first-render flash when the first code block mounts, preload the Monaco integration during app initialization or on first route mount:

```ts
import { getUseMonaco } from 'markstream-vue'

getUseMonaco()
```

`getUseMonaco` attempts to dynamically import `stream-monaco` and call its helper to register workers; if not available it fails gracefully and the code block falls back to a lightweight rendering.

Quick try — Render a monaco-enabled code block (after installing `stream-monaco`):

```vue
<script setup>
const node = { type: 'code_block', language: 'js', raw: 'console.log(123)', code: 'console.log(123)' }
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```

### Add extra languages & themes

Only a minimal set of Monaco languages ships with the default integration to keep the first render fast. When you need additional grammars (Rust, Go, Bash, etc.) or want to ship your own VS Code themes, pass them through `monacoOptions` — either directly on `CodeBlockNode` or globally via `MarkdownRender`'s `codeBlockMonacoOptions` prop. The object is forwarded to `useMonaco()` unchanged.

> `languages` is **not** appended to the built-in defaults from `stream-monaco`; providing this array replaces the internal `defaultLanguages`. Include every language you need (even the original ones) whenever you override it.

```vue
<script setup lang="ts">
import type { MonacoTheme } from 'stream-monaco'
import MarkdownRender from 'markstream-vue'

const docsDark: MonacoTheme = {
  name: 'docs-dark',
  base: 'vs-dark',
  inherit: true,
  colors: {
    'editor.background': '#05060a',
  },
  rules: [],
}

const docsLight: MonacoTheme = {
  name: 'docs-light',
  base: 'vs',
  inherit: true,
  colors: {
    'editor.background': '#ffffff',
  },
  rules: [],
}

const monacoOptions = {
  languages: ['javascript', 'python', 'rust', 'shell'],
  themes: [docsDark, docsLight],
  theme: 'docs-dark',
  MAX_HEIGHT: 640,
}

const markdown = `
\`\`\`python
print("extra languages go here")
\`\`\`

\`\`\`rust
fn main() {}
\`\`\`
`
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="markdown"
    :code-block-monaco-options="monacoOptions"
  />
</template>
```

> Each entry in `languages` can be a Monaco language id string or the loader signature that `stream-monaco` documents (for lazy language bundles). When not using `MarkdownRender`, pass the same `monacoOptions` object directly to `CodeBlockNode` via `:monaco-options`.
