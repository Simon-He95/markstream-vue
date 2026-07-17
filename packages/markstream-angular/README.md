# markstream-angular — Angular streaming Markdown renderer for AI chat

Angular 20+ standalone component for streaming Markdown: AI chat, LLM token streams, SSE/WebSocket output, incomplete Markdown states, long documents, Mermaid, KaTeX, Monaco code blocks, D2, infographic blocks, custom HTML tags, and cross-framework playground parity.

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

- `stream-diffs` for enhanced File/FileDiff and code blocks
- `stream-monaco` as the Monaco runtime fallback
- `mermaid` for Mermaid diagrams
- `katex` for math rendering
- `@terrastruct/d2` for D2 diagrams
- `@antv/infographic` for infographic blocks

Install only the peers your output actually needs. Plain Markdown does not require Mermaid, KaTeX, Diffs, Monaco, D2, or Infographic.

Example:

```bash
pnpm add stream-diffs mermaid katex @terrastruct/d2 @antv/infographic
```

Angular keeps the stable `<pre>` while a fence is incomplete or offscreen. After completion and visibility, it creates one final File/FileDiff surface in a staging layer and swaps only after the first stable frame. Pending creation is invalidated on destroy, collapse, or code-block identity change.

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
  CodeBlockMonacoOptions,
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
