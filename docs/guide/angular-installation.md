---
title: Angular Installation
description: Install markstream-angular in Angular 20+ standalone apps, import CSS, and choose optional peers for Mermaid, KaTeX, stream-diffs enhanced code blocks, D2, Infographic, and workers.
keywords:
  - markstream-angular installation
  - Angular 20 Markdown renderer
  - Angular Mermaid Markdown
  - Angular KaTeX Markdown
  - Angular stream-diffs enhanced code block Markdown
---

# Angular Installation

Install `markstream-angular` into your Angular 20+ project.

```bash
pnpm add markstream-angular @angular/core @angular/common
```

## Required CSS

Import the renderer stylesheet once in your app entry:

```ts
import 'markstream-angular/index.css'
```

If you enable math rendering, also import:

```ts
import 'katex/dist/katex.min.css'
```

## Optional Peer Dependencies

Install only the heavy features you need:

| Feature | Package |
| --- | --- |
| Enhanced code blocks (recommended) | `stream-diffs` |
| Mermaid diagrams | `mermaid` |
| KaTeX math | `katex` |
| D2 diagrams | `@terrastruct/d2` |
| AntV infographic blocks | `@antv/infographic` |

Enhanced code blocks use the optional `stream-diffs` peer. When it is not installed, a plain `<pre>` is rendered instead. Code and diff options use `stream-diffs` built-in defaults, and theming is controlled through `theme` / `darkTheme` / `lightTheme` / `themes`.

Quick install:

```bash
pnpm add stream-diffs mermaid katex @terrastruct/d2 @antv/infographic
```

## Optional Workers

`markstream-angular` exports the same worker entry points used by the React / Vue integrations:

```ts
import { setKaTeXWorker, setMermaidWorker } from 'markstream-angular'
import KatexWorker from 'markstream-angular/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-angular/workers/mermaidParser.worker?worker'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
```

## Local Playground

Inside this monorepo, the Angular playground routes are:

- `/` for the main streaming demo
- `/test` for the regression lab
- `/test-sandbox` for isolated framework/version rendering

Run it locally with:

```bash
pnpm play:angular
```
