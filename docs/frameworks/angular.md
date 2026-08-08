---
title: 'Angular streaming Markdown renderer for AI chat'
description: Use markstream-angular, an Angular 20+ standalone alpha renderer, for AI chat streaming Markdown, LLM token streams, SSE/WebSocket output, incomplete Markdown states, Mermaid, KaTeX, and long documents.
keywords:
  - markstream-angular
  - Angular streaming Markdown renderer
  - Angular AI chat Markdown
  - Angular LLM Markdown renderer
  - Angular SSE Markdown
  - Angular WebSocket Markdown
  - Angular incomplete Markdown
  - Angular Mermaid Markdown
  - Angular KaTeX Markdown
  - ngx-markdown alternative
  - Angular standalone Markdown
  - Angular 20 Markdown renderer
softwareName: markstream-angular
softwarePackage: markstream-angular
npmPackage: markstream-angular
softwareFramework: Angular
softwareProgrammingLanguage:
  - TypeScript
  - Angular
softwareRuntimePlatform:
  - Angular
  - Angular standalone components
faq:
  - question: Does markstream-angular require Angular 20?
    answer: Yes. The package targets Angular 20+ standalone components.
  - question: Is markstream-angular stable?
    answer: No. markstream-angular is currently alpha, so check the package documentation before using it in production.
  - question: Should I use markstream-angular instead of ngx-markdown?
    answer: Use markstream-angular when you specifically need Angular streaming Markdown mid-state rendering. For short static or completed Markdown, a mature completed-document renderer may be a better fit.
  - question: Do I need to pre-parse nodes for Angular SSE output?
    answer: No. Start by passing the accumulating content string and final state. Use nodes only when another layer already owns parsing or AST transforms.
  - question: Does markstream-angular use innerHTML for Markdown output?
    answer: The renderer is component-based and is designed to avoid dumping untrusted Markdown as raw innerHTML.
---
# Angular streaming Markdown renderer for AI chat

`markstream-angular` provides an Angular 20+ standalone component for streamed Markdown surfaces such as AI chat, SSE output, WebSocket output, incomplete Markdown states, long documents, Mermaid, KaTeX, and streaming code blocks. It is currently the alpha renderer in the Markstream family, so evaluate it against your production requirements before rollout.

## When to use markstream-angular

Use `markstream-angular` when:

- Content streams from an LLM, SSE, or WebSocket into an Angular standalone app
- You want to pass an accumulating `content` string while the response is still streaming
- You need progressive Mermaid diagrams in Angular
- KaTeX math rendering during streaming matters
- You need safe HTML rendering in Angular without `[innerHTML]`
- Long AI responses need virtualized rendering

## Quick Start

```bash
pnpm add markstream-angular
```

```ts
import { Component, signal } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { MarkstreamAngularComponent } from 'markstream-angular'
import 'markstream-angular/index.css'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: `
    <markstream-angular
      [content]="markdown()"
      [final]="true"
    />
  `,
})
class AppComponent {
  readonly markdown = signal(`# Hello Angular

This is **markstream-angular**.`)
}

bootstrapApplication(AppComponent)
```

## Streaming SSE example

```ts
import { Component, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'

@Component({
  selector: 'chat-message',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: `
    <markstream-angular
      [content]="content()"
      [final]="final()"
      [fade]="false"
    />
  `,
})
export class ChatMessageComponent {
  readonly content = signal('')
  readonly final = signal(false)
}
```

## Optional peers and what they enable

| Peer | Enables |
| --- | --- |
| `mermaid` | Mermaid diagrams |
| `katex` | Inline and block math rendering |
| `stream-diffs` | Enhanced code blocks (recommended) |
| `@terrastruct/d2` | D2 diagrams |
| `@antv/infographic` | Infographic blocks |

Enhanced code blocks fall back to a plain `<pre>` when `stream-diffs` is not installed.

## When not to use this package

- You are below Angular 20
- You only render short static Markdown and do not need streaming mid-state handling
- You need a fully stable API surface today
- You only want to render completed Markdown after an SSE stream finishes

For completed-document Markdown in mature enterprise apps, evaluate your existing Angular Markdown stack first. `markstream-angular` is for teams that specifically need live Markdown rendering while the model response is still incomplete.

## Known limitations / maturity

- **Standalone component**: no NgModule required
- **Signal-based**: works with Angular signals for reactive content
- **OnPush renderer**: implemented with `ChangeDetectionStrategy.OnPush`
- **Safe HTML**: no `[innerHTML]` needed
- **Progressive Mermaid**: diagrams render incrementally
- **KaTeX math**: with worker support
- **Streaming code blocks**: with diff tracking
- **Optional peers**: install only what you need
- **Alpha status**: check npm and the [Angular guide](/guide/angular-quick-start) for the latest API maturity

## Try it

- [Live playground](https://markstream-angular.pages.dev/)
- [Full documentation](/guide/angular-quick-start)
