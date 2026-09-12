# Markstream Solid 移植台账

历史台账。当前能力、限制与重跑入口见 [CAPABILITY.md](./CAPABILITY.md)，不要把本文件的“已验证”行当成产品现状。

基线：`f808226cd747ae266e5a046819d374c707b63f80` 的 `markstream-svelte`。本台账开始于 2026-09-10。

## 已有证据

| 验证 | 结果 | 覆盖范围 |
| --- | --- | --- |
| `pnpm --filter markstream-solid typecheck` | 退出 0 | Solid JSX、公开类型和 parser/core 依赖解析 |
| `pnpm --filter markstream-solid build` | 退出 0 | 浏览器 ESM、SSR、声明和 CSS 产物 |
| `pnpm test:e2e:solid-hydration` | 退出 0 | SSR `renderToString` + hydrate |
| `pnpm --filter markstream-solid test` | 退出 0（50 tests） | 解析、Solid DOM、HTML 安全、流式节点身份、自定义组件、批量调度、TextNode 稳定追加、final replacement/reset、代码块控件、NodeOutlet 模式/高度、可选 peer 降级、渐进图表渲染、KaTeX 取消、worker 清理、D2 预览前源码 fallback、Mermaid 与 Infographic 预览高度默认值、跨框架 parser cache 隔离和 Mermaid 流式节流 |
| `pnpm --filter markstream-solid-playground build` | **historical / unreproducible from this commit** — git at `1f51247e` has no `playground-solid/` source. Do not treat as this playground-migration run. See `playground-solid/VERIFICATION.md`. | previously claimed production build |
| `pnpm --filter markstream-solid-playground hydration:generate` + Chromium | **historical / unreproducible from this commit** — no playground app existed in git. See `playground-solid/VERIFICATION.md`. | previously claimed SSR/hydration |

## 已实现的试搬链路

| 源 | Solid 目标 | API / 行为 | 状态 | 验证 |
| --- | --- | --- | --- | --- |
| `components/shared/node-helpers.ts` | `src/node-helpers.ts` | parser、props、render context | 已实现 | 类型检查、构建；运行测试待执行 |
| `hydrateCustomTagContent.ts` | `src/hydrateCustomTagContent.ts` | 自定义标签内容水合 | 已实现 | 类型检查、构建及 renderer-scoped 自定义标签嵌套 Markdown DOM 回归通过 |
| `parseNestedMarkdownToNodes.ts` | 同名 `src/*.ts` | 嵌套 Markdown 结构解析及自定义标签水合 | 已实现 | 类型检查、构建、嵌套内容回归通过 |
| `composables/useSmoothMarkdownStream.svelte.ts` | `src/composables/useSmoothMarkdownStream.ts` | core controller 的 Solid accessor 封装和 owner cleanup | 已实现 | 类型检查、构建及 pending stream owner 卸载后计时器回归通过 |
| `context/smoothStreaming.ts` | `src/context/smoothStreaming.ts` | 嵌套流式上下文 | 已实现 | 类型检查、构建 |
| `customComponents.ts` | `src/customComponents.ts` | global/scoped 注册、revision、订阅 | 已实现 | 类型检查、构建、运行时 global 注册回归通过 |
| `TextNode.svelte` | `src/components/TextNode.tsx` | text map、追加 fade、稳定文字 | 已实现 | 类型检查、构建和追加时 TextNode DOM owner/delta 回归通过 |
| `RenderChildren.svelte` | `src/components/RenderChildren.tsx` | 位置 key 的子节点槽位 | 已实现 | 类型检查、append 及插入/删除/重排的 DOM owner 身份回归通过 |
| `NodeRenderer.svelte` | `src/components/NodeRenderer.tsx` | content/nodes、final、smooth stream、context、批量节点调度、typewriter cursor、`hasLoadingNodes` 增强门闩 | 已实现 | 解析、Solid DOM、append DOM 身份、完成态 idle/RAF 批量调度、SSR 输出和同树 hydration、段落 typewriter cursor 与 `code_block` 末节点隐藏回归通过；浏览器用例待补 |
| `NodeOutlet.svelte` | `src/components/NodeOutlet.tsx` | 普通节点、安全 HTML、重节点及 type/language 自定义组件分发 | 已实现 | 类型检查、HTML 安全、类型替换、全局与 renderer-scoped component 优先级、language 自定义组件、所有代码语言模式和预览高度上下限回归通过 |
| `renderMarkdownHtml.ts`、`sanitizeHtmlContent.ts`、`sanitizeSvg.ts` | 同名 `src/*.ts` | 字符串 HTML 接口与 safe/escape 策略 | 已实现 | 类型检查、构建、阻止 script 的 DOM 回归通过；完整对照测试待补 |
| `enhanceRenderedHtml.ts` | 同名 `src/*.ts`，由 NodeRenderer owner 驱动 | HTML 中 KaTeX、图表、代码块、脚注与 tooltip 增强及 dispose | 已实现 | 类型检查、普通渲染回归、KaTeX 延迟 loader 取消后不写入 DOM 回归通过；真实 browser 增强取消待补 |
| `optional/streamDiffs.ts`、`utils/languageIcon.ts` | `src/optional-streamDiffs.ts`、`src/languageIcon.ts` | 可选 editor runtime loader 与语言工具 | 已实现 | 类型检查、构建、可选 runtime 降级、真实 runtime 的实例复用、语言前缀收敛与 Chromium 回归通过 |
| `workers/*` | `src/workers/*` | KaTeX/Mermaid clients、CDN helpers 与 worker entrypoints | 已实现 | 类型检查、构建产物和 declarations 已生成；注入 worker 优先级、清理待处理请求、Chromium 资源请求回归通过 |
| `CodeBlockNode.svelte` | `src/components/CodeBlockNode.tsx` | 单/双栏实例、增量 update、theme、可选 runtime fallback、卸载清理、复制/预览/展开/折叠/字体大小控件、non-diff fallback 行号，以及流式不完整语言标识延迟；选区/滚动走 runtime view API，更新后 tokenize 与 height sync | 已实现 | 类型检查、控件挂载、fallback 行号、可选 runtime 降级、语言前缀收敛、append 复用 runtime、theme/行号原地更新、single/diff 切换重建、view API 选区恢复；Chromium 中真实 runtime 保持 shell、受限滚动位置和原生选区，并验证字体从 12px 调整至 13px |
| `HtmlPreviewFrame.svelte`、`Tooltip.svelte`、`tooltip/singletonTooltip.ts` | 对应 `src/components/` 与 `src/tooltip/` | iframe sandbox、close callback、singleton positioning 与 cleanup | 已实现 | 类型检查、普通节点、Tooltip 定位变换、ARIA 关联和 cleanup 回归通过 |
| `i18n/useSafeI18n.ts` | 同名 `src/i18n/` | 默认翻译 map 与 fallback key humanization | 已实现 | 类型检查、公开 API 回归通过 |
| `MathInlineNode.svelte`、`MathBlockNode.svelte` | `src/components/MathNodes.tsx` | KaTeX 可选加载、async generation guard、文本 fallback；注入 worker 时的背压渲染、取消与主线程降级；主线程 `renderToString` 成功后 `setKaTeXCache` | 已实现 | 类型检查、异步过期、worker 优先渲染、清理待处理请求、inline/block enhancement 取消及可选依赖缺失回归、主线程成功写入 worker cache；Chromium 中真实 KaTeX DOM 和 `katexRenderer.worker` 请求通过 |
| `MermaidBlockNode.svelte` | `src/components/MermaidBlockNode.tsx` | 可选 loader、主题、SVG 净化、async generation guard、源文本 fallback、模式、复制、导出、全屏 modal、折叠和缩放控件，以及 gated `bindFunctions` 交互；主题 `svgCache`（progressive-miss 保留上一张 SVG）；流式状态可使用注入的 worker 选择可渲染前缀 | 已实现 | 类型检查、异步过期、Svelte 兼容预览高度默认值和 300ms 流式节流、工具栏 source/collapse/zoom 变换、fullscreen modal、bindFunctions opt-in、worker 前缀、流式不可解析更新保留缓存 SVG 回归，以及 Chromium 中真实 Mermaid SVG 与 parser worker 请求通过 |
| `D2BlockNode.svelte` | `src/components/D2BlockNode.tsx` | 可选 loader、compile/render、主题和深色 override、SVG 净化、async generation guard、源文本 fallback、模式切换、复制、导出和折叠控件，以及流式 progressive render 节流 | 已实现 | 类型检查、过期异步 D2 结果、渐进流式合并、深色 options、工具栏 source/collapse 及 SVG 尚未产出时源码 fallback 回归、Chromium 中真实 D2 SVG 输出通过。Svelte 源无 D2 pan/zoom，Solid 也不发明。 |
| `InfographicBlockNode.svelte` | `src/components/InfographicBlockNode.tsx` | 可选 loader、实例复用与销毁、async generation guard、源文本 fallback、模式、复制、导出、全屏、折叠和缩放控件，以及流式 progressive render 节流 | 已实现 | 类型检查、流式 source 更新实例复用和卸载 cleanup、渐进流式合并、Svelte 兼容预览高度默认值、工具栏 source/collapse/zoom 回归及 Chromium 中真实 Infographic SVG 输出通过 |

## 源文件清单

### 普通节点

`HtmlPreviewFrame.svelte`、`Tooltip.svelte`：已移植；Tooltip 定位与清理已回归验证，Chromium 已验证 HTML Preview iframe 与 source 内容。`MathBlockNode.svelte`、`MathInlineNode.svelte`：已实现 KaTeX 渲染、async fallback、注入 worker 时的背压渲染与取消，以及主线程 `renderToString` 成功后的 `setKaTeXCache`；Chromium 已验证实际 worker 注入，可选依赖缺失、inline/block enhancement 取消与 worker 清理均有回归。

`AdmonitionNode.svelte`、`BlockquoteNode.svelte`、`CheckboxNode.svelte`、`DefinitionListNode.svelte`、`EmojiNode.svelte`、`EmphasisNode.svelte`、`FallbackComponent.svelte`、`FootnoteAnchorNode.svelte`、`FootnoteNode.svelte`、`FootnoteReferenceNode.svelte`、`HardBreakNode.svelte`、`HeadingNode.svelte`、`HighlightNode.svelte`、`HtmlBlockNode.svelte`、`HtmlInlineNode.svelte`、`ImageNode.svelte`、`InlineCodeNode.svelte`、`InlineWrapNode.svelte`、`InsertNode.svelte`、`LinkNode.svelte`、`ListItemNode.svelte`、`ListNode.svelte`、`ParagraphNode.svelte`、`PreCodeNode.svelte`、`ReferenceNode.svelte`、`StrikethroughNode.svelte`、`StrongNode.svelte`、`SubscriptNode.svelte`、`SuperscriptNode.svelte`、`TableNode.svelte`、`ThematicBreakNode.svelte`、`VmrContainerNode.svelte`：已实现；除基础 Markdown 与 HTML 安全外，需 DOM 行为验证。

### 重节点和调度

`InfographicBlockNode.svelte`：已实现 loader、流式 source 更新时的实例复用、销毁、异步过期 guard、安全 SVG、错误回退、渐进式预览，以及 source/复制/导出/全屏/折叠/缩放工具栏。`MermaidBlockNode.svelte`：已实现 SVG 预览、安全净化、主题 `svgCache`、错误回退、异步过期 guard、受控 `bindFunctions` 交互和 source/复制/导出/全屏 modal/折叠/缩放工具栏；流式状态支持注入 worker 的完整语法验证与可渲染前缀回退，Chromium 已验证实际 parser worker 注入。`D2BlockNode.svelte`：已实现 compile/render、安全净化、主题和深色覆盖、异步过期 guard、source/复制/导出/折叠工具栏，以及流式渐进渲染节流；Svelte 源无 D2 pan/zoom。`CodeBlockNode.svelte`：已实现实例复用、single/diff 切换、异步过期 guard、卸载清理、复制/预览/展开/折叠/字体大小工具栏、流式语言前缀延迟，以及 runtime view API 的选区/滚动/tokenize/height sync。`NodeRenderer.svelte`：已实现批量调度、HTML 增强、`hasLoadingNodes` 门闩、typewriter cursor、代码实例 key 和资源释放；浏览器用例仍可扩展。`NodeOutlet.svelte` 与 `RenderChildren.svelte`：已实现；后者的 append、插入、删除和重排均有位置槽位 DOM 身份回归。

### 共享逻辑、HTML、工具与分发

`components/shared/diagram-height.ts`、`node-outlet-helpers.ts`、`render-window.ts`：已移植并导出；当前 Svelte 基线的主渲染器未接入 `render-window` 虚拟化，因此 Solid 保持相同行为。`rich-block-helpers.ts`、`renderNodeHtml.ts`、`i18n/useSafeI18n.ts`、`enhanceRenderedHtml.ts`、`renderMarkdownHtml.ts`、`parseNestedMarkdownToNodes.ts`、`sanitizeHtmlContent.ts`、`sanitizeSvg.ts`、`tooltip/singletonTooltip.ts`、`utils/languageIcon.ts`、`utils/normalizeKaTeXRenderInput.ts`：已移植，部分浏览器交互验证待补。

`types/codeBlock.ts`、`index.css`：已复制；`index.css`、`index.tailwind.css`、`index.px.css` 和 `tailwind` JS 子入口已构建并作为包子路径发布，已完成 packed consumer 安装与 Vite 构建验证。`index.ts`：已导出 Solid 组件、节点 props、代码块类型、工具、Worker 与 `SolidCodeBlockNode` 别名，构建和声明生成通过。`tailwind-entry.ts`：已移植。

### Optional loader 与 Worker

`optional/d2.ts`、`optional/infographic.ts`、`optional/katex.ts`、`optional/mermaid.ts` 与 KaTeX/Mermaid Worker 客户端、CDN helper、worker entrypoints：已移植；可选 peer 降级和 Worker 子路径已发布，KaTeX/Mermaid 实际 browser 注入回归通过。`optional/streamDiffs.ts` 已实现并接入 CodeBlockNode，真实 runtime 回归通过。

## 已知差异与下一批

- `CodeBlockNode` 已接入可选 runtime 的实例复用与单/差异视图切换；工具栏、预览、语言前缀收敛以及 runtime view API 的选区/滚动/tokenize/height sync 均已回归。
- HTML sanitize 与 enhancement 的 owner/dispose 模型已移植；实际 browser 中的增强取消与第三方 runtime 交互仍待验证。
- 后续可补充完整 HTML 字符串输出对照和更广泛的 NodeRenderer 浏览器用例。 Svelte 源无 D2 pan/zoom。
