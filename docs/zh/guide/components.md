# 组件与节点渲染器

本页说明各个渲染器之间的关系、所需的同伴依赖与 CSS，并列出常见的排障提示。编写或更新文档时，可以结合 [VitePress 文档指南](/zh/guide/vitepress-docs) 一起使用。

## 快速参考

| 组件 | 推荐场景 | 关键 props / 事件 | 额外 CSS / 同伴依赖 | 排障提示 |
| ---- | -------- | ---------------- | ------------------- | -------- |
| `MarkdownRender` | 渲染完整 AST（默认导出） | `content`、`custom-id`、`setCustomComponents`、生命周期钩子 | 在 reset 之后引入 `markstream-vue/index.css`（CSS 已被限定在内部 `.markstream-vue` 容器中），并放入受控 layer | 给 `MarkdownRender` 添加 `custom-id`，独立使用节点组件需包一层 `.markstream-vue`；配合 [CSS 排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here) |
| `CodeBlockNode` | 基于 Monaco 的交互式代码块、流式 diff | `node`、`monacoOptions`、`stream`、`loading`；插槽 `header-left` / `header-right` | 安装 `stream-monaco`（peer）并打包 Monaco workers | 空白编辑器 → 优先检查 worker 打包与 SSR |
| `MarkdownCodeBlockNode` | 轻量级高亮（Shiki） | `node`、`stream`、`loading`；插槽 `header-left` / `header-right` | 同伴依赖 `shiki` + `stream-markdown` | SSR/低体积场景优先使用 |
| `MermaidBlockNode` | 渐进式 Mermaid 图 | `node`、`theme`、`onRender` | `mermaid` ≥ 11 & `mermaid/dist/mermaid.css` | 详见 `/zh/guide/mermaid` |
| `MathBlockNode` / `MathInlineNode` | KaTeX 公式 | `node`、`displayMode`、`macros` | 安装 `katex` 并引入 `katex/dist/katex.min.css` | Nuxt SSR 中需 `<ClientOnly>` |
| `ImageNode` | 自定义图片预览 / 懒加载 | 触发 `click` / `load` / `error` 事件 | 无额外 CSS | 通过 `setCustomComponents` 包装，实现 lightbox |
| `LinkNode` | 下划线动画、颜色自定义 | `color`、`underlineHeight`、`showTooltip` | 无 | 浏览器默认 `a` 样式可通过 reset 解决 |
| `VmrContainerNode` | 带 JSON 属性的自定义 `:::` 容器 | `node`（`name`、`attrs`、`children`） | 极简基础 CSS；通过 `setCustomComponents` 覆盖 | 未知节点类型 → 检查 `FallbackComponent`；JSON 无效 → 检查 `data-attrs` 回退 |

## MarkdownRender

> 主入口：接受 Markdown 字符串或解析后的 AST，然后使用内置节点渲染器输出。

### 快速要点
- **适用**：Vite/Nuxt/VitePress 中渲染整篇 Markdown。
- **关键 props**：`content`、`custom-id`、`beforeRender`/`afterRender` 钩子、`setCustomComponents`。
- **CSS 顺序**：先引入 reset（`modern-css-reset`、`@unocss/reset`、`@tailwind base`），再在 `@layer components` 中导入 `markstream-vue/index.css`。

### CSS 作用域

`markstream-vue` 已把打包后的 CSS 限定在内部 `.markstream-vue` 容器中，用于降低全局样式冲突。

- 使用 `MarkdownRender` 时一般无需处理：它默认渲染在容器内部。
- 如果你独立使用节点组件（例如 `CodeBlockNode`、`MathBlockNode`），请外层包一层 `<div class="markstream-vue">...</div>`，这样库内样式与变量才会生效。

### 使用阶梯

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# 你好\n\n使用 custom-id 控制样式。'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="md" />
</template>
```

```ts
// 注册自定义节点
import { setCustomComponents } from 'markstream-vue'
import CustomImageNode from './CustomImageNode.vue'

setCustomComponents('docs', {
  image: CustomImageNode,
})
```

```css
/* styles/main.css */
@import 'modern-css-reset';
@tailwind base;

@layer components {
  @import 'markstream-vue/index.css';
}

[data-custom-id='docs'] .prose {
  max-width: 720px;
}
```

### 性能相关 props

- **批量渲染** —— `batchRendering`、`initialRenderBatchSize`、`renderBatchSize`、`renderBatchDelay`、`renderBatchBudgetMs` 控制每一帧有多少节点从占位骨架切换为真实组件。仅在关闭虚拟化（`:max-live-nodes="0"`）时会启用增量骨架模式；默认启用虚拟化时会直接渲染当前窗口的节点。
- **延迟可见节点** —— `deferNodesUntilVisible` 与 `viewportPriority` 默认开启，让 Mermaid、Monaco、KaTeX 等重型节点只有在接近视口时才加载。除非明确需要一次性渲染所有节点，否则不建议关闭。
- **虚拟化窗口** —— `maxLiveNodes` 限制 DOM 中最多保留多少个已渲染节点，`liveNodeBuffer` 控制超前/超后范围。合理设置可在保持可滚动回溯的同时，避免大文档拖慢页面。详见 [性能指南](/zh/guide/performance)。
- **代码块降级** —— 通过 `renderCodeBlocksAsPre` 与 `codeBlockStream` 可以改用 `<pre><code>` 简化渲染，或在高负载时临时关闭 Monaco 流式更新。

结合这些 props，再配合 `custom-id` 作用域样式与全局解析设置（`setDefaultMathOptions`、自定义 MarkdownIt 插件），即可针对不同项目调出最适合的性能与体验平衡。

### 常见问题
- **样式错乱**：先检查 [CSS 排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here)（reset、layer 顺序、同伴 CSS）。
- **工具类覆盖**：传入 `custom-id` 并使用 `[data-custom-id="docs"]` 限定样式。
- **SSR 报错**：对只在浏览器可用的同伴依赖（Mermaid、Monaco）使用 `<ClientOnly>` 或 `onMounted`。

## CodeBlockNode

> 支持 Monaco 渲染、流式 diff，以及头部插槽（`header-left`、`header-right`）的代码块组件。

### 快速要点
- **适用**：需要交互、滚动同步或流式输出的代码片段。
- **依赖**：`stream-monaco`（peer）。生产构建需配置 Monaco worker 打包（Vite 推荐 `vite-plugin-monaco-editor-esm`）。
- **CSS**：无需额外导入。

### 示例

```vue
<script setup lang="ts">
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'ts',
  code: 'const a = 1',
  raw: 'const a = 1',
}
</script>

<template>
  <div class="markstream-vue">
    <CodeBlockNode :node="node" :monaco-options="{ fontSize: 14 }" />
  </div>
</template>
```

```vue
<!-- 进阶：自定义头部控制 -->
<template>
  <CodeBlockNode
    custom-id="docs"
    :node="node"
    :show-copy-button="false"
  >
    <template #header-right>
      <span class="tag">
        Custom
      </span>
    </template>
  </CodeBlockNode>
</template>
```

### HTML/SVG 预览对话框
- 当 `node.language` 为 `html` 或 `svg`（且 `isShowPreview` 保持 `true`）时，工具栏会显示 Preview 按钮。不监听 `@preview-code` 的情况下，点击会调用内置的 iframe 弹窗（`HtmlPreviewFrame`），并在沙箱 `<iframe>` 中渲染你的代码。
- 监听 `@preview-code` 即可完全接管预览。事件会携带 `{ node, artifactType, artifactTitle, id }`，你可以用它来打开自研弹窗、把 HTML 注入到 playground，或记录埋点。一旦存在监听器，默认弹窗会被自动禁用。

```vue
<script setup lang="ts">
import { ref } from 'vue'

const preview = ref(null)

function handlePreview(artifact) {
  preview.value = artifact
}

function closePreview() {
  preview.value = null
}
</script>

<template>
  <CodeBlockNode
    :node="node"
    show-preview-button
    @preview-code="handlePreview"
  />

  <dialog v-if="preview" class="my-preview" open>
    <header>
      <strong>{{ preview.artifactTitle }}</strong>
      <button type="button" @click="closePreview">
        关闭
      </button>
    </header>
    <iframe
      v-if="preview.artifactType === 'text/html'"
      :srcdoc="preview.node.code"
      sandbox="allow-scripts allow-same-origin"
    />
    <div v-else v-html="preview.node.code" />
  </dialog>
</template>
```

> 小贴士：可以通过 `:show-preview-button="false"` 隐藏按钮，或者直接传入 `:is-show-preview="false"`，让所有 CodeBlock 都跳过预览逻辑。

### 常见问题
- **编辑器空白**：worker 未注册或 SSR 环境下提前执行。
- **Tailwind 覆盖字体/背景**：复查 reset/layer 顺序，并避免全局样式覆盖编辑器容器。
- **SSR**：Monaco 依赖浏览器 API，Nuxt 需 `<ClientOnly>`，Vite SSR 需 `onMounted` 才渲染节点。

## MarkdownCodeBlockNode

> 基于 Shiki 的轻量代码块，专为 SSR/静态站点或对包体积敏感的场景设计。

### 快速要点
- **依赖**：`shiki` + `stream-markdown`。
- **Props**：与 `CodeBlockNode` 类似（streaming + 头部控制）；内部会懒加载 `stream-markdown` 来做 Shiki 渲染。
- **适用场景**：VitePress、内容站点或无需 Monaco 的应用。

### 示例

```vue
<script setup lang="ts">
import { MarkdownCodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'vue',
  code: '<template><p>Hello</p></template>',
  raw: '<template><p>Hello</p></template>',
}
</script>

<template>
  <MarkdownCodeBlockNode :node="node" />
</template>
```

排障：
- 未安装 `shiki` 时会退回 `<pre><code>`，请确认依赖与 bundler 配置。
- 同样需要在 `@layer components` 中引入相关 CSS，避免被 Tailwind/Uno 覆盖。

## MermaidBlockNode

> 渐进式渲染 Mermaid 图，随着 `mermaid` 解析完成即时更新。

### 快速要点
- **依赖**：`mermaid` ≥ 11（推荐 ESM 构建）。
- **CSS**：`import 'mermaid/dist/mermaid.css'`。
- **Props**：`node`、`theme`、`isStrict`、`mermaidOptions`、`onRender`、`custom-id`。

### 示例

```ts
import 'mermaid/dist/mermaid.css'
```

```vue
<MermaidBlockNode
  custom-id="docs"
  :node="node"
  :is-strict="true"
  theme="forest"
  @render="handleMermaidRender"
/>
```

排障：
- 若出现空白，请查看控制台日志（多数为 CSS 漏引或语法不兼容）。
- 渲染不可信来源（用户/LLM 等）的 Mermaid 时，建议开启 `isStrict`，组件会对 SVG 进行清理并禁用 HTML labels，避免 `javascript:` 链接或内联事件混入渲染结果。
- SSR/Nuxt 环境需要 `onMounted` 或 `<ClientOnly>` 避免在服务端执行 mermaid。

## MathBlockNode / MathInlineNode

> 使用 KaTeX 渲染块级与行内公式。

### 快速要点
- **依赖**：`katex`
- **CSS**：`import 'katex/dist/katex.min.css'`
- **Props**：`displayMode`、`macros`、`throwOnError`

### 示例

```ts
import 'katex/dist/katex.min.css'
```

```vue
<MathBlockNode :node="node" :display-mode="true" :macros="{ '\\RR': '\\mathbb{R}' }" />

<MathInlineNode :node="inlineNode" />
```

排障：
- 缺少 CSS 会导致公式不可见。
- Nuxt SSR 需要 `<ClientOnly>` 或 `client:only`，以防 KaTeX 访问 DOM。
- 如需自定义样式，请配合 `[data-custom-id]` 定位，勿直接修改 KaTeX 全局样式。

## ImageNode — 自定义预览

`ImageNode` 会触发 `click`、`load`、`error`，常见做法是用自定义组件拦截 `click` 并打开 lightbox。

```vue
<template>
  <ImageNode :node="node" @click="open(node.props.src)" />
</template>
```

```ts
import { setCustomComponents } from 'markstream-vue'
import ImagePreview from './ImagePreview.vue'

setCustomComponents('docs', { image: ImagePreview })
```

样式提示：
- 浏览器默认 `img` 边框、间距不同，记得引入 reset。
- Tailwind/UnoCSS 的 `img` 工具类可能覆盖宽高，使用 `[data-custom-id]` 限定范围。

## LinkNode — 下划线与提示

`LinkNode` 暴露 `color`、`underlineHeight`、`underlineBottom`、`animationDuration`、`showTooltip` 等 props，便于无需 CSS 覆盖即可调整动画。

```vue
<LinkNode
  :node="node"
  color="#e11d48"
  :underline-height="3"
  underline-bottom="-4px"
  :animation-duration="1.2"
  :show-tooltip="false"
/>
```

提示：
- 下划线颜色跟随 `currentColor`，如需独立颜色请添加局部 CSS。
- `showTooltip=false` 时会退回浏览器原生 `title`。
- 如果 anchor 样式被浏览器默认值影响，请结合 reset/`@layer` 方案。

## HtmlInlineNode — 流式内联 HTML

`HtmlInlineNode` 用于渲染解析器产出的 `html_inline` 节点（如 `<span>...</span>` 这类内联 HTML）。

流式行为：
- 当节点处于**真实中间态**（`loading===true` 且 `autoClosed!==true`）时，为避免不完整标签闪烁，组件会直接显示原始文本。
- 当节点处于**自动补闭合中间态**（`autoClosed===true`）时，解析器已为稳定渲染自动补上 `</tag>`，组件会按 HTML 渲染（`innerHTML`），但仍保留 `loading=true` 供业务判断"还没真正闭合"。
- 当真实闭合标签到达后，解析器会清除 `loading/autoClosed`，节点表现为普通内联 HTML。

## VmrContainerNode — 自定义 ::: 容器

`VmrContainerNode` 渲染自定义 `:::` 容器，支持嵌套的 markdown 内容。

### 快速参考
- **适用场景**：自定义容器块，如 `::: viewcode:topo-test-001 {"devId":"..."}`。
- **渲染方式**：递归渲染子节点（段落、列表、代码块等）。
- **CSS**：极简基础样式；通过 `setCustomComponents` 覆盖。

### 支持的子节点

组件支持以下块级节点：
- **内联节点**（段落内）：text、strong、emphasis、link、image、inline_code 等
- **块级节点**：paragraph、heading、list、blockquote、code_block、fence、math_block、table

未知节点类型会回退到 `FallbackComponent`，显示节点类型和原始内容用于调试。

### 语法

```markdown
::: container-name {"key":"value"}
内容...
:::
```

解析器会提取：
- `name` — 容器名称（例如 `viewcode:topo-test-001`）
- `attrs` — JSON 属性，解析为 data 属性
- `children` — 子节点（解析后的 markdown 内容）
- `raw` — 原始 markdown 源文本

### 节点类型定义

```typescript
interface VmrContainerNode {
  type: 'vmr_container'
  name: string // 来自 ::: name 的容器名称
  attrs?: Record<string, string> // 解析后的 JSON 属性
  children: ParsedNode[] // 子节点
  raw: string // 原始 markdown 源文本
}
```

### 默认渲染

默认组件会递归渲染所有子节点：

```vue
<!-- 默认 VmrContainerNode 输出 -->
<div class="vmr-container vmr-container-container-name" data-key="value">
  <!-- 子节点在这里渲染（段落、列表、代码块等） -->
</div>
```

### 容器内内容示例

```markdown
::: info
这是一个**粗体**段落，带有[链接](https://example.com)。

## 容器内的标题

- 列表项 1
- 列表项 2

```js
console.log('代码块也可以工作')
```
:::
```

### 自定义覆盖

使用 `setCustomComponents` 注册自定义组件：

```vue
<script setup lang="ts">
import { setCustomComponents } from 'markstream-vue'
import MyViewCode from './MyViewCode.vue'

setCustomComponents('docs', {
  vmr_container: MyViewCode,
})
</script>

<template>
  <MarkdownRender custom-id="docs" :content="markdown" />
</template>
```

### 示例：ViewCode 组件

以下是一个完整的示例，用于渲染自定义的 `viewcode:*` 容器：

```vue
<!-- components/ViewCodeContainer.vue -->
<script setup lang="ts">
import NodeRenderer from 'markstream-vue'
import { computed } from 'vue'

interface Props {
  node: {
    type: 'vmr_container'
    name: string
    attrs?: Record<string, string>
    children: any[]
    raw: string
  }
  indexKey?: number | string
  customId?: string
}

const props = defineProps<Props>()

// 从 attrs 提取 devId
const devId = computed(() => props.node.attrs?.devId || '')

// 检查是否为 viewcode 容器
const isViewCode = computed(() => props.node.name.startsWith('viewcode:'))
</script>

<template>
  <!-- viewcode 容器的自定义渲染 -->
  <div v-if="isViewCode" class="viewcode-wrapper">
    <div class="viewcode-header">
      <span class="viewcode-title">{{ node.name }}</span>
      <span class="viewcode-dev-id">{{ devId }}</span>
    </div>
    <div class="viewcode-content">
      <NodeRenderer
        :nodes="node.children"
        :custom-id="customId"
        :index-key="`${indexKey}-viewcode`"
      />
    </div>
  </div>

  <!-- 其他容器的回退渲染 -->
  <div v-else class="vmr-container" :class="`vmr-container-${node.name}`">
    <NodeRenderer
      :nodes="node.children"
      :custom-id="customId"
      :index-key="`${indexKey}-fallback`"
    />
  </div>
</template>

<style scoped>
.viewcode-wrapper {
  border: 1px solid #eaecef;
  border-radius: 8px;
  overflow: hidden;
  margin: 1rem 0;
}

.viewcode-header {
  background: #f8f8f8;
  padding: 0.5rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eaecef;
}

.viewcode-title {
  font-weight: 600;
  color: #333;
}

.viewcode-dev-id {
  font-family: monospace;
  font-size: 0.875rem;
  color: #666;
}

.viewcode-content {
  padding: 1rem;
}
</style>
```

### 示例：按名称条件渲染

也可以根据容器名称渲染不同的组件：

```vue
<script setup lang="ts">
import { setCustomComponents } from 'markstream-vue'
import AlertContainer from './AlertContainer.vue'
import ChartContainer from './ChartContainer.vue'
import GenericContainer from './GenericContainer.vue'

// 容器名称到组件的映射
const containerMap = {
  chart: ChartContainer,
  alert: AlertContainer,
}

setCustomComponents('docs', {
  vmr_container: (node) => {
    // 根据容器名称选择组件
    const Component = containerMap[node.name as keyof typeof containerMap]
      || GenericContainer

    return h(Component, { node })
  },
})
</script>
```

### 排障
- **看到原始文本**：说明你使用的是默认渲染器。请通过 `setCustomComponents` 注册自定义组件。
- **Attrs 为 undefined**：请确保 JSON 语法正确。无效的 JSON 会回退到 `data-attrs` 并存储原始字符串。
- **组件未收到 props**：请确保你的组件正确接受 `node` prop 且类型匹配。

## 工具函数

- `getMarkdown()` — 返回预设好的 `markdown-it-ts` 实例。
- `parseMarkdownToStructure()` — 将 Markdown 字符串解析成 AST，可直接传给 `MarkdownRender`。
- `setCustomComponents(id?, mapping)` — 为指定 `custom-id` 替换任何节点渲染器。

若新增组件或修改行为，请同步更新本页与 [VitePress 文档指南](/zh/guide/vitepress-docs)，确保贡献者能够沿用相同结构。
