# markstream-svelte

Svelte 5 streaming Markdown renderer for AI chat, LLM token streams, SSE/WebSocket output, incomplete Markdown states, long documents, custom components, Mermaid, KaTeX, stream-diffs code blocks, D2, and Infographic.

The coordinated 2.0 family beta will use `markstream-svelte@next`. Before installing, verify that `npm view markstream-svelte@next version` reports `0.1.0-beta.1`. It removes the former Monaco code-block API in favor of `stream-diffs`; read the [coordinated 2.0 family migration guide](https://markstream.simonhe.me/guide/migration-2-0) before upgrading.

```bash
pnpm add markstream-svelte@next svelte@^5 stream-diffs
```

## When to use it

Use `markstream-svelte` when Markdown changes while users are reading it:
LLM output, SSE streams, WebSocket streams, AI chat messages, long generated answers,
progressive diagrams, math, or code blocks.

For normal chat streaming, start with the raw `content` string path. Use pre-parsed
`nodes` only when another part of your app already owns the parser or AST state.

## Known limitations

- **Svelte 5 only.** Svelte 4 is not supported.
- This package is currently beta. Check npm and the [Svelte guide](https://markstream.simonhe.me/guide/svelte) for the latest API maturity.
- It is not the first choice for short static Markdown or apps that require a fully stable Svelte 4-compatible API.

## Install

```bash
pnpm add markstream-svelte svelte@^5
```

Optional heavy renderers stay as peer dependencies, matching the Vue and React packages.
Plain Markdown does not require these packages:

```bash
pnpm add katex mermaid stream-diffs @terrastruct/d2 @antv/infographic
```

`stream-diffs` powers the enhanced code blocks (smaller runtime, no `monaco-editor`).

## Enhanced Code Blocks

`CodeBlockNode` renders a single code block with the header, toolbar, and a `stream-diffs` File / FileDiff surface. Inside `MarkdownRender`, code blocks resolve to the same runtime automatically.

```svelte
<script lang="ts">
  import type { CodeBlockOptions } from 'markstream-svelte'
  import { CodeBlockNode } from 'markstream-svelte'

  const node = {
    type: 'code_block',
    language: 'ts',
    code: 'const answer = 42',
    raw: 'const answer = 42',
  }

  const codeBlockOptions: CodeBlockOptions = {
    overflow: 'wrap',
    diffStyle: 'unified',
    enableLineSelection: true,
  }
</script>

<CodeBlockNode {node} {codeBlockOptions} isDark showHeader />
```

Direct `CodeBlockNode` and top-level `MarkdownRender` both accept `codeBlockOptions`. It covers host-managed typography/layout and supported File/FileDiff, interaction, annotation, and callback fields; `maxHeight` and the single symmetric `padding` value use numeric CSS pixels. Use `codeBlockProps` for header/toolbar controls. Theme values are registered names and `themes` is the `[dark, light]` pair. An old Monaco JSON theme is not accepted directly: first convert it to a Shiki `ThemeRegistration`, then call `registerCustomTheme(name, loader)` from `stream-diffs/pierre`; see the [coordinated 2.0 family migration guide](https://markstream.simonhe.me/guide/migration-2-0). When `stream-diffs` is not installed, the block renders as a plain `<pre>`.

### Editing handle

`CodeBlockNode` exposes the shared editing methods as instance exports. Type the `bind:this` value explicitly as `SvelteCodeBlockNodeExposed`; the generated component instance is not inferred across the package boundary.

```svelte
<script lang="ts">
  import type { SvelteCodeBlockNodeExposed } from 'markstream-svelte'
  import { CodeBlockNode } from 'markstream-svelte'

  let codeBlock: SvelteCodeBlockNodeExposed
</script>

<CodeBlockNode bind:this={codeBlock} {node} {codeBlockOptions} />

<button onclick={() => codeBlock.startEditing().then(() => codeBlock.stopEditing('complete'))}>Edit</button>
```

The handle exposes `getSurface()`, `isReadyToEdit()`, `isEditing()`, `startEditing(options?, editStateKey?)`, `stopEditing(reason?)`, `getEditor()`, `getEditingText()`, `getCode()`, `undo()`/`redo()`/`canUndo()`/`canRedo()`/`applyEdits()`, `focusEditor()`/`blurEditor()`, `revealLine(line, side?)`, `expandLine(target)`, `expandHunk(index, direction, override?)`, `setEditorActiveLine(line, options?)` and `getCodeScrollLeft()`/`setCodeScrollLeft(position)`. `startEditing` waits for the current editor creation and runtime setup, and rejects with shared lifecycle errors while streaming, before the surface exists, or when `stream-diffs` is unavailable. `getCode()` prefers the active draft or installed native contents and normalizes one trailing line ending. `codeBlockOptions.onEditComplete` defaults to accepting a completed edit; return `'reject'` to restore the external input.

Local playground demo: http://localhost:4176/codeblock-editing-demo (run `pnpm play:svelte`). It mounts a direct `CodeBlockNode`, exercises start/apply/undo/redo/complete/discard/reset, and shows the live surface status.

## Basic Usage

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  const content = `# Hello

Inline math: $E = mc^2$

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`
</script>

<MarkdownRender {content} />
```

## Workers

```svelte
<script lang="ts">
  import MarkdownRender, { setKaTeXWorker, setMermaidWorker } from 'markstream-svelte'
  import KatexWorker from 'markstream-svelte/workers/katexRenderer.worker?worker&inline'
  import MermaidWorker from 'markstream-svelte/workers/mermaidParser.worker?worker&inline'

  setKaTeXWorker(new KatexWorker())
  setMermaidWorker(new MermaidWorker())
</script>

<MarkdownRender content="Inline math: $x^2$" />
```

## Custom Components

Register Svelte 5 components with the scoped registry:

```svelte
<script lang="ts">
  import MarkdownRender, { setCustomComponents } from 'markstream-svelte'
  import ThinkingNode from './ThinkingNode.svelte'

  const customId = 'demo'
  setCustomComponents(customId, {
    thinking: ThinkingNode,
  })
</script>

<MarkdownRender
  content="<thinking>nested markdown</thinking>"
  {customId}
  customHtmlTags={['thinking']}
/>
```

```svelte
<!-- ThinkingNode.svelte -->
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'

  let {
    node,
    customId = undefined,
  }: {
    node: any
    customId?: string
  } = $props()
</script>

<section class="thinking-node">
  <MarkdownRender
    content={String(node?.content ?? '')}
    {customId}
    customHtmlTags={['thinking']}
  />
</section>
```

Run the local playground with:

```bash
pnpm play:svelte
```
