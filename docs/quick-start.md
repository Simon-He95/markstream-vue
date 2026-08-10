---
title: Multi-framework Quick Start
description: Install the right Markstream renderer for Vue, React, Svelte, or Angular and render the first streaming Markdown message.
keywords:
  - multi-framework quick start
  - vue react svelte angular markdown
  - install stream renderer
  - first streaming markdown render
---

# Multi-framework Quick Start

Choose the package that matches your app runtime. All renderers support raw Markdown `content`; streaming surfaces should also pass the completion state so incomplete Markdown can settle when the response ends.

## Vue / Nuxt

```bash
pnpm add markstream-vue
```

```vue
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const content = '# Hello from Markstream'
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

Use [Vue Quick Start](/guide/quick-start) for the detailed Vue path and [Nuxt](/frameworks/nuxt) when SSR and browser-only peers matter.

## React / Next.js

```bash
pnpm add markstream-react
```

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Message({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Use root `markstream-react` in a client component for live SSE/WebSocket surfaces. Use [Next.js](/frameworks/next) for SSR-first or server-only Markdown rendering.

## Svelte 5

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let { content = '# Hello from markstream-svelte' }: { content?: string } = $props()
</script>

<MarkdownRender {content} />
```

`markstream-svelte` requires Svelte 5. Use [Svelte Quick Start](/guide/svelte) for workers and custom components.

## Angular

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
  template: '<markstream-angular [content]="content()" [final]="true" />',
})
class AppComponent {
  readonly content = signal('# Hello from markstream-angular')
}

bootstrapApplication(AppComponent)
```

Use [Angular Quick Start](/guide/angular-quick-start) for standalone component setup details.
