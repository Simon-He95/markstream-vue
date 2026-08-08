---
description: 用带作用域的方式覆盖 markstream-vue 的 image、code_block、mermaid、link 等内置组件，避免污染全局渲染。
---

# 覆盖内置组件

大多数高级定制，其实都应该先从 `setCustomComponents` 开始，而不是一上来就改解析器。

这页适合解决这些问题：

- 想替换 `image`、`code_block`、`mermaid`、`link` 等内置渲染器
- 想把覆盖范围限制在某一个业务区域
- 想弄清楚“我该用哪个 override key”

如果你想支持 `thinking` 这类可信自定义标签，请看 [自定义标签与高级组件](/zh/guide/custom-components)。如果你只是想调工具栏、性能或主题，优先看 [Props 与选项](/zh/guide/props)。

## 1. 默认用带作用域的覆盖

在渲染器上加 `custom-id`，再用相同的 id 注册覆盖：

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const DocImage: Component

setCustomComponents('docs', {
  image: DocImage,
})
```

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const markdown = '![demo](https://example.com/demo.png)'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="markdown" />
</template>
```

这样做的好处：

- 不会让一个页面的覆盖误伤另一个页面
- 更容易测试和回收
- 更符合渲染器内部对 scoped / global mapping 的合并方式

单参数形式 `setCustomComponents({ ... })` 仍然可用，但更适合视作兼容性的全局覆盖写法。

## 2. 最常用的 override key

| Key | 替换的节点 | 说明 |
|-----|-----------|------|
| `image` | `ImageNode` | 最适合拿来做 lightbox、caption、懒加载封装 |
| `link` | `LinkNode` | 适合埋点、路由跳转、自定义 tooltip |
| `code_block` | 普通 fenced code block | 作为通用兜底使用，优先级在精确语言 key 和内置 `mermaid` / `d2` / `infographic` 路由之后 |
| `mermaid` | Mermaid fenced block | 只改 Mermaid 时优先用它，而不是改全部代码块 |
| `d2` | D2 / `d2lang` fenced block | 与 Mermaid 同理 |
| `infographic` | Infographic fenced block | 只影响 infographic 渲染 |
| `inline_code` | 行内代码 | 适合做文档排版或特殊 inline 行为 |
| `heading`、`paragraph`、`list_item`、`blockquote` | 容器节点 | 能力很强，但你需要自己处理 children |

完整节点列表可以看 [组件 API](/zh/guide/components) 和导出的 `CustomComponents` 类型。

## 3. 先从叶子节点开始

叶子节点最容易上手，因为不需要你额外把子节点再渲染一遍。

### 示例：替换 `image`

```vue twoslash
<script setup lang="ts">
import type { ImageNodeProps } from 'markstream-vue'

const props = defineProps<ImageNodeProps>()
</script>

<template>
  <figure class="docs-image">
    <img :src="props.node.src" :alt="props.node.alt" loading="lazy">
    <figcaption v-if="props.node.title || props.node.alt">
      {{ props.node.title || props.node.alt }}
    </figcaption>
  </figure>
</template>
```

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const DocImage: Component

setCustomComponents('docs', {
  image: DocImage,
})
```

### 示例：覆盖普通代码块

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomCodeBlockNode: Component

setCustomComponents('docs', {
  code_block: CustomCodeBlockNode,
})
```

这只会影响普通代码块。Mermaid、D2 和 infographic 仍然会走各自的专用渲染器；如果你要覆盖它们，请分别使用 `mermaid`、`d2`、`infographic`。

### 示例：只接管一种 fenced language

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const EChartsBlockNode: Component

setCustomComponents('docs', {
  echarts: EChartsBlockNode,
})
```

这只会命中 language 为 `echarts` 的 fence。代码块的路由优先级是：

- 精确语言 key，比如 `echarts`
- 内置专用路由，比如 `mermaid`、`d2`、`infographic`
- 通用 `code_block`

### 示例：只覆盖 Mermaid

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomMermaidBlock: Component

setCustomComponents('docs', {
  mermaid: CustomMermaidBlock,
})
```

当你只想改导出按钮、工具栏、品牌外壳，而不想影响所有代码块时，这就是最稳妥的方式。

## 4. 自定义渲染器会收到什么 props

每个自定义渲染器都会拿到这些基础 props：

- `node`
- `loading`
- `indexKey`
- `customId`
- `isDark`

另外，渲染器还会按节点类型继续透传一些能力相关 props：

- 普通代码块会拿到 `stream`、`theme`、`darkTheme`、`lightTheme`、`themes`、`minWidth`、`maxWidth`，以及你传给 `codeBlockProps` 的内容（新的推荐字段是 `theme`；`darkTheme` / `lightTheme` 继续保留作兼容）
- Mermaid、D2、Infographic 会分别拿到对应的 `mermaidProps`、`d2Props`、`infographicProps`
- link 和 list 会继承 tooltip / typewriter 相关的上层配置

如果你想保留类型提示，优先使用 `markstream-vue` 导出的 props 类型。

## 5. 覆盖容器节点要更谨慎

`heading`、`paragraph`、`list_item`、`blockquote` 这类节点当然可以覆盖，但它们带有 children，你的组件需要自己决定如何继续渲染这些子节点。

实用建议：

- 除非你确实需要容器级控制，否则优先从 `image`、`link`、`code_block`、`mermaid`、`inline_code` 这类节点开始
- 如果必须覆盖容器节点，先看仓库里的内置实现 `src/components/*`，对照着补上 children 的渲染逻辑
- 始终用 `custom-id` 做作用域隔离，这样调试成本最低

## 6. 动态页面记得清理

如果某个 override 只在临时页面里使用，离开页面后可以主动移除：

```ts twoslash
import { removeCustomComponents } from 'markstream-vue'

removeCustomComponents('docs')
```

这在 SPA、Storybook、playground 和测试场景里尤其有帮助。
