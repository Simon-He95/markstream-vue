# Mermaid 快速上手

`markstream-vue` 支持渐进式 Mermaid 渲染：一旦语法合法就立即生成图表，后续 token 会继续完善图。以下内容介绍安装、流式示例以及常见排障。

## 1. 安装与样式导入

```bash
pnpm add mermaid
```

```ts
// main.ts / 入口
import 'mermaid/dist/mermaid.css'
```

在使用 Tailwind/UnoCSS 时，请在 reset 之后、`@layer components` 中导入 Mermaid 与库的 CSS，避免 utilities 覆盖：

```css
@import 'modern-css-reset';

@layer components {
  @import 'mermaid/dist/mermaid.css';
  @import 'markstream-vue/index.css';
}
```

## 2. 流式示例

```vue
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
如果渲染的 Mermaid 来自用户/LLM 等不可信来源，可加上 `:is-strict="true"` 启用严格模式与 SVG 清理，阻断 HTML labels 或内联事件混入渲染结果。

## 4. 常见问题排查

1. **未安装依赖**：确保执行 `pnpm add mermaid`。缺失时组件会退回显示原始文本。
2. **缺少 CSS**：导入 `mermaid/dist/mermaid.css`，并在 Tailwind/UnoCSS 项目中用 `@layer components` 包裹，缺失时会出现空白。
3. **版本过旧**：请使用 `mermaid` ≥ 11，旧版本无法兼容异步渲染。
4. **SSR 报错**：Mermaid 依赖 DOM。Nuxt 请包裹 `<ClientOnly>`，Vite SSR 请在 `onMounted` 中渲染。
5. **图表过大**：考虑在服务端预渲染或缓存 SVG，`MermaidBlockNode` 导出事件中提供 `svgString` 可直接上传或持久化。

若问题仍存在，请在 playground (`pnpm play`) 中构造最小示例并附带链接提交 issue，方便复现与定位。

## CDN 用法（无 bundler）

如果你通过 CDN 引入 Mermaid，并希望流式场景下的解析（语法检查/前缀查找）在 worker 中进行，可以注入一个“CDN 加载 Mermaid”的 worker：

```ts
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
