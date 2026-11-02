---
title: 高级解析与低层自定义
description: 深入了解 markstream-vue 的高级解析能力与低层自定义，涵盖 token 钩子、AST 变换、markdown-it 定制与解析器 API。
keywords:
  - 高级解析
  - 低层自定义
  - markdown-it 定制
  - AST 变换
---

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
- `postTransformNodes?: (nodes: ParsedNode[]) => ParsedNode[]` — 在内置节点归一化之后改造解析后的 AST

当改造需要作用在 `MarkdownRender` 的 `content` 路径内部时，使用 `postTransformNodes`。只有当你的应用已经在组件外部自行解析时，才使用 `nodes` 传入已有节点。

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
当你需要在正常 `content` 路径内进一步改造节点（例如剥掉包裹、合并分段、手动映射 attrs）时，再使用钩子：

```ts
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

function postTransformNodes(nodes: ParsedNode[]) {
  return nodes.map((node) => {
    if (node.type === 'thinking')
      return { ...node, data: { role: 'reasoning' } }
    return node
  })
}

const md = getMarkdown()
const nodes = parseMarkdownToStructure(markdown, md, { postTransformNodes })
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

Vue 3、Vue 2、React、Octane、Svelte、Solid 和 Angular 的流式追加淡入使用 700ms、`cubic-bezier(0.37, 0.55, 0.86, 0.88)`、透明度 0 → 1，参数参考 2026-11-02 本机 Codex 客户端。配合自适应出字：

```vue
<MarkdownRender
  :content="markdown"
  :final="isFinished"
  fade
  smooth-streaming="auto"
  :max-live-nodes="0"
/>
```

文本按词淡入：英文使用字母/数字词边界，非 ASCII 文本使用 `Intl.Segmenter`，空格和标点附在前一个词上。同一个词继续增长时保留动画身份；新词独立淡入，结束后按顺序回收为静态文本，不再受 4 批次上限影响。单次追加超过 64 个分词时，将同一时刻出现的前缀合并，仅保留末词独立，避免大包创建大量同龄动画节点。

出字节奏结合到达速率的平滑估计和积压追赶，默认最多每 50ms 提交一次。启用 fade 时，小包持续走出字队列，大包也不会直接跳过队列。Markdown 围栏、字素完整性仍由 markstream 控制；这并非 Codex 调度器的逐项复刻。`smoothStreamingOptions` 仍可调整速度范围和提交频率。

收到当前文本 block 的 `text_end`（或等价结束事件）时，将该 block 对应的 `MarkdownRender` 的 `final` 设为 `true`。文字淡入与入场过渡立即停止，结束后的补齐不再播放 fade。多个 block 各自维护 `final`，互不影响。库不监听服务端事件，也不会把 Markdown 语法闭合自动当成传输结束。

各框架的内置出字队列默认采用分帧收尾：不超过 1024 字符的小尾部直接提交；更大的积压按上一批的实际提交和布局耗时调整批量，通过 rAF 与后续任务交替推进。当前反馈目标为 12ms，每批通常为 256–1024 个字素，代码围栏开头保持原子性。淡入节点的回收也进入该队列；渲染完成态会等补齐及最终语义确认完成，不等同于刚收到传输结束信号。

已完成内容的首次挂载、历史恢复和非追加替换保持原有行为，避免 SSR 水合闪空。该预算作用于内置 `content` 出字队列；`smooth-streaming="false"` 和直接传入 `nodes` 不经过这条队列。`smoothStreamingOptions: { flushOnFinish: false }` 保留普通 pacing 收尾，但仍立即停止 fade。

12ms 是反馈目标，不是可抢占的硬上限。浏览器布局/GC、单个复杂 Markdown 单元或自定义解析回调仍可能超过预算。常规、最终形态可证明不变的段落/标题/列表/行内格式可直接复用解析结果；未闭合语法、HTML、数学和扩展等仍执行权威的 final 解析。外部 `useSmoothMarkdownStream` 的 `finish({ flush: true })` 仍是强制同步 flush，不自动获得 渲染器的帧预算；需要自行调度时可分次调用 `flush({ maxChars })`。

时长和曲线仍可用 `--stream-update-fade-duration` / `--stream-update-fade-ease` 覆盖。系统启用减少动态效果时，淡入立即完成；`smooth-streaming="false"` 可单独关闭出字调度。

这套分帧收尾用更多次提交换取较短的单次阻塞，积压很大时完整补齐会更慢；不保证总 CPU、更少重绘或零掉帧。所有框架共享调度策略，但性能数字必须按框架和实际内容分别测量。

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
