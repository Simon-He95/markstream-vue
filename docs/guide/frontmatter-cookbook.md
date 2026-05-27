---
description: Extract YAML front matter before rendering, or turn it into a trusted custom tag when metadata should render in the Markdown flow.
---

# YAML front matter cookbook

YAML front matter is page-level metadata, not standard Markdown body content. markstream-vue does not parse it as YAML or render it as a built-in table/properties block by default.

Different apps usually want different behavior:

- strip it before rendering the Markdown body
- use it for page metadata such as title, description, SEO, or routing
- display it with a project-specific properties UI

The recommended path is to extract front matter before passing content to `MarkdownRender`. If the metadata really needs to participate in the Markdown rendering flow, convert it into a trusted custom tag first.

## 1. Extract before rendering

Use a small boundary helper to split the metadata from the Markdown body:

```ts
// frontmatter.ts
export function splitFrontmatter(input: string) {
  const match = input.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)

  if (!match) {
    return {
      raw: '',
      body: input,
    }
  }

  return {
    raw: match[1].trim(),
    body: input.slice(match[0].length),
  }
}
```

Then render the metadata with your page shell and pass only the Markdown body to `MarkdownRender`. This example uses the `yaml` package, but the parser choice belongs to your app.

```vue
<!-- ArticleMarkdown.vue -->
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { computed } from 'vue'
import { parse } from 'yaml'
import { splitFrontmatter } from './frontmatter'

const props = defineProps<{
  content: string
}>()

const frontmatter = computed(() => {
  const { raw, body } = splitFrontmatter(props.content)
  const data = raw ? parse(raw) ?? {} : {}

  return {
    body,
    entries: Object.entries(data),
  }
})

function formatValue(value: unknown) {
  if (Array.isArray(value))
    return value.join(', ')

  if (value && typeof value === 'object')
    return JSON.stringify(value)

  return String(value ?? '')
}
</script>

<template>
  <section v-if="frontmatter.entries.length" class="frontmatter-panel">
    <dl>
      <template
        v-for="[key, value] in frontmatter.entries"
        :key="key"
      >
        <dt>{{ key }}</dt>
        <dd>{{ formatValue(value) }}</dd>
      </template>
    </dl>
  </section>

  <MarkdownRender :content="frontmatter.body" />
</template>
```

This keeps front matter outside the Markdown body, which is usually the cleanest model for docs pages, blogs, and knowledge bases.

## 2. Convert it to a trusted custom tag

`setCustomComponents` and `VueRendererMarkdown.components` only map nodes or custom tags that the parser has already produced. Raw front matter such as `--- ... ---` is not a custom node, so it must be extracted, stripped, or converted before rendering.

When you want front matter to render as part of the Markdown flow, convert it into a trusted tag:

```ts
// frontmatter.ts
export function splitFrontmatter(input: string) {
  const match = input.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)

  if (!match) {
    return {
      raw: '',
      body: input,
    }
  }

  return {
    raw: match[1].trim(),
    body: input.slice(match[0].length),
  }
}

export function injectFrontmatterTag(input: string) {
  const { raw, body } = splitFrontmatter(input)

  if (!raw)
    return body

  return `<front-matter raw="${encodeURIComponent(raw)}"></front-matter>\n\n${body}`
}
```

Prefer app-scoped component registration when you control the Vue app setup:

```ts
// main.ts
import MarkdownRender, { VueRendererMarkdown } from 'markstream-vue'
import { createApp } from 'vue'
import App from './App.vue'
import FrontMatterNode from './FrontMatterNode.vue'

createApp(App)
  .use(VueRendererMarkdown, {
    components: {
      'front-matter': FrontMatterNode,
    },
  })
  .component('MarkdownRender', MarkdownRender)
  .mount('#app')
```

Render the transformed content with `front-matter` listed as a trusted custom HTML-like tag:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { computed } from 'vue'
import { injectFrontmatterTag } from './frontmatter'

const props = defineProps<{
  content: string
}>()

const renderContent = computed(() => injectFrontmatterTag(props.content))
</script>

<template>
  <MarkdownRender
    :custom-html-tags="['front-matter']"
    :content="renderContent"
  />
</template>
```

For older integrations or one-off client pages, the scoped global API still works:

```vue
<script setup lang="ts">
import MarkdownRender, { removeCustomComponents, setCustomComponents } from 'markstream-vue'
import { computed, onBeforeUnmount } from 'vue'
import { injectFrontmatterTag } from './frontmatter'
import FrontMatterNode from './FrontMatterNode.vue'

const props = defineProps<{
  content: string
}>()

setCustomComponents('docs-frontmatter', {
  'front-matter': FrontMatterNode,
})

onBeforeUnmount(() => {
  removeCustomComponents('docs-frontmatter')
})

const renderContent = computed(() => injectFrontmatterTag(props.content))
</script>

<template>
  <MarkdownRender
    custom-id="docs-frontmatter"
    :custom-html-tags="['front-matter']"
    :content="renderContent"
  />
</template>
```

The custom component receives the same custom node shape as other trusted tags, including `type`, `content`, `attrs`, `loading`, and `autoClosed` when available:

```vue
<!-- FrontMatterNode.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { parse } from 'yaml'

const props = defineProps<{
  node: {
    attrs?: Record<string, string>
  }
}>()

const entries = computed(() => {
  const raw = decodeURIComponent(String(props.node.attrs?.raw ?? ''))
  if (!raw)
    return []

  const data = parse(raw) ?? {}
  return Object.entries(data)
})

function formatValue(value: unknown) {
  if (Array.isArray(value))
    return value.join(', ')

  if (value && typeof value === 'object')
    return JSON.stringify(value)

  return String(value ?? '')
}
</script>

<template>
  <section class="frontmatter-panel">
    <dl>
      <template
        v-for="[key, value] in entries"
        :key="key"
      >
        <dt>{{ key }}</dt>
        <dd>{{ formatValue(value) }}</dd>
      </template>
    </dl>
  </section>
</template>
```

Only transform sources you trust into custom tags. If the Markdown comes from users or external systems, validate and sanitize at your application boundary before rendering.
