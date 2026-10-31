---
title: Playground 示例
description: 使用本地和在线 playground 快速复现 markstream-vue 渲染问题、对比框架接入，并验证修复结果。
keywords:
  - Playground
  - 示例演示
  - 本地调试
---

# Playground（示例演示）

仓库包含一个可交互的 `playground` 演示，用于本地调试和复现渲染问题。

## 在线演示

- Vue 3: https://markstream-vue.simonhe.me/
- React: https://markstream-react.pages.dev/
- Solid: https://markstream-solid.pages.dev/
- React migration demo: https://markstream-react.pages.dev/migration-demo
- Nuxt: https://markstream-nuxt.pages.dev/
- Vue 2: https://markstream-vue2.pages.dev/

## 本地运行

运行演示：

```bash
pnpm install
pnpm play
# 打开终端中显示的网址（通常为 http://localhost:5173）
```

在演示中你可以尝试：

- 实时流式 Markdown 输入
- 渐进式 Mermaid
- 自定义组件映射
- stream-diffs 增强代码块集成示例

可直接打开的示例页面：

- `https://markstream-react.pages.dev/migration-demo`：面向 `react-markdown` 用户的 before / after 迁移演示

## Solid playground {#solid-playground}

打开 [线上 Solid playground](https://markstream-solid.pages.dev/)。源码位于 `playground-solid`，也可以在仓库根目录运行：

```bash
pnpm install
pnpm play:solid
# http://localhost:4178
```

支持 Controls、TPS／随机分片、主题、暂停／继续、源码编辑、全量恢复、长文档、HTML/SVG 与图表示例。`/line-number-handoff-check` 验证 pre → highlight 交接。

- [Solid 接入指南](/zh/guide/solid)
- [playground-solid source](https://github.com/Simon-He95/markstream-vue/tree/main/playground-solid)
