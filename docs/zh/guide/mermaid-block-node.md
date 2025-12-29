# MermaidBlockNode (Component)

`MermaidBlockNode` 提供一个易于使用且可扩展的 Mermaid 渲染器，适用于需要在文档中内嵌交互式 Mermaid 图的场景。组件支持渐进式渲染、源码/预览切换、复制源码、导出 SVG，以及伪全屏查看（带缩放与拖拽）。

## Props（关键）
- `node: any` — Mermaid 代码节点（必须）
- `isDark?: boolean` — 暗色模式开关
- `loading?: boolean` — 初始加载占位
- `maxHeight?: string | null` — 最大高度
- `isStrict?: boolean` — 开启 `securityLevel: 'strict'` + DOMPurify，并禁用 HTML labels；用于渲染不可信的 Mermaid 输入（例如用户/LLM 生成的内容），防止 `<script>`、`javascript:` 链接或内联事件落入最终 SVG
- Header/按钮控制（全部可选，默认 `true`）:
  - `showHeader` / `showModeToggle` / `showCopyButton` / `showExportButton` / `showFullscreenButton` / `showCollapseButton` / `showZoomControls`

## Slots
- `header-left` — 替换左侧（默认是 Mermaid 图标 + 标签）
- `header-center` — 替换中间区域（默认 preview/source 切换）
- `header-right` — 替换右侧操作按钮（完整接管默认按钮）

## Emits
组件发出的事件都使用统一的 `MermaidBlockEvent` 对象，支持 `preventDefault()` 来阻止组件默认行为：

- `copy` — 复制事件（保留默认复制逻辑）
- `export` — 导出按钮点击，处理签名：`(ev: MermaidBlockEvent<{ type: 'export' }>)`
- `openModal` — 请求打开 pseudo-fullscreen，处理签名：`(ev: MermaidBlockEvent<{ type: 'openModal' }>)`（组件内部 emit 名称为 `openModal`）
- `toggleMode` — 切换 `source | preview`，处理签名：`(target: 'source' | 'preview', ev: MermaidBlockEvent<{ type: 'toggleMode'; target: 'source' | 'preview' }>)`（组件内部 emit 名称为 `toggleMode`）

### 拦截示例
完全替换组件默认导出行为：

```vue
<script setup lang="ts">
import type { MermaidBlockEvent } from '../../types/component-props'

function onExport(ev: any /* MermaidBlockEvent */) {
  ev.preventDefault()
  // 组件在事件对象中暴露了 svgElement，直接使用它更方便
  const svgEl = ev.svgElement as SVGElement | null
  if (!svgEl) {
    console.warn('No svg element available')
    return
  }
  const svgString = new XMLSerializer().serializeToString(svgEl)
  uploadSvg(svgString)
}
</script>

<template>
  <MermaidBlockNode :node="node" @export="onExport" />
</template>
```

> 注意：`export` / `openModal` 事件的事件对象现已同时包含 `svgElement`（DOM 节点）和 `svgString`（已序列化的 SVG 字符串），任选其一使用更方便。

## Slot 示例：完全接管右侧操作按钮

```vue
<MermaidBlockNode :node="node" :showExportButton="false">
  <template #header-right>
    <button @click="downloadSvg">Download</button>
    <button @click="openCustomModal">Open custom modal</button>
  </template>
</MermaidBlockNode>
```

## 推荐用法
- 如果你要实现自定义导出/上传，最佳做法是：在 `export` 监听器中 `preventDefault()`，并在监听回调中直接从组件渲染的 DOM 中读取 `svg`。
- 如果你想要完全替换头部的 UI，使用 `header-*` 插槽并把相应 `show*` props 设为 `false` 来隐藏默认按钮。
- 若 Mermaid 内容来自用户/LLM 或任何不可信来源，建议加上 `:is-strict="true"`，组件会对 SVG 进行清理并禁用 HTML labels，从而堵住恶意 `<script>` 或 `javascript:` 链接注入的风险。

---

如果你希望我现在：
- A) 将 `export` / `openModal` 事件的 payload 增加 `svg` 字符串（我可以实现并更新组件与文档）；
- B) 把本页面加入 docs 左侧目录或导航（需要修改 docs 配置）；
- C) 生成一个可运行的示例页面（playground/demo）；
请选择一个继续。

## 参考

- 覆盖 `MermaidBlockNode`（在 `MarkdownRender` 中使用 `setCustomComponents`）的示例（中文）：[覆盖 MermaidBlockNode（MarkdownRender 示例）](./mermaid-block-node-override.md)

Playground 示例：仓库包含一个可运行的 playground 页面演示如何拦截 `export` 并上传 `ev.svgString` —— 路由: `mermaid-export-demo` (文件：`playground/src/pages/mermaid-export-demo.vue`)。
