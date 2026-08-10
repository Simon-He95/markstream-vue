---
title: 覆盖 MermaidBlockNode
description: 通过 setCustomComponents 在 MarkdownRender 中覆盖 MermaidBlockNode，演示拦截 export、copy 事件并自定义 mermaid 渲染器行为。
keywords:
  - MermaidBlockNode
  - 自定义组件
  - 组件覆盖
---

# 在 MarkdownRender 中覆盖 MermaidBlockNode（示例）

如果你想在 `MarkdownRender` 中完全替换 `mermaid` 渲染器（例如在 `playground-demo`），可以使用 `setCustomComponents`，为 `mermaid` 提供一个 programmatic 的渲染函数，并传入自定义事件处理器来拦截组件的默认行为。

示例：

```ts twoslash
import type { MermaidBlockEvent } from 'markstream-vue'
import { MermaidBlockNode, setCustomComponents } from 'markstream-vue'
import { h } from 'vue'

declare function uploadSvgToServer(svg: string): void

setCustomComponents('playground-demo', {
  mermaid: (props: any) => h(MermaidBlockNode, {
    ...props,
    // 使用 `h()` 时，通过驼峰的 on<EventName> 传入事件监听器
    onExport: (ev: MermaidBlockEvent) => {
      // 组件在事件中同时暴露 `svgElement` 和 `svgString`，直接优先使用 ev.svgString
      const svgEl = ev.svgElement as SVGElement | null
      const svgStringFromEv = ev.svgString as string | null
      const svgString = svgStringFromEv ?? (svgEl ? new XMLSerializer().serializeToString(svgEl) : null)
      if (svgString) {
        // 将 svgString 上传或保存到后端
        uploadSvgToServer(svgString)
      }
      // 阻止组件默认的导出行为
      ev.preventDefault()
    },
    onCopy: (ev: MermaidBlockEvent<{ type: 'copy', text: string }>) => {
      ev.preventDefault()
      // 复制文本在 ev.payload.text 中（你也可以在这里做埋点/自定义 toast）
      const text = ev.payload?.text ?? ''
      console.log('MermaidBlockNode copy text:', text)
    },
  }),
})
```

要点：

- 在使用 `h()` programmatic 渲染组件时，事件监听器应使用 `on<EventName>` 的驼峰形式（例如 `onExport`、`onCopy`）。
- 在监听器中调用 `ev.preventDefault()` 可以阻止 `MermaidBlockNode` 的默认处理，完全由你接管行为（如上传、存储或自定义下载）。
- `MermaidBlockEvent` 可能会在 `ev.svgElement` 中提供渲染后的 `svg` DOM 节点，便于你直接序列化或修改它。

如果你希望我把这个示例内联到组件 README 中或把该页面加入 docs 侧栏，我可以继续帮你完成。
