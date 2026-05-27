---
description: 在渲染前提取 YAML front matter，或先转换成可信自定义标签再进入 Markdown 渲染流程。
---

# YAML front matter Cookbook

YAML front matter 是页面级 metadata，不是标准 Markdown body 内容。markstream-vue 不会默认解析 YAML，也不会内置渲染成 table 或 properties block。

不同应用通常需要不同处理方式：

- 渲染 Markdown body 前直接移除
- 用作 title、description、SEO、路由等页面 metadata
- 用项目自己的 properties UI 展示

最推荐的方式是在传给 `MarkdownRender` 前提取 front matter。只有当 metadata 确实需要参与 Markdown 渲染流程时，才先转换成可信自定义标签。

## 1. 渲染前提取

先用一个边界 helper 把 metadata 和 Markdown body 分开：

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

然后在页面壳里展示 metadata，只把 Markdown body 传给 `MarkdownRender`。下面示例使用 `yaml` 包，具体 YAML parser 由你的应用决定。

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

这种模型把 front matter 留在 Markdown body 之外，通常最适合文档站、博客和知识库。

## 2. 转成可信自定义标签

`setCustomComponents` 和 `VueRendererMarkdown.components` 只能映射解析器已经产出的节点或自定义标签。原始的 `--- ... ---` front matter 本身不是自定义节点，所以必须先提取、移除，或转换后再渲染。

如果你希望 front matter 作为 Markdown 流程的一部分渲染，可以先转换成可信标签：

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

如果你能控制 Vue app 初始化，优先使用 app 级隔离的组件注册：

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

渲染转换后的内容时，把 `front-matter` 放进可信自定义 HTML-like 标签列表：

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

旧接入方式或一次性的客户端页面也可以继续使用 scoped global API：

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

自定义组件会拿到和其他可信标签一致的自定义节点字段，包括可用时的 `type`、`content`、`attrs`、`loading`、`autoClosed`：

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

只把可信来源转换成自定义标签。如果 Markdown 来自用户或外部系统，需要先在应用边界完成校验与清理，再交给渲染器。
