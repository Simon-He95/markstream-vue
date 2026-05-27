# markstream-svelte

Svelte 5-only renderer aligned with `markstream-vue`, `markstream-vue2`, and `markstream-react`. Svelte 4 is not supported.

## Install

```bash
pnpm add markstream-svelte svelte@^5
```

Optional heavy renderers stay as peer dependencies, matching the Vue and React packages:

```bash
pnpm add katex mermaid stream-monaco @terrastruct/d2 @antv/infographic
```

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
