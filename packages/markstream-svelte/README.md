# markstream-svelte

Svelte 5 streaming Markdown renderer for AI chat, LLM token streams, SSE/WebSocket output, incomplete Markdown states, long documents, custom components, Mermaid, KaTeX, Monaco, D2, and Infographic.

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
  import { CodeBlockNode } from 'markstream-svelte'

  const node = {
    type: 'code_block',
    language: 'ts',
    code: 'const answer = 42',
    raw: 'const answer = 42',
  }
</script>

<CodeBlockNode {node} isDark showLineNumbers showHeader />
```

Component-level options: `isDark`, `showLineNumbers` (default `true`), `showHeader`. When `stream-diffs` is not installed, the block renders as a plain `<pre>`.

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
