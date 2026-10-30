# Vue 3 对齐清单

本包以同仓库 Vue 3 公开功能为基准。`pnpm --filter markstream-solid check:parity` 对照 `src/exports.ts` 及 Vue 3 类型声明，校验 181 个运行时导出和 10 组组件/渲染器属性契约；行为由单元测试和生产浏览器用例验证。

| Vue 3 功能 | Solid 对应行为 | 验证 |
| --- | --- | --- |
| MarkdownRender / NodeRenderer | 原生 Solid 组件；content、非空 nodes、final、parseOptions、Markdown-it 扩展 | renderer、SSR |
| nodes 选择规则 | 非空数组优先；空数组与 Vue 3 一样回退到 content | renderer |
| docs / chat / minimal | 同样的模式默认值和显式属性覆盖；final 聊天历史自动窗口；maxLiveNodes=0 禁用窗口 | virtual-state |
| domMode / renderAsFragment | 满足条件时移除节点包装；需要窗口/节点推迟渲染时保留完整 DOM | virtual-state、SSR |
| smoothStreaming / parseCoalesceMs | 共享 stream controller；最终收尾、替换、清空、续流与解析合并 | renderer、浏览器 |
| typewriter / fade | simple 与 precise 光标；共用 core 分段渐显状态机，选区保持及动画收尾 | renderer、浏览器 |
| 代码工具栏 | 复制反馈、折叠、展开、更多菜单、字体减小/重置/放大、宽度与按钮开关 | toolbar、浏览器 |
| 代码运行时 | 已存在实例增量更新；loading 期间使用原生预览；非流式配置等到完成；主题、行号、diff 与 worker pool | toolbar、renderer、浏览器 |
| 强制 pre 路径 | 不加载编辑器；保留代码头/复制、行号、换行、split/unified diff、折叠上下文与保留高度 | toolbar、浏览器 |
| HTML 预览 | body Portal、srcdoc、默认空 sandbox、显式 scripts/sandbox、动态内容、Escape/关闭/背景关闭 | toolbar、浏览器 |
| HTML/SVG artifact | onPreviewCode / onHandleArtifactClick 提供相同 artifactType、title、node、id；有回调时交由宿主处理 | toolbar、浏览器 |
| Mermaid / D2 / infographic | source/preview、复制、SVG 导出、折叠和相应按钮开关；Mermaid/infographic 缩放、平移、全屏 | diagrams、heavy-nodes、浏览器 |
| 图表异步生命周期 | debounce、最终渲染、保留上次有效预览、旧结果取消、实例清理、Mermaid 错误回调、可取消事件 | diagrams、heavy-nodes |
| 基础与独立节点 | 段落、标题、行内格式、列表、表格、脚注、图片、HTML、数学、admonition 与 vmr container 导出 | renderer、provider、打包检查 |
| 表格 / 图片 / 链接 | 列宽拖拽；图片加载/失败/安全 fallback；链接属性清洗、目标和 tooltip；脚注限定渲染树定位 | renderer、浏览器 |
| 自定义组件 | 全局、customId、局部覆盖；streamingComponents / htmlComponents；块级/行内 display 提示 | renderer、provider、virtual-state |
| app 级配置 | MarkstreamProvider 隔离组件、翻译和语言图标；全局配置函数仍可用于初始化 | provider |
| 视口与批处理 | 节点壳和重型节点视口推迟；批次大小、预算、idle timeout、后台定时器与卸载清理 | renderer、virtual-state |
| 文档虚拟状态 | getVirtualMetrics、captureVirtualState、restoreVirtualState、forceMeasure、settle、scrollToNode；签名/宽度/测量 key 校验 | virtual-state、浏览器 |
| 外层会话列表 | MarkstreamVirtualTimeline / useMarkstreamVirtualAdapter；窗口、测量、锚点、缓存、线程隔离和旧任务清理 | virtual-state、virtual-adapter |
| 包与 worker | browser/node 条件导出、SSR/hydration、utils、worker clients/CDN helpers/worker 入口、CSS 和 tailwind 入口 | API gate、SSR、消费者 smoke、浏览器 |

## 公共实现审查

| 公共能力 | 复用来源 | 框架层保留的部分 |
| --- | --- | --- |
| 平滑流与 streaming 文本状态 | `markstream-core` 的 stream controller / text-state resolver | Solid accessor、effect 和卸载绑定 |
| diff 预览与匹配缓存 | `markstream-core` 的 `buildDiffPreviewPanes` / `createDiffMatchCache` | Solid 行节点与 ResizeObserver 调度 |
| 代码头、diff 统计、主题、字体/行高、padding/gutter、diff 行测量、运行时 surface CSS | Vue 3 与 Solid 直接导入同一份 `markstream-core` 工具 | 各自组件、ref、事件与编辑器生命周期 |
| 通用 SVG 清洗 | Vue D2 与 Solid 直接导入 `markstream-core` 的 `toSafeSvgMarkup`；保留 Vue D2 的 root class | 各自预览容器、下载和 artifact 事件 |
| Mermaid theme directive 与图表平移 | `markstream-core` 的 directive / pan gesture | 实例加载、可见性与 Solid 事件绑定 |
| Markdown AST、HTML 标签/属性与 Mermaid SVG 清洗 | `stream-markdown-parser` | Solid 节点组件及 provider 配置 |
| playground 外观与分片模拟 | `playground-shared`；共用 Vue playground 的纯数据/流生成函数 | 原生 Solid 控件与 TPS/stream 生命周期 |

代码块纯工具已移除 Vue/Solid 各自的副本。主题/布局 token 与 pre/diff CSS 共用 `markstream-core/src/styles`，文本渐显使用同一个 core 状态机。框架响应式状态、provider、SSR/hydration 与 DOM 生命周期继续留在各自包中，避免 core 依赖 Vue 或 Solid。

预览到高亮交接复用 Vue 3 的 gutter、padding、字体与运行时 CSS 契约；浏览器检查覆盖 wrap/scroll、首次导航/刷新、窄屏、明暗主题、首字符坐标、切换边界高度及无空白帧。首批节点直接渲染，后续节点才按视口推迟。

## 框架绑定方式

Vue 的 `app.use(VueRendererMarkdown)` 对应 Solid 的 `MarkstreamProvider`，不会引入 Vue 运行时。Vue 的事件、具名插槽与组件 ref 分别使用 Solid 回调、`headerLeft` / `headerRight` JSX/render props 与 `ref={handle => ...}`。流式 composable 的响应式值使用 `source()`、`visible()`、`done()`、`final()` 等 accessor，也保留 `snapshot()`。

内部 DOM 包装、响应式更新和调度实现采用 Solid 的原生方式；性能数据中的 DOM 数量因此可以不同。对齐验收关注公开功能、最终内容、交互、安全策略和恢复行为，不要求复用 Vue 的内部实现。

## 可重复执行

```bash
pnpm --filter markstream-solid typecheck
pnpm test:solid
pnpm test:smoke:solid
pnpm test:e2e:solid-playground
```

`playground-solid` 的 “Toolbar & preview fixtures” 提供 HTML、SVG、diff、Mermaid、D2 和 infographic 示例。完整检查结果、语料、测量边界及性能原始记录位置见 [VALIDATION.md](./VALIDATION.md)。组件样式、worker 与完整播放记录见 [COMPONENT_VALIDATION.md](./COMPONENT_VALIDATION.md)。
