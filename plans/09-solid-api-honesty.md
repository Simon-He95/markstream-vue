# 09：按用户点名收口 Solid 公开 API

优先级：合并前。只做下面清单。`renderWindow` 由用户自己删（原条目 2）。不做 footnote tooltip、globalThis store、单行 JSX 展开、`useMonaco` 兼容别名、过程文档、Vue print timeout。

对照：Svelte 行为基线，React 的 `setCustomComponents` 两参数形状。包尚未发布，允许删导出。

## 做

### 1. 从主渲染器 props 删掉空操作虚拟化字段

从 `NodeRendererProps` / 文档 / 测试去掉 `viewportPriority`、`deferNodesUntilVisible`、`liveNodeBuffer`。主渲染器本来就不读它们。

保留 `maxLiveNodes`：它实际控制 `smoothStreaming="auto"` 是否开启，不是空 props。

`renderWindow.ts` 和 `export * from './renderWindow'` 本计划不删，等用户自己处理条目 2。

### 3. `resetCodeBlockRuntimeReadyForTest` 退出公开入口

从 `src/index.ts` 去掉该导出。函数可以留在 `optional-streamDiffs.ts`，测试改从该模块 import。Svelte 仍导出它；Solid 按这次要求不再公开。

### 5. 加回 scoped `setCustomComponents`

恢复 React/Svelte 形状：

- `setCustomComponents(mapping)` 全局
- `setCustomComponents(id, mapping)` scoped
- `removeCustomComponents(id)`
- `getCustomNodeComponents(customId?)` = 全局再叠 scoped

`NodeOutlet` 合并顺序：`{ ...getCustomNodeComponents(context.customId), ...context.customComponents }`。本地 prop 覆盖注册表。

Playground 隔离 demo **继续用** renderer `customComponents` prop（推荐用法），不必改回 `setCustomComponents(id)`。补回两参数 API 的包测试：scoped 生效、remove 后不再命中、本地 prop 仍能盖过 scoped。

撤销「两参数 JS 调用抛错」。

### 6. 工具栏走已有 i18n

有必要：Svelte 代码块/图表按钮用 `t('common.copy')` 等，Solid 已公开 `setDefaultI18nMap`，代码块和 D2 部分按钮仍写死英文。换 map 时图表和代码块会不一致。

`CodeBlockNode`、`D2BlockNode` 未走 `t()` 的 Copy/Expand/Preview 等改成 `useSafeI18n`。不新做翻译文件，不扩到 footnote。

### 8. 按 Svelte 入口收公开面

`index.ts` 只保留 Svelte 也公开的那一类：组件、`MarkdownRender`、smooth、自定义组件注册、optional loaders、HTML/sanitize、parse/render markdown 字符串、language icon、Worker、`buildRenderContext` / `resolveParsedNodes`、`enhanceRenderedHtml`。

从入口拿掉（模块文件可留着给包内用）：

- `export * from './diagramHeight'`
- `export * from './nodeOutletHelpers'`
- `renderNodeHtml` / `renderNodesHtml`
- `clampNumber` / `clearElement` / `copyTextToClipboard` / `downloadSvgMarkup` / `resolveCssSize` / `setElementHtml`
- `hideTooltip` / `isTooltipVisible` / `showTooltipForAnchor`
- `disableStreamDiffs` / `enableStreamDiffs` / `setStreamDiffsLoader`（Svelte 入口也没有）
- `isLikelyIncompleteLanguageIdentifier` / `resolveHighlighterLanguage`（Svelte 入口没有）
- `resetCodeBlockRuntimeReadyForTest`（见上）

`export * from './renderWindow'` 不在本计划删。测试和 playground 若从包根 import 了被删符号，改为从相对模块 import，或不再依赖。

### 观察面板

不改语义。执行时跑 `pnpm --filter markstream-solid-playground test`，确认 observation 用例仍过：计数响应式、pause ≠ complete、stop-reveal ≠ catch-up、未覆盖项是 `uncovered`。

## 验收

- 给 `MarkdownRender` 传 `viewportPriority` / `deferNodesUntilVisible` / `liveNodeBuffer` 在类型上不合法。
- 从 `markstream-solid` 根 import 不到 `resetCodeBlockRuntimeReadyForTest`。
- `setCustomComponents('id', map)` 与 `removeCustomComponents('id')` 可用；renderer `customComponents` 仍隔离。
- `setDefaultI18nMap({ 'common.copy': '复制' })` 后代码块 Copy 按钮 `aria-label` 为「复制」。
- 入口不再导出上面列出的内部 helper。
- `pnpm --filter markstream-solid typecheck/test` 和 `pnpm --filter markstream-solid-playground typecheck/test` 通过。
- 更新 `CAPABILITY.md`、包 README、`exports-classification` 测试。

## 不做

用户自删 `renderWindow`；footnote tooltip；globalThis；展开 `Nodes.tsx`；动 `useMonaco`；过程文档；Vue print timeout；发布元数据。
