---
description: 优化 markstream-vue 在流式聊天、大文档、Monaco 代码块以及 Mermaid 和 KaTeX 重内容场景下的性能表现。
---

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

## 1.0 Benchmark

发布 1.0 前运行：

```bash
pnpm benchmark:1.0
```

它会构建 playground，通过 `vite preview` 跑 Diagnostic Studio baseline/thinking/diff/stress 与主 playground reverse-flex chat 场景，并在 `benchmark/` 下生成 JSON 与 Markdown 报告，包含环境披露、LCP、CLS、settle time、p95 `requestAnimationFrame` interval、long task、page 与 renderer DOM 节点数、fallback、重节点 readiness、滚动漂移和 Chrome-only best-effort 的 renderer unmount + GC 后 heap 等指标。1 MB、1000 code blocks、100 Mermaid、10k nodes 这类 synthetic 场景属于后续 1.0.x 覆盖，未接入脚本前不要作为 1.0 release evidence。

## 包体积优化流程（维护者）

当你修改可能影响构建体积的路径（渲染器、代码块、可选 peer）时，建议在合并前执行：

- `pnpm build:analyze`：生成可视化报告（`bundle-visualizer.html`、`bundle-visualizer-tailwind.html`），确认体积变化是“落在哪个 chunk”。
- `pnpm size:check`：本地执行体积预算守卫，覆盖 `dist` 总量、最大 JS chunk，以及 `npm pack --dry-run` 的 tarball/unpacked 体积。
- 可选：通过环境变量收紧预算（`MAX_DIST_BYTES`、`MAX_JS_CHUNK_BYTES`、`MAX_PACK_TGZ_BYTES`、`MAX_PACK_UNPACKED_BYTES`）。

## 让渲染保持稳定的“逐步更新”

有些 LLM 会一次推送大量文本，导致前端表现为“卡顿一会儿再一次性显示”。想让用户始终看到稳定、连续的输出，可以：

- **需要光标时显式开启 `typewriter`，并保持 `fade` 开启**，这样流式输出可以显示闪烁光标，非代码节点会通过淡入动画平滑呈现，而不是瞬间跳出；流式追加出来的新文本片段也会补一段局部短 fade，不会把整块一起压暗。
- **调整批次渲染参数**：调低 `initialRenderBatchSize` / `renderBatchSize`（如 `12` / `24`），并设置一个 20–30 ms 的 `renderBatchDelay`，让每次渲染只插入很小的一段文本。
- **在上游做节流或拆包**：把后端一次性推送的大段文本按段落拆分，或用 50–100 ms 的防抖再更新 `content`，减少一次性 diff。
- **保留延迟可见渲染**：继续启用 `deferNodesUntilVisible` / `viewportPriority`，避免 Mermaid、Monaco 这类重型节点阻塞文字流。
- **必要时降级代码块**：在突发大块传输时暂时关闭 `codeBlockStream` 或启用 `renderCodeBlocksAsPre`，避免语法高亮抢占时间片。

这些组合可以把 DOM 工作量稳定在可控范围，哪怕服务端一次发送很多文本，用户也会感知为持续、丝滑的逐步输出。

## 虚拟化与 DOM 窗口

`MarkdownRender` 会维护一个滑动窗口，只让一部分节点常驻 DOM，从而在极长的对话或文档中保持流畅：

- `maxLiveNodes`（默认 `320`）定义了 DOM 中最多保留多少个已完全渲染的节点。减小可以省内存、增大可以保留更多回溯内容。
- `liveNodeBuffer` 控制窗口前后的超前/超后范围（默认 `60`）。如果节点高度差异巨大，可增大该值以避免快速滚动时闪烁。
- `deferNodesUntilVisible` 搭配 `viewportPriority` 使用，可以让 Mermaid、Monaco、KaTeX 等重型节点在进入视口之前保持占位骨架。
- `batchRendering` 以及 `initialRenderBatchSize`、`renderBatchSize`、`renderBatchDelay`、`renderBatchBudgetMs` 控制每一帧有多少节点从占位态切换为真实组件。该增量模式仅在关闭虚拟化（`:max-live-nodes="0"`）时生效；默认开启虚拟化时，所有节点会立即渲染，依靠窗口裁剪来限制 DOM 工作量。

示例：在保持可滚动回溯的同时降低 DOM 开销。

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Virtualized transcript'
</script>

<template>
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
</template>
```

利用这些旋钮，可以把超长 AI 对话或技术文档维持在一个稳定的 CPU / 内存预算中，同时保持滚动与输入的流畅体验。
