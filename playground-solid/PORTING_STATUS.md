# Solid playground 移植台账

历史台账。当前能力见 [`packages/markstream-solid/CAPABILITY.md`](../packages/markstream-solid/CAPABILITY.md)。

开始于 2026-09-10。基线 React 18 `playground-react18/` at git `1f51247e`，自动滚动行为来自 `f808226c`。

下面的“已验证”是 2026-09-10 迁移台账状态，不是当前 CI 证明。当前重跑入口见 [`CAPABILITY.md`](../packages/markstream-solid/CAPABILITY.md)。包内更早的 playground “通过”行（写于 git `1f51247e`、当时还没有 `playground-solid/` 源码）仍是 **historical / unreproducible**。

## 页面 / 按钮 / 设置 / 样例

| 来源 | 目标 | 资源所有权 | 状态 |
| --- | --- | --- | --- |
| `App.tsx` 路由 `/` `/test` `/migration-demo` `/line-number-handoff-check`、popstate、深链接 | `src/App.tsx` | path signal；pushState / popstate `onCleanup` | 已验证 |
| 首页聊天表面、Settings、主题、Dark Mode | `src/pages/HomePage.tsx` | localStorage keys 与 React 18 相同 | 已验证 |
| Start / Pause / Resume / Stop / Reset | Home `data-stream-controls` | `useStreamSimulator` timer/AbortController | 已验证 |
| 预设 balanced / sse / websocket / proxy-buffered / weak-mobile / custom | `src/shared/streamPresets.ts` | 纯数据 | 已验证 |
| slice `pure-random` / `boundary-aware`；transport `scheduler` / `readable-stream` | `streamMath.ts` + `useStreamSimulator.ts` | optionsRef；中途改设置不杀当前流 | 已验证 |
| RNG 注入 | `StreamSimulatorOptions.random` | 测试注入 `() => 0` | 已验证 |
| 自动滚动贴底 / 上滚退出 / 回底恢复 / 高度增长 | `useChatAutoScroll.ts` | rAF + ResizeObserver，owner detach | 已验证 |
| ThinkingNode 嵌套 Markdown | `src/components/ThinkingNode.tsx` | App 注册 `playground-demo`；scoped demo 自有 id | 已验证 |
| Test Lab 样例 baseline / thinking / diff / stress、粘贴、全屏、主题、URL/hash、preview | `src/pages/TestLab.tsx` | 复用 `playground-shared` | 已验证 |
| 共享 fixture Solid 登记，无编造公网 origin | `playground-shared/testLabFixtures.ts` `id: 'solid'`, `origin: ''`, `localPort: 4177` | 纯数据 | 已验证 |
| `/line-number-handoff-check` 原输入；不宣称异步交接 | `LineNumberHandoffCheck.tsx` | 静态对照 | 已验证 |
| `/migration-demo` Solid 接入；react-markdown 标 React-only | `MigrationDemoPage.tsx` + `src/examples/*` | 类型检查示例 | 已验证 |
| 默认混合流 | demo `mixed` + `markdown.ts` | 首页 onMount start | 已验证 |
| 平滑 / typewriter / fade；传输完成 ≠ 显示追平 | demo `smooth` | renderer `smoothStreaming` | 已验证 |
| `useSmoothMarkdownStream` enqueue/pause/resume/finish/flush/reset | `ControllerDemo.tsx` | 外部 controller，renderer 关闭重复平滑 | 已验证 |
| 代码块普通追加保留 DOM shell | demo `code-identity` + 单测 | CodeBlockNode 身份 | 已验证 |
| 两个 renderer + ThinkingNode 隔离，卸载清理 | `ScopedRenderersDemo.tsx` | 左右栏 `customComponents` prop | 已验证 |
| Mermaid / D2 / Infographic / KaTeX | demo `diagrams` | App worker owner | 已验证 |
| 批量渲染（非虚拟列表） | demo `batch` | NodeRenderer `batchRendering` | 已验证 |
| 观察面板 | `ObservationPanel.tsx` | resourceTracker 计数 | 已验证 |
| SSR/hydration fixture | `src/hydration/*` + `hydration:generate` | `generateHydrationScript` + 同组件 hydrate | 已验证 |
| 缺 peer 降级 | `fixtures/missing-peer/render.mjs` + packed smoke | 真实缺 peer 看 `pnpm test:smoke:solid`；in-process `disable*()` 不是缺 peer 证明 | 已实现；以 packed smoke 为准 |

## React 19

复用 React 18 shared 模块，无额外产品能力。`memo` / `startTransition` / StrictMode 不搬。

## 已知框架差异

- Solid 没有 React `memo`；NodeRenderer 按节点身份稳定更新，不需要包一层 memo。
- `render-window` 未接入主 renderer，不展示为虚拟化。
- SSE/WebSocket 仅为节奏预设，没有网络服务。
