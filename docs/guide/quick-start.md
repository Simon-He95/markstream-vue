---
title: Vue Quick Start
description: Start rendering Markdown with markstream-vue in the smallest possible Vue example, including the explicit renderer CSS import and next steps.
keywords:
  - vue markdown quick start
  - markstream vue example
  - renderer css import
  - first vue render
---

# Vue Quick Start

Import the renderer CSS once from your app entry or CSS pipeline:

```ts
// main.ts
import 'markstream-vue/index.css'
```

Then render Markdown:

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

type MarkdownRenderProps = InstanceType<typeof MarkdownRender>['$props']

const md: MarkdownRenderProps['content'] = `# Hello World\n\nThis is **bold** and this is *italic*.`
const customId: MarkdownRenderProps['customId'] = 'quick-start'
const isDark: MarkdownRenderProps['isDark'] = false
</script>

<template>
  <MarkdownRender
    :content="md"
    :custom-id="customId"
    :is-dark="isDark"
  />
</template>
```

If you want prop-level hover, start with `MarkdownRenderProps['content']`, `MarkdownRenderProps['customId']`, `MarkdownRenderProps['isDark']`, or the matching template attributes above. Hovering the component name itself is usually less informative in Vue snippets.

Note: the packaged CSS is scoped under an internal `.markstream-vue` container to reduce global style conflicts. The root JavaScript entry does not inject this stylesheet, so keep the CSS import in your app shell. Use `@import 'markstream-vue/index.css' layer(components);` when your CSS pipeline needs precise layer ordering.

For dark theme variables, either add `.dark` on an ancestor or pass `:is-dark="true"` to scope dark mode to the renderer.

Optional: wrap with `<client-only>` for Nuxt/SSR.

See `/nuxt-ssr` for Nuxt-specific instructions.

Try this quickly in your app:

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

type MarkdownRenderProps = InstanceType<typeof MarkdownRender>['$props']

const md: MarkdownRenderProps['content'] = `# Hello world\n\nTry a simple Mermaid:\n\n\`\`\`mermaid\ngraph LR\nA-->B\n\`\`\`\n\nTry a simple D2:\n\n\`\`\`d2\ndirection: right\nClient -> API: request\nAPI -> DB: query\nDB -> API: rows\nAPI -> Client: response\n\`\`\`\n`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

Install `mermaid` or `@terrastruct/d2` to render those diagrams; without them the renderer falls back to showing source text.

For chat-style streaming, start with `mode="chat"` plus `content`; `max-live-nodes <= 0` in chat mode enables `smooth-streaming="auto"` and keeps fade off by default. If another layer already parses in a worker/store or you need AST control, pass `:nodes` + `:final` instead. See `/guide/usage`, `/guide/ai-chat-streaming`, and `/guide/performance`.
