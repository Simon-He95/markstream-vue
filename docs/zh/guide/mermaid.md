# Mermaid 快速上手

`markstream-vue` 支持渐进式 Mermaid 渲染：一旦语法合法就立即生成图表，后续 token 会继续完善图。以下内容介绍安装、流式示例以及常见排障。

## 1. 安装与样式导入

```bash
pnpm add mermaid
```

Mermaid 不需要额外的 CSS 文件。使用 Tailwind/UnoCSS 时，请在 reset 之后使用 `@import '...' layer(components)` 导入库的 CSS，避免 utilities 覆盖：

```css
@import 'modern-css-reset';

@import 'markstream-vue/index.css' layer(components);
```

## 2. 流式示例

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const steps = [
  '```mermaid\n',
  'graph TD\n',
  'A[Start]-->B{Is valid?}\n',
  'B -- Yes --> C[Render]\n',
  'B -- No  --> D[Wait]\n',
  '```\n',
]

let i = 0
const id = setInterval(() => {
  content.value += steps[i] || ''
  i++
  if (i >= steps.length)
    clearInterval(id)
}, 120)
</script>

<template>
  <MarkdownRender :content="content" />
  <!-- Diagram 将在内容流入时逐步出现 -->
</template>
```

快速测试 — 将以下 Markdown 粘贴到任意组件中：

```md
\`\`\`mermaid
graph LR
A[Start]-->B
B-->C[End]
\`\`\`
```

![Mermaid demo](/screenshots/mermaid-demo.svg)

## 3. 进阶组件：`MermaidBlockNode`

若需要头部控制、导出按钮、伪全屏等能力，请参考 [`MermaidBlockNode`](/zh/guide/mermaid-block-node) 或通过 [setCustomComponents 进行覆盖](/zh/guide/mermaid-block-node-override)。仓库内的 playground 提供 `/mermaid-export-demo` 路由可直接试用。
Mermaid 严格模式与 SVG 清理默认开启。只有可信图表确实需要 Mermaid loose 解析/渲染配置时，才设置 `:is-strict="false"`。Markstream 在挂载前仍会清理 Mermaid SVG 输出。

## 4. strict 默认开启后，哪些图可能会变

把 Mermaid 从 loose 切到 strict 后，依赖 Mermaid HTML labels 或更宽松 Mermaid 解析/渲染的可信图表，渲染结果可能会和以前不同。

常见表现：

1. 依赖 `<br>`、`<span>` 或更复杂 HTML 片段的 label，显示不再和以前一致。
2. 依赖宽松 HTML 处理的链接或交互，在最终 SVG 里被去掉。
3. 以前能渲染的图，现在退化成更简单的纯文本 label，或者和旧版本效果不一致。

如果图表来源是完全可信的，而且确实需要 Mermaid loose 配置，请按具体渲染面显式关闭 strict，而不是改回全局默认值。在 Markstream 渲染器中，`isStrict=false` 不代表原始 SVG 插入；最终 SVG 仍会被清理，因此 `foreignObject` 和 active HTML labels 可能会被移除。

### Vue 3：让可信 Markdown 面使用 Mermaid loose 配置

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const trustedMarkdown = `
\`\`\`mermaid
flowchart TD
  A["<b>可信 HTML label</b><br/>第 2 行"] --> B
\`\`\`
`
</script>

<template>
  <MarkdownRender
    :content="trustedMarkdown"
    :mermaid-props="{ isStrict: false }"
  />
</template>
```

### 直接使用组件

```vue
<MermaidBlockNode :node="node" :is-strict="false" />
```

### 其他框架入口

```tsx
import MarkdownRender from 'markstream-react'

<MarkdownRender content={trustedMarkdown} mermaidProps={{ isStrict: false }} />
```

```html
<markstream-angular
  [content]="trustedMarkdown()"
  [mermaidProps]="{ isStrict: false }"
/>
```

```vue
<MarkdownRender :content="trustedMarkdown" :mermaid-props="{ isStrict: false }" />
```

用户内容、AI 输出、或混合可信度的 Markdown 流，仍然建议保持默认 strict。

## 5. 常见问题排查

1. **未安装依赖**：确保执行 `pnpm add mermaid`。缺失时组件会退回显示原始文本。
2. **版本过旧**：请使用 `mermaid` ≥ 11，旧版本无法兼容异步渲染。
3. **SSR 报错**：Mermaid 依赖 DOM。Nuxt 请包裹 `<ClientOnly>`，Vite SSR 请在 `onMounted` 中渲染。
4. **图表过大**：考虑在服务端预渲染或缓存 SVG，`MermaidBlockNode` 导出事件中提供 `svgString` 可直接上传或持久化。

若问题仍存在，请在 playground (`pnpm play`) 中构造最小示例并附带链接提交 issue，方便复现与定位。

## CDN 用法（无 bundler）

如果你通过 CDN 引入 Mermaid，并希望流式场景下的解析（语法检查/前缀查找）在 worker 中进行，可以注入一个“CDN 加载 Mermaid”的 worker：

```ts twoslash
import { createMermaidWorkerFromCDN, enableMermaid, setMermaidLoader, setMermaidWorker } from 'markstream-vue'

// 主线程使用 CDN 全局（UMD）
setMermaidLoader(() => (window as any).mermaid)
enableMermaid(() => (window as any).mermaid)

// 可选：worker 用于流式解析/前缀查找（推荐 module worker）
const { worker } = createMermaidWorkerFromCDN({
  mode: 'module',
  mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
})
if (worker)
  setMermaidWorker(worker)
```
