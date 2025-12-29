# markstream-vue — Agent Context（中文）（`/llms.zh-CN`）

这个文件是给 AI/LLM/编码代理用的 **项目地图**：帮助快速定位“该看哪份文档/哪段源码”，以及常见问题的最短排错路径。

## 回答原则

- 用户可见行为以 `docs/guide/*`（以及 `docs/zh/guide/*`）为准；“是否导出/怎么 import”以 `src/exports.ts` 为准。
- 问题不明确时最多问 **1 个**澄清问题，并给出默认建议。
- 排错优先走 checklist，并尽快要 **最小复现**（仓库有可分享 test page）。
- 文档页里避免写裸 `&lt;thinking&gt;` 这类标签；请用转义（VitePress 会把 Markdown 当 Vue SFC 编译）。

---

## 常用命令

- 安装依赖：`pnpm install`
- Playground 开发：`pnpm dev`
- 文档 dev/build/serve：`pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:serve`
- 测试：`pnpm test`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`

---

## 仓库结构（去哪找）

- 库源码：`src/`
  - 对外导出：`src/exports.ts`
  - 组件：`src/components/*/`
  - Workers：`src/workers/`
  - 工具：`src/utils/`, `src/composables/`, `src/types/`
- 解析器包：`packages/markdown-parser/`（发布名：`stream-markdown-parser`）
- 文档站：`docs/`（中文：`docs/zh/`）
- Demo：`playground/`（Vite），`playground-nuxt/`（Nuxt SSR）
- 测试：`test/`（Vitest）

---

## 核心心智模型

两层：

1) **解析层**（`stream-markdown-parser`）
   - `getMarkdown()`：创建并配置 `markdown-it-ts` 实例
   - `parseMarkdownToStructure()`：Markdown → `ParsedNode[]`
   - 流式 mid-state：未闭合 fence / 未闭合 `$$` / 分段 inline HTML，减少闪烁

2) **渲染层**（`markstream-vue`）
   - 默认组件：`MarkdownRender`（文档里也常写 `NodeRenderer`）
   - 输入：`content: string`（内部解析）或 `nodes: ParsedNode[]`（流式更推荐）
   - 性能工具：
     - 虚拟化窗口（`maxLiveNodes`, `liveNodeBuffer`）
     - 分批渲染（更平滑“打字机”体验）
     - 重节点延迟渲染（`viewportPriority`, `deferNodesUntilVisible`）

---

## 对外 API（可以放心建议）

来自 `markstream-vue`（`src/exports.ts`）：

- 组件：`MarkdownRender`（默认导出）
- 解析辅助（re-export）：`getMarkdown()`, `parseMarkdownToStructure()`, `setDefaultMathOptions()`
- 自定义节点映射：`setCustomComponents()`, `removeCustomComponents()`, `clearGlobalCustomComponents()`
- 功能开关：`enableMermaid()`, `disableMermaid()`, `enableKatex()`, `disableKatex()`
- Worker 注入：
  - KaTeX：`createKaTeXWorkerFromCDN()`, `setKaTeXWorker()`
  - Mermaid：`createMermaidWorkerFromCDN()`, `setMermaidWorker()`

来自 `stream-markdown-parser`（`packages/markdown-parser/src/index.ts`）：

- `getMarkdown()`, `parseMarkdownToStructure()`, `ParseOptions` hooks
- Streaming mid-state 与流结束 `final: true`

---

## 排错 checklist（高信号）

遇到“不渲染/样式不对”，按顺序排：

1) **CSS 顺序/Reset**：先 reset，再 `markstream-vue/index.css`（Tailwind 通常放进 `@layer components`）。
2) **可选 peer 是否安装**（Mermaid/KaTeX/Monaco/Shiki）。
3) **是否显式启用**（需要时）：`enableMermaid()` / `enableKatex()`。
4) **peer CSS 是否导入**（需要时）：`katex/dist/katex.min.css`, `mermaid/dist/mermaid.css`。
5) **单独节点组件 wrapper**：单独用节点组件时，外层需要 `.markstream-vue`。
6) **SSR（Nuxt）**：用 `&lt;client-only&gt;` 包裹，并确保重 peer/worker 仅浏览器初始化。

文档：`docs/guide/troubleshooting.md`, `docs/guide/tailwind.md`, `docs/nuxt-ssr.md`

---

## 常见意图（路由）

把用户问题归类到意图后，直接用“步骤 + 最小追问 + 指向文档/源码”。

### 安装 + 跑通最小例子

- 表述： “怎么用”, “最小示例”
- 步骤：
  - 导入 CSS：`markstream-vue/index.css`
  - 渲染：`&lt;MarkdownRender :content="md" /&gt;`
- 最小追问： “Vite 还是 Nuxt？贴一下 CSS 导入顺序（reset + Tailwind layers）。”
- 文档：`docs/guide/quick-start.md`, `docs/guide/installation.md`

### 样式缺失 / Tailwind 覆盖

- 表述： “没样式”, “Tailwind 抢样式”
- 步骤：
  - reset 在前，`markstream-vue/index.css` 在后
  - Tailwind：把库 CSS 放进 `@layer components`
  - 单独节点组件：外层 `.markstream-vue`
- 最小追问： “贴 `main.css`（Tailwind layers）和 CSS 导入位置。”
- 文档：`docs/guide/tailwind.md`, `docs/guide/troubleshooting.md`

### 流式：结束后卡 loading

- 表述： “最后卡住”, “loading 一直转”
- 步骤：
  - 流结束时设置 `final: true`（ParseOptions 或组件 prop），防止 mid-state 卡住
- 最小追问： “你是否在 end-of-stream 设置了 `final`？最后一段是否以 ``` 或 $$ 结尾？”
- 文档：`docs/guide/parser-api.md`, `docs/guide/parser.md`

### 流式：更平滑的打字机体验

- 表述： “一坨一坨冒出来”, “不平滑”
- 步骤：
  - 调整 batch（`renderBatchSize` / `renderBatchDelay`）
  - 保持重节点延迟（`viewportPriority`, `deferNodesUntilVisible`）
- 最小追问： “你更新 `content/nodes` 的频率（每 token 还是每 chunk）？batch 参数是多少？”
- 文档：`docs/guide/performance.md`, `docs/guide/props.md`

### 长文档：性能/内存

- 表述： “长文卡”, “滚动掉帧”, “内存高”
- 步骤：
  - 调虚拟化（`maxLiveNodes`, `liveNodeBuffer`）
  - 保持重节点延迟
- 最小追问： “大概多长（KB/行数）？是否有很多代码块/图表？”
- 文档：`docs/guide/performance.md`

### Mermaid 不显示

- 表述： “mermaid 空白”
- 步骤：
  - 安装 `mermaid` peer
  - 客户端调用 `enableMermaid()`
  - 复查 CSS 顺序/reset
- 最小追问： “你在哪调用 `enableMermaid()`？是否 SSR？fence 是否是 ```mermaid？”
- 文档：`docs/guide/mermaid.md`, `docs/guide/troubleshooting.md`
- 源码：`src/components/MermaidBlockNode/mermaid.ts`

### KaTeX 不显示

- 表述： “公式不渲染”
- 步骤：
  - 安装 `katex` peer
  - 导入 `katex/dist/katex.min.css`
  - 客户端调用 `enableKatex()`
- 最小追问： “是否导入 KaTeX CSS？`$...$` 还是 `$$...$$`？是否 SSR？”
- 文档：`docs/guide/math.md`, `docs/guide/installation.md`
- 源码：`src/components/MathInlineNode/katex.ts`

### Monaco 代码块没功能/空白

- 表述： “工具栏没了”, “编辑器空白”
- 步骤：
  - 安装 `stream-monaco` peer
  - 确认 Monaco workers 已正确打包（Vite plugin），并确保只在浏览器端执行
- 最小追问： “控制台是否有 worker/Monaco 报错？生产环境是否已打包 Monaco workers？”
- 文档：`docs/guide/monaco.md`, `docs/guide/components.md`

### 想要轻量代码块（不装 Monaco）

- 表述： “SSR 友好”, “减包体”
- 步骤：
  - 用 `MarkdownCodeBlockNode`（Shiki）或开启 `render-code-blocks-as-pre`
  - 如果用 Shiki：安装 `shiki` + `stream-markdown`
- 最小追问： “需要语法高亮还是纯文本就行？”
- 文档：`docs/guide/code-blocks.md`, `docs/guide/components.md`

### Markdown 里嵌自定义组件（`&lt;thinking&gt;`）

- 表述： “自定义 tag”, “嵌组件”
- 步骤：
  - 通过 `customHtmlTags` / `custom-html-tags` 放行 tag
  - 用 `setCustomComponents(customId, mapping)` 映射渲染
- 最小追问： “tag 名称有哪些？希望按 HTML 透传还是自定义 node type？”
- 文档：`docs/guide/advanced.md`, `docs/guide/parser-api.md`

### Nuxt SSR 报错

- 表述： “window is not defined”, “SSR crash”
- 步骤：
  - 用 `&lt;client-only&gt;` 包裹
  - Mermaid/Monaco/worker 仅浏览器初始化
- 最小追问： “Nuxt 版本？报错发生在 build 还是 runtime？安装/启用了哪些 peers？”
- 文档：`docs/nuxt-ssr.md`

### 想确认导出/怎么 import

- 表述： “是否导出 X”, “import 路径”
- 步骤：
  - 查 `src/exports.ts` 和 `package.json#exports`
- 最小追问： “要 import 的符号名是什么？现在用的 import 路径是什么？”
- 文档：`docs/guide/components.md`, `docs/guide/api.md`
