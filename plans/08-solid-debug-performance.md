# 08：实现 Solid `debugPerformance`

优先级：合并前。对照 React 实际代码，不是文档里那句「virtualization stats」。

## 问题与目标

`NodeRendererProps.debugPerformance` 已声明，CAPABILITY 写成 compatibility no-op。React / Svelte 主渲染器在 parse 时：

```ts
console.info('[markstream-react][perf] parse(sync)', {
  ms: Math.round(performance.now() - parseStart),
  nodes: result.length,
  contentLength: renderContent.length,
})
```

Svelte 前缀是 `[markstream-svelte][perf]`。React 源码 **只打这一条 parse 日志**；文档提到的 virtualization stats 并未实现。Solid 主渲染器同样没有虚拟化，不要编造窗口统计。

目标：`debugPerformance={true}` 时，在 `NodeRenderer` 解析（`resolveParsedNodes` / 等价路径）打出 `[markstream-solid][perf] parse(sync)`，字段与 React 一致：`ms`、`nodes`、`contentLength`。未开启时零日志。

## 工作队列

1. 在 `NodeRenderer` 里、调用 `resolveParsedNodes` 的 memo/计算处读取 `props.debugPerformance`。仅当值为真且 `console`、`performance` 都存在时计时。不要把日志埋进 `resolveParsedNodes` 本身，避免测试/HTML 工具路径误打。
2. `contentLength` 用本次实际拿去 parse 的字符串长度（smooth 开启时是 visible 文本，与 React 的 `renderContent` 一致）。`nodes` 模式仍打日志，`contentLength` 按 React 用当前 `renderContent.length`（可为空）。
3. 日志前缀固定 `[markstream-solid][perf]`，event 名 `parse(sync)`，不要用别的名字。
4. 测试：spy `console.info`。
   - 默认不调用。
   - `debugPerformance` 时至少一条，payload 含 `ms`（有限数字）、`nodes`、`contentLength`。
   - 长文档 / `content` 更新会再打，而不是只在 mount 打一次（跟随解析重算）。
5. 从 CAPABILITY「documented-not-wired」挪到已实现。注明 **只报告 parse**，不是虚拟化监视器；`viewportPriority` 等仍是 no-op。

## 验收与范围

打开开关能看到与 React 同结构的 parse 日志；关掉完全安静。不能为了日志改解析结果或强制重 parse。

`pnpm --filter markstream-solid typecheck/test`。不要接 performance monitor、不要实现虚拟化、不要在 SSR 无 `performance` 时抛错。
