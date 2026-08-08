# markstream-angular — Angular streaming Markdown renderer for AI chat

Angular 20+ standalone component for streaming Markdown: AI chat, LLM token streams, SSE/WebSocket output, incomplete Markdown states, long documents, Mermaid, KaTeX, streaming code blocks, D2, infographic blocks, custom HTML tags, and cross-framework playground parity.

## When to use it

Use `markstream-angular` when Markdown streams from an LLM, SSE, or WebSocket into an Angular 20+ standalone app.
For short static Markdown, a completed-document Markdown renderer or a simpler parser is usually enough.

## Status

This package is currently alpha. Treat it as a streaming Markdown integration surface to evaluate in your Angular app, not as the most stable package in the Markstream family. Check npm and the [Angular guide](https://markstream.simonhe.me/guide/angular-quick-start) for the latest API maturity.

## Install

```bash
pnpm add markstream-angular @angular/core @angular/common
```

Optional peer dependencies:

- `stream-diffs` for enhanced / streaming code blocks
- `mermaid` for Mermaid diagrams
- `katex` for math rendering
- `@terrastruct/d2` for D2 diagrams
- `@antv/infographic` for infographic blocks

Install only the peers your output actually needs. Plain Markdown does not require Mermaid, KaTeX, stream-diffs enhanced code blocks, D2, or Infographic.

Example:

```bash
pnpm add stream-diffs mermaid katex @terrastruct/d2 @antv/infographic
```

## Enhanced Code Blocks

Code blocks use `stream-diffs` for enhanced / streaming rendering, with a plain `<pre>` fallback when it is not installed. Inside `MarkstreamAngularComponent`, code blocks resolve to this runtime automatically; you can also mount the standalone `markstream-angular-code-block-node` component directly:

```ts
import { Component, signal } from '@angular/core'
import { CodeBlockNode } from 'markstream-angular'

@Component({
  selector: 'app-code-block',
  standalone: true,
  imports: [CodeBlockNode],
  template: `
    <markstream-angular-code-block-node [node]="node" [props]="props" />
  `,
})
class CodeBlockComponent {
  node = {
    type: 'code_block',
    language: 'ts',
    code: 'const answer = 42',
    raw: 'const answer = 42',
  }

  // fontSize / lineHeight / tabSize also drive the streaming <pre> fallback so
  // the enhanced surface swaps in without a visual jump.
  props = {
    isDark: true,
    showLineNumbers: true,
    fontSize: 14,
    lineHeight: 21,
    tabSize: 4,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    wordWrap: 'off',
    darkTheme: 'vitesse-dark',
    MAX_HEIGHT: 640,
  }
}
```

Component options go through the `props` input: `isDark`, `showLineNumbers`, `darkTheme` / `lightTheme`, `loading`, `stream`. Diff blocks are driven by the stream-diffs adapter options (`renderSideBySide`, `diffHunkActionsOnHover`, `onDiffHunkAction`).

## Quick Start

Import the stylesheet once in your Angular app entry:

```ts
import 'markstream-angular/index.css'
import 'katex/dist/katex.min.css'
```

Use the standalone component directly:

```ts
import { Component, signal } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { MarkstreamAngularComponent } from 'markstream-angular'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: `
    <markstream-angular
      [content]="markdown()"
      [final]="true"
      [codeBlockStream]="true"
    />
  `,
})
class AppComponent {
  readonly markdown = signal(`# Hello Angular

- streaming markdown
- code blocks
- Mermaid / KaTeX / D2`)
}

bootstrapApplication(AppComponent)
```

## TypeScript

`markstream-angular` exports the same public props/context helpers you use at runtime:

```ts
import type {
  AngularRenderContext,
  CustomComponentMap,
  MarkstreamAngularComponentProps,
  NodeRendererProps,
} from 'markstream-angular'
```

## Workers

KaTeX and Mermaid can use the same off-thread worker path as the React/Vue packages:

```ts
import { setKaTeXWorker, setMermaidWorker } from 'markstream-angular'
import KatexWorker from 'markstream-angular/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-angular/workers/mermaidParser.worker?worker'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
```

## Playground

In this monorepo:

- Angular playground: `pnpm play:angular`
- Angular regression lab: `http://127.0.0.1:4175/test`
- Angular version sandbox: `http://127.0.0.1:4175/test-sandbox`

Current development is aligned with `markstream-react` / `markstream-vue2` for:

- node-component renderer structure
- streaming code block behavior
- shared `/test` fixtures and cross-framework comparison
- KaTeX / Mermaid worker integration

Issue tracker and source: [Simon-He95/markstream-vue](https://github.com/Simon-He95/markstream-vue)
