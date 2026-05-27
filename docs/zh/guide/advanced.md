# 高级解析与低层自定义

这页面向更底层的解析定制：token 变换、AST 后处理，以及自定义节点管线。

如果你只是要完成这些常见任务，建议先去更直接的页面：

- 替换 `image`、`code_block`、`mermaid` 这类内置渲染器： [覆盖内置组件](/zh/guide/component-overrides)
- 支持 `thinking` 这类可信标签： [自定义标签与高级组件](/zh/guide/custom-components)
- 只想调现有行为，不想改解析器： [Props 与选项](/zh/guide/props)

## parseOptions
`parseOptions` 可传递给 `MarkdownRender` 或直接用于 `parseMarkdownToStructure`。

- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — 在 `markdown-it` 解析后立即变换 tokens
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — 进一步变换 tokens

如需改造 AST，可在 `parseMarkdownToStructure` 返回后自行处理 `ParsedNode[]`，再通过 `MarkdownRender` 的 `nodes` 传入。

### 示例：自定义 HTML‑like 标签（推荐）
对于 `<thinking>...</thinking>` 这类简单自定义标签，现在不再需要先正则换行或重写 token。只要把标签加入白名单并注册组件即可：

```ts
import { setCustomComponents } from 'markstream-vue'
import ThinkingNode from './ThinkingNode.vue'

setCustomComponents('docs', { thinking: ThinkingNode })
```

```vue
<MarkdownRender
  custom-id="docs"
  :custom-html-tags="['thinking']"
  :content="markdown"
/>
```

当 `custom-html-tags` 包含某个标签名时，解析器会：
- 在流式场景下吞并未闭合中间态，直到 `<tag ...>` 完整出现；
- 输出 `CustomComponentNode`（`type: 'thinking'`，即标签名本身，不含尖括号），并带上 `content`、可选 `attrs` 与 `loading/autoClosed` 标记。

## 自定义组件解析示例

上面的内置白名单 + 自定义节点管线已覆盖大多数“组件式”标签（内联或块级）。
当你需要进一步改造节点（例如剥掉包裹、合并分段、手动映射 attrs）时，再使用钩子：

```ts
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

function preTransformTokens(tokens: MarkdownToken[]) {
  return tokens.map((t) => {
    if (t.type === 'html_block' && t.tag === 'thinking')
      return { ...t, content: String(t.content ?? '').replace(/<\/?thinking[^>]*>/g, '').trim() }
    return t
  })
}

const md = getMarkdown()
const nodes = parseMarkdownToStructure(markdown, md, { preTransformTokens })
```

其他可选方案（按复杂度递增）：
- 后端将 `thinking` 拆成单独字段/类型：前端用两次 `MarkdownRender`，一个渲染 `thinking`，另一个渲染剩余正文，互不干扰。
- 在进入解析前用正则占位：先 `replace` 掉 `<thinking>...</thinking>` 保存到数组；正文用 `MarkdownRender`；最后把占位符替换回自定义组件渲染结果。`thinking` 常在开头时可以直接截取头部做单独渲染。

## setCustomComponents(id, mapping)
- 使用 `setCustomComponents('docs', { thinking: ThinkingComponent })` 作用于带 `custom-id="docs"` 的 `MarkdownRender` 实例。
- 调用 `removeCustomComponents` 清理映射，避免单页应用内存泄漏。

## 作用域示例
```vue
<MarkdownRender content="..." custom-id="docs" />
// 在 setup 中
setCustomComponents('docs', { thinking: ThinkingNode })
```

高级钩子是为 Markdown 添加领域语法的强大方式，无需更改核心解析器。

### Typewriter 与 fade 属性

`MarkdownRender` 支持 `typewriter` 布尔属性，用于流式内容增长时显示闪烁打字光标。它默认是 `false`，需要光标时再显式开启。同时支持独立的 `fade` 布尔属性，用于控制非 `code_block` 节点进入淡入和流式追加文本淡入。这样可以保留光标，同时在 SSR、打印或导出场景里关闭动画。

示例：

```vue
<MarkdownRender :content="markdown" :typewriter="true" :fade="false" />
```

CSS 变量：`--typewriter-cursor-color` 用于打字光标颜色；`--fade-duration` 和 `--fade-ease` 用于首屏 enter 过渡；`--stream-update-fade-duration` 和 `--stream-update-fade-ease` 用于流式追加文本时那段短 fade。若不单独覆盖，流式追加的 fade 会默认沿用 `fade` 的时长和缓动。

## 国际化（i18n）

默认 `getMarkdown` 使用英文 UI 文案（如代码块复制按钮）。你可以通过 `i18n` 选项自定义这些文本：

**翻译映射用法：**

```ts
import { getMarkdown } from 'markstream-vue'

const md = getMarkdown('editor-1', {
  i18n: {
    'common.copy': '复制',
  }
})
```

**翻译函数用法：**

```ts
import { getMarkdown } from 'markstream-vue'
import { useI18n } from 'vue-i18n' // 或其他 i18n 库

const { t } = useI18n()

const md = getMarkdown('editor-1', {
  i18n: (key: string) => t(key)
})
```

**全局覆盖默认文案：**

如果你只是想修改一些默认 UI 文案（例如 "Copy" → "复制"），而不需要完整的 i18n 功能，可以使用 `setDefaultI18nMap` 来替换默认的翻译映射：

```ts
import { setDefaultI18nMap } from 'markstream-vue'

setDefaultI18nMap({
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.decrease': '减少',
  'common.reset': '重置',
  'common.increase': '增加',
  'common.expand': '展开',
  'common.collapse': '收起',
  'common.preview': '预览',
  'common.source': '源码',
  'common.export': '导出',
  'common.open': '打开',
  'common.zoomIn': '放大',
  'common.zoomOut': '缩小',
  'common.resetZoom': '重置缩放',
  'image.loadError': '图片加载失败',
  'image.loading': '图片加载中...',
})
```

这个功能适合以下场景：
- 不需要语言切换，只是觉得默认文案不合适
- 希望默认使用中文（或其他语言）UI
- 没有使用 `vue-i18n`，但仍想自定义 UI 文案

**默认翻译键：**

- `common.copy`：代码块复制按钮文本
- `common.copied`：复制成功后的提示文本
- `image.loadError`：图片加载失败的提示
- `image.loading`：图片加载中的提示

该设计保证 markdown 工具函数纯净，无全局副作用，可与任意 i18n 方案集成或直接传入静态翻译。
