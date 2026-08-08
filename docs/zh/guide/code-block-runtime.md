# 代码块 Runtime

本页说明 `CodeBlockNode` 使用的可选 `stream-diffs` runtime。2.0 移除了旧的 Monaco 选项 API 与 `stream-monaco` 回退：`stream-diffs` 是唯一增强型代码块 surface，代码与 diff 行为使用其内置默认值。

## 安装

```bash
pnpm add stream-diffs
```

不需要 worker plugin，也不需要额外导入包专用 CSS。

如果未安装 `stream-diffs`，loader 会保留 `<pre>` 回退，以纯文本形式渲染代码块，不启用增强 surface。

## Runtime 职责边界

```text
markstream-vue                         stream-diffs
---------------                        ------------
CodeBlockNode                          controller + DOM surface
  - Vue props / unmount                  - HTMLElement target
  - 流式结束判断                         - code 或 diff 数据
  - 可视区域判断                         - File / FileDiff 渲染
  - 标题和工具栏                         - syntax highlighting
```

`stream-diffs` 根入口与框架无关：它不导入 Vue，也不拥有 Vue lifecycle。包内另有 `stream-diffs/vue` 这个可选便捷入口，供直接使用 Vue 的业务接入；`markstream-vue` 当前不使用该入口。

## CodeBlockNode 切换流程

`CodeBlockNode` 只有一条稳定的视觉路径：

1. code 正在流式输出时，Vue 渲染 `PreCodeNode`。
2. code 结束且进入可视区域后，组件动态加载 `stream-diffs` 根 runtime，并在既有容器中挂载一个 File 或 FileDiff surface。
3. 组件把当前 theme 应用到 surface；surface ready 后才移除临时 `<pre>`。
4. 组件卸载时，由 Vue 适配层 dispose controller。

结束态、可见性与卸载都是 `CodeBlockNode` 的职责，并不是 `stream-diffs` 的生命周期 hook。

`CodeBlockShell` 负责标题和操作栏。创建 File surface 时会关闭内部 `data-diffs-header`，DOM 始终只有一个 header。

## 主题

明暗主题请使用 `theme` / `darkTheme` / `lightTheme` / `themes` props。`CodeBlockNode` 会把主题变化传给已挂载的 surface，不会重建 Vue 组件。

2.0 已移除 `monacoOptions` / `codeBlockMonacoOptions` props，且无替代方案；代码与 diff 选项回退到 `stream-diffs` 内置默认值。

## 可选预热

如果路由确定会出现已经完成且位于可视区域的代码块，可以在空闲时预热 module：

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

这个调用只预热可选 module；不会创建 surface、不会完成仍在流式输出的代码块，也不会绕过结束态和可见性 gate。

## Diff 交互

diff block 使用相同的适配边界。增强 diff surface（折叠、未变化区域处理、inline/side-by-side 布局）由 `stream-diffs` 内置默认值驱动；2.0 不再提供按代码块配置的 diff options prop。
