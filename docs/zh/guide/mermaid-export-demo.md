---
title: Mermaid 导出示例
description: 提供可运行的 Mermaid 导出示例，展示如何拦截 MermaidBlockNode 的 export 事件并上传序列化 SVG 到服务端。
keywords:
  - Mermaid 导出
  - SVG 上传
  - 示例
---

# Mermaid 导出示例

仓库包含一个可运行的 playground 示例，展示如何拦截 `MermaidBlockNode` 的 `export` 事件并上传序列化的 SVG（`ev.svgString`）。

const md = `
\`\`\`mermaid
graph LR
  A[User] --> B[Server]
  B --> C[Storage]
\`\`\`
`
- Playground 路由: `/mermaid-export-demo`
- 文件: `playground/src/pages/mermaid-export-demo.vue`

为什么要看这个示例？

- 演示如何使用 `setCustomComponents` 在 `MarkdownRender` 中替换 mermaid 渲染器。
- 展示如何拦截 `export` 并使用 `ev.svgString`（或 `ev.svgElement`）上传或发送 SVG 到 API。

试试：运行 playground 并访问路由 `/mermaid-export-demo`。

可复制运行示例

以下是一个可直接复制到项目或 playground 的单文件组件示例（SFC）。它展示了如何通过 `setCustomComponents` 覆盖 mermaid 渲染器、拦截 `export` 事件并上传 `ev.svgString`。

```vue
<script setup lang="ts">
import MarkdownRender, { MermaidBlockNode, setCustomComponents } from 'markstream-vue'
import { h } from 'vue'

async function uploadSvgToServer(svgString: string) {
  // 这里替换为真实上传逻辑
  // await fetch('/api/upload', { method: 'POST', body: svgString })
  return `https://example.com/uploads/mermaid-${Date.now()}.svg`
}

setCustomComponents('my-demo', {
  mermaid: (props: any) => h(MermaidBlockNode, {
    ...props,
    onExport: async (ev: any) => {
      ev.preventDefault()
      const svg = ev.svgString ?? (ev.svgElement ? new XMLSerializer().serializeToString(ev.svgElement) : null)
      if (!svg) {
        console.warn('未能获取 svg 数据')
        return
      }
      const url = await uploadSvgToServer(svg)
      console.log('svg 已上传到', url)
    },
  })
})

const md = `
\`\`\`mermaid
graph LR
  A[User] --> B[Server]
  B --> C[Storage]
\`\`\`
`
</script>

<template>
  <MarkdownRender custom-id="my-demo" :content="md" />
</template>
```

在仓库 playground 中运行：

```bash
pnpm play
# 打开 http://localhost:5173/mermaid-export-demo
```

实时演示（内嵌）

如果官方 playground 有托管，下面的 iframe 会直接加载示例（也可以在本地运行 playground 并打开该路由）：

<div style="max-width:960px; margin: 1rem 0; position:relative;">
  <iframe
    src="https://markstream-vue.simonhe.me/mermaid-export-demo"
    title="Mermaid 导出示例"
    loading="lazy"
    sandbox="allow-forms allow-scripts allow-popups allow-same-origin"
    style="width:100%; height:540px; border:1px solid #e5e7eb; border-radius:8px; background:#0b0b0b"
  ></iframe>

  <div style="margin-top:0.5rem; font-size:0.9rem; color:var(--vp-c-default);">
    如果内嵌框（iframe）显示为空白或黑色，远端托管站点可能不允许被嵌入（X-Frame-Options/CSP）或示例站点离线。
    <strong>你可以尝试：</strong>
    <ul>
      <li><a href="https://markstream-vue.simonhe.me/mermaid-export-demo" target="_blank" rel="noopener noreferrer">在新标签页打开演示</a></li>
      <li>在本地运行 playground：<code>pnpm play</code>，然后访问 <code>/mermaid-export-demo</code></li>
      <li>使用下面的 CodeSandbox 链接把 playground 导入到在线编辑器并运行</li>
    </ul>

    <!-- 视觉预览：使用仓库 docs 的公共截图资源 -->
    <div style="margin-top:0.75rem; border:1px solid rgba(0,0,0,0.06); border-radius:6px; overflow:hidden; max-width:680px;">
      <img src="/screenshots/mermaid-demo.svg" alt="Mermaid 导出示例预览" style="width:100%; display:block; background:#fff" />
      <div style="padding:0.5rem 0.75rem; font-size:0.85rem; color:var(--vp-c-muted);">预览：Mermaid 导出示例（如果 iframe 阻止嵌入，请在本地运行查看）</div>
    </div>
  </div>
</div>

在 CodeSandbox 中打开

如果希望在 web 编辑器中修改并测试，可以导入仓库到 CodeSandbox（GitHub 导入）并打开 `playground` 文件夹：

CodeSandbox（在线可编辑）

<div style="max-width:960px; margin: 1rem 0;">
  <iframe
    src="https://codesandbox.io/embed/github/Simon-He95/markstream-vue/tree/main/playground?autoresize=1&fontsize=14&hidenavigation=1"
    title="Playground (CodeSandbox)"
    style="width:100%; height:520px; border:1px solid #e5e7eb; border-radius:8px;"
    sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin allow-popups-to-escape-sandbox"
  ></iframe>

  <div style="margin-top:0.5rem; font-size:0.9rem; color:var(--vp-c-muted);">
    在 CodeSandbox 中编辑并运行 playground — 如果需要完整编辑器体验，也可以在新标签页打开：
    <a href="https://codesandbox.io/s/github/Simon-He95/markstream-vue/tree/main/playground" target="_blank" rel="noopener noreferrer">在 CodeSandbox 中打开 playground</a>
  </div>
</div>

[在 CodeSandbox 中打开 playground（GitHub 导入）](https://codesandbox.io/s/github/Simon-He95/markstream-vue/tree/main/playground)
