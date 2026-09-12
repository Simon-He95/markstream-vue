# 06：去掉 Solid scoped `setCustomComponents`

优先级：合并前。公开形状跟 React，不搬 React 独有的 `streamingComponents` / `htmlComponents`。

## 问题与目标

React 文档把 `setCustomComponents(customId, mapping)` 标成兼容/共享注册，推荐的隔离方式是 **renderer 本地组件表**。Solid 现在同时有：

- 全局 `setCustomComponents(mapping)`
- scoped `setCustomComponents(id, mapping)` + `removeCustomComponents(id)` + `getCustomNodeComponents(customId)`
- renderer 的 `customComponents` prop

后两者重叠，且 playground 把隔离建立在 `customId` 注册表上，和 React 的推荐用法不一致。

目标：Solid **删除 scoped 注册表**。隔离只走 `MarkdownRender` / `NodeRenderer` 的 `customComponents` prop。全局注册只保留一份，给全应用共享覆盖。

`customId` prop **保留**，用途与 React 相同：parser cache、实例身份、`data-custom-id`。它不再是组件注册的命名空间。

## React 对照（只作接口取舍，不抄 React 独有 API）

| React | Solid 本次 |
| --- | --- |
| renderer-local `streamingComponents` / `htmlComponents` | 不新增。Solid 没有这套 HTML/parser 双轨 API |
| renderer-local 隔离 | 已有 `customComponents` prop，作为唯一隔离入口 |
| `setCustomComponents(mapping)` 全局 | 保留 |
| `setCustomComponents(id, mapping)` / `removeCustomComponents(id)` | **删除** |
| `customId` | 保留为实例/缓存 id，不再查注册表 |

包尚未发布，允许去掉 scoped 公开签名。不要为了兼容伪造一个仍按 `customId` 查表的空实现。

## 工作队列

1. `customComponents.ts` 只保留全局 store（现在的 `__global__` 槽）。`setCustomComponents` 只接受 `CustomComponentMap`。`getCustomNodeComponents()` 不再接收 `customId`，只返回全局表。删除 `removeCustomComponents`。保留 `clearGlobalCustomComponents`、`subscribeCustomComponents`、`getCustomComponentsRevision`。
2. 运行时若仍传入字符串 id（JS 调用），抛错，不要静默写进某个 key。类型上删除两参数 overload。
3. `NodeOutlet` 解析顺序改为：`{ ...getCustomNodeComponents(), ...props.context?.customComponents }`，renderer 本地覆盖全局。不要再 `customComponents || getCustomNodeComponents(customId)` 二选一。
4. `index.ts` 停止导出 `removeCustomComponents`。`exports-classification` / type-consumer 如引用则改掉。
5. 包测试：保留全局注册、卸载退订、renderer `customComponents` 覆盖全局。新增：两个 renderer 各传不同 `customComponents` 互不影响；卸载一侧不影响另一侧；`customId` 不同但未传 `customComponents` 时共享全局表。删除或改写任何 `setCustomComponents('scope', …)` 用例。
6. Playground：`App.tsx` 改为给各 `NodeRenderer` 传 `customComponents={{ thinking: ThinkingNode }}`，去掉 `setCustomComponents(PLAYGROUND_CUSTOM_ID, …)` 和 `onCleanup(removeCustomComponents)`。`ScopedRenderersDemo` 左右栏用不同 `customComponents` prop，卸载右栏不再调用 `removeCustomComponents`。`examples/custom-components-usage.tsx`、migration 文案、`PORTING.md`、README、`CAPABILITY.md` 同步。
7. `playground-solid/test/scoped-components.test.tsx` 改为 prop 隔离，不再 import `removeCustomComponents`。

## 验收与范围

- 公开 API 无法用 `customId` 注册或注销组件表。
- 两个并排 renderer 靠 `customComponents` prop 隔离；卸载其中一个不改另一个的映射。
- 全局 `setCustomComponents` 仍能覆盖未传本地表的 renderer，且本地表优先。
- `customId` 仍可用于 cache key，但相同全局映射下换 `customId` 不改变用哪个组件。
- `pnpm --filter markstream-solid typecheck/test` 和 `pnpm --filter markstream-solid-playground typecheck/test` 通过。

只改 Solid 包、playground、相关测试和说明。不改 Vue/Svelte/React 注册表，不引入 `streamingComponents`。
