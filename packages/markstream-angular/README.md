# markstream-angular — Angular streaming Markdown renderer for AI chat

Angular 20+ standalone component for streaming Markdown: AI chat, LLM token streams, SSE/WebSocket output, incomplete Markdown states, long documents, Mermaid, KaTeX, streaming code blocks, D2, infographic blocks, custom HTML tags, and cross-framework playground parity.

The coordinated 2.0 family beta will use `markstream-angular@next`. Before installing, verify that `npm view markstream-angular@next version` reports `0.1.0-beta.1`. It removes the former Monaco code-block API in favor of `stream-diffs`; read the [coordinated 2.0 family migration guide](https://markstream.simonhe.me/guide/migration-2-0) before upgrading.

```bash
pnpm add markstream-angular@next stream-diffs
```

Run this in an existing Angular 20+ application. Keep `@angular/core`, `@angular/common`, the compiler, and platform packages on the same Angular version line.

## When to use it

Use `markstream-angular` when Markdown streams from an LLM, SSE, or WebSocket into an Angular 20+ standalone app.
For short static Markdown, a completed-document Markdown renderer or a simpler parser is usually enough.

## Status

This package is currently alpha. Treat it as a streaming Markdown integration surface to evaluate in your Angular app, not as the most stable package in the Markstream family. Check npm and the [Angular guide](https://markstream.simonhe.me/guide/angular-quick-start) for the latest API maturity.

## Install

```bash
pnpm add markstream-angular
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

  props = {
    isDark: true,
    darkTheme: 'vitesse-dark',
    lightTheme: 'vitesse-light',
    themes: ['vitesse-dark', 'vitesse-light'],
    codeBlockOptions: {
      overflow: 'wrap',
      diffStyle: 'unified',
      enableLineSelection: true,
    },
    stream: true,
  }
}
```

Direct component state goes through the `props` input. Both direct `CodeBlockNode` props and top-level `MarkstreamAngularComponent` props accept `codeBlockOptions`; it covers host-managed typography/layout and supported File/FileDiff, interaction, annotation, and callback fields. `maxHeight` and the single symmetric `padding` value use numeric CSS pixels. Use `codeBlockProps` for header/toolbar controls. Theme values are registered names and `themes` is the `[dark, light]` pair. An old Monaco JSON theme is not accepted directly: first convert it to a Shiki `ThemeRegistration`, then call `registerCustomTheme(name, loader)` from `stream-diffs/pierre`; see the [coordinated 2.0 family migration guide](https://markstream.simonhe.me/guide/migration-2-0).

### Editing through `@ViewChild`

`CodeBlockNode` exposes the shared `CodeBlockNodeEditingApi` as public methods. Read the live instance through `@ViewChild`; `startEditing()` waits for the finalized surface and returns the upstream `stream-diffs` editor:

```ts
import type { CodeBlockNodeEditingApi } from 'markstream-angular'
import { Component, ViewChild } from '@angular/core'
import { CodeBlockNode } from 'markstream-angular'

@Component({
  selector: 'app-editable-code',
  standalone: true,
  imports: [CodeBlockNode],
  template: `<markstream-angular-code-block-node #codeBlock [node]="node" [props]="props" />`,
})
class EditableCodeComponent {
  @ViewChild('codeBlock') codeBlock!: CodeBlockNode

  async edit() {
    const api = this.codeBlock as CodeBlockNodeEditingApi
    const editor = await api.startEditing()
    // editor.getText(), api.getCode(), api.undo(), api.revealLine(...)
  }
}
```

`getCode()` returns the current resolved code, including active edits and completed edit sessions. To opt out of the accepting default, return `'reject'` from `codeBlockOptions.onEditComplete`; omitting the callback accepts completed edits.

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
