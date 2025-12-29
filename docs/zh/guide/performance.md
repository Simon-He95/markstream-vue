# 性能特性与建议

本渲染器针对流式与大型文档进行优化。

关键功能：

- 针对代码块的增量解析
- 最小化的 DOM 更新与内存优化
- Monaco 的流式更新
- 渐进式 Mermaid 渲染

性能建议：

- 将长文档分块流式传输，避免阻塞主线程
- 对只读代码块使用 `MarkdownCodeBlockNode` 或 `renderCodeBlocksAsPre`
- 使用 `setDefaultMathOptions` 在应用启动时设置数学渲染默认项
- 对重型节点启用 `viewportPriority`（默认开启）以延迟离屏工作

更多详细信息见 `/zh/guide/performance`。

## 让渲染保持稳定的“逐字更新”

有些 LLM 会一次推送大量文本，导致前端表现为“卡顿一会儿再一次性显示”。想让用户始终看到稳定的打字机效果，可以：

- **保持 `typewriter` 为默认开启**，这样非代码节点都会通过进入动画逐字呈现。
- **调整批次渲染参数**：调低 `initialRenderBatchSize` / `renderBatchSize`（如 `12` / `24`），并设置一个 20–30 ms 的 `renderBatchDelay`，让每次渲染只插入很小的一段文本。
- **在上游做节流或拆包**：把后端一次性推送的大段文本按段落拆分，或用 50–100 ms 的防抖再更新 `content`，减少一次性 diff。
- **保留延迟可见渲染**：继续启用 `deferNodesUntilVisible` / `viewportPriority`，避免 Mermaid、Monaco 这类重型节点阻塞文字流。
- **必要时降级代码块**：在突发大块传输时暂时关闭 `codeBlockStream` 或启用 `renderCodeBlocksAsPre`，避免语法高亮抢占时间片。

这些组合可以把 DOM 工作量稳定在可控范围，哪怕服务端一次发送很多文本，用户也会感知为持续、丝滑的逐字输出。

## 虚拟化与 DOM 窗口

`NodeRenderer` 会维护一个滑动窗口，只让一部分节点常驻 DOM，从而在极长的对话或文档中保持流畅：

- `maxLiveNodes`（默认 `320`）定义了 DOM 中最多保留多少个已完全渲染的节点。减小可以省内存、增大可以保留更多回溯内容。
- `liveNodeBuffer` 控制窗口前后的超前/超后范围（默认 `60`）。如果节点高度差异巨大，可增大该值以避免快速滚动时闪烁。
- `deferNodesUntilVisible` 搭配 `viewportPriority` 使用，可以让 Mermaid、Monaco、KaTeX 等重型节点在进入视口之前保持占位骨架。
- `batchRendering` 以及 `initialRenderBatchSize`、`renderBatchSize`、`renderBatchDelay`、`renderBatchBudgetMs` 控制每一帧有多少节点从占位态切换为真实组件。该增量模式仅在关闭虚拟化（`:max-live-nodes="0"`）时生效；默认开启虚拟化时，所有节点会立即渲染，依靠窗口裁剪来限制 DOM 工作量。

示例：在保持可滚动回溯的同时降低 DOM 开销。

```vue
<MarkdownRender
  :content="md"
  :max-live-nodes="220"
  :live-node-buffer="40"
  :batch-rendering="true"
  :initial-render-batch-size="24"
  :render-batch-size="48"
  :render-batch-delay="24"
  :render-batch-budget-ms="8"
  :defer-nodes-until-visible="true"
  :viewport-priority="true"
/>
```

利用这些旋钮，可以把超长 AI 对话或技术文档维持在一个稳定的 CPU / 内存预算中，同时保持滚动与输入的流畅体验。
