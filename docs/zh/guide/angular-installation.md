---
title: Angular 安装
description: 在 Angular 20+ standalone 应用中安装 markstream-angular，导入 CSS，并按需选择 `stream-diffs` 增强代码块、Mermaid、KaTeX、D2、Infographic 和 worker。
keywords:
  - markstream-angular 安装
  - Angular 20 Markdown 渲染器
  - Angular Mermaid Markdown
  - Angular KaTeX Markdown
  - Angular stream-diffs 增强代码块
---

# Angular 安装

在你的 Angular 20+ 项目中安装 `markstream-angular`。

```bash
pnpm add markstream-angular @angular/core @angular/common
```

## 必需样式

在应用入口中导入一次渲染器样式：

```ts
import 'markstream-angular/index.css'
```

如果启用了数学公式渲染，还需要：

```ts
import 'katex/dist/katex.min.css'
```

## 可选对等依赖

只安装你需要的重功能：

| 功能 | 包 |
| --- | --- |
| 增强代码块（推荐） | `stream-diffs` |
| Mermaid 图表 | `mermaid` |
| KaTeX 数学公式 | `katex` |
| D2 图表 | `@terrastruct/d2` |
| AntV infographic block | `@antv/infographic` |

增强代码块使用可选的对等依赖 `stream-diffs`。未安装时会回退渲染普通 `<pre>`。代码与 diff 选项使用 `stream-diffs` 内置默认值，主题通过 `theme` / `darkTheme` / `lightTheme` / `themes` 控制。

一次性安装：

```bash
pnpm add stream-diffs mermaid katex @terrastruct/d2 @antv/infographic
```

## 可选 Worker

`markstream-angular` 也导出了和 React / Vue 集成一致的 Worker 入口：

```ts
import { setKaTeXWorker, setMermaidWorker } from 'markstream-angular'
import KatexWorker from 'markstream-angular/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-angular/workers/mermaidParser.worker?worker'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
```

## 本地 Playground

在这个 monorepo 里，Angular playground 有这些路由：

- `/` 主 streaming demo
- `/test` 回归实验室
- `/test-sandbox` 独立 framework/version 对照页

本地运行：

```bash
pnpm play:angular
```
