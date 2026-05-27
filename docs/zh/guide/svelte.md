# Svelte

`markstream-svelte` 提供 Svelte 5-only 渲染器，组件名、worker helpers 和 playground fixtures 与 Vue / React / Angular 包保持一致。不支持 Svelte 4。

使用 Svelte 5 安装：

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let { content = '# markstream-svelte' }: { content?: string } = $props()
</script>

<MarkdownRender
  {content}
  codeBlockDarkTheme="vitesse-dark"
  codeBlockLightTheme="vitesse-light"
/>
```

默认导出和命名导出 `MarkdownRender` / `NodeRenderer` 指向同一个 Svelte 组件。

KaTeX 和 Mermaid worker 入口与其它框架一致：

```svelte
<script lang="ts">
  import { setKaTeXWorker, setMermaidWorker } from 'markstream-svelte'
  import KatexWorker from 'markstream-svelte/workers/katexRenderer.worker?worker&inline'
  import MermaidWorker from 'markstream-svelte/workers/mermaidParser.worker?worker&inline'

  setKaTeXWorker(new KatexWorker())
  setMermaidWorker(new MermaidWorker())
</script>
```

自定义 HTML 标签使用同一套带作用域的组件注册：

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
  content="<thinking>nested **markdown**</thinking>"
  {customId}
  customHtmlTags={['thinking']}
/>
```

示例 `ThinkingNode.svelte`：

```svelte
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

本地 playground：

```bash
pnpm play:svelte
```
