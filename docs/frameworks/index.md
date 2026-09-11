---
title: 'Streaming Markdown renderer by framework: Vue, React, Nuxt, Next.js, Svelte, Angular, Solid'
description: Choose the right Markstream package for streaming Markdown in AI chat apps across Vue, Nuxt, React, Next.js, Svelte, Angular, Solid, Vue 2, and parser-only usage.
keywords:
  - Markstream framework packages
  - streaming Markdown renderer by framework
  - Vue streaming Markdown renderer
  - React streaming Markdown renderer
  - Svelte streaming Markdown renderer
  - Angular streaming Markdown renderer
  - Vue 2 streaming Markdown renderer
  - Next.js AI chat Markdown
---
# Markstream framework packages

Streaming Markdown renderers for AI apps across Vue, React, Svelte, Angular, Solid, Nuxt, and Next.js.

## Choose by framework

| Framework | Package | Status | Install | Best first page | Notes |
| --- | --- | --- | --- | --- | --- |
| Vue 3 / Nuxt / VitePress | `markstream-vue` | stable | `pnpm add markstream-vue` | [Vue](/frameworks/vue) / [Nuxt](/frameworks/nuxt) | Most mature renderer |
| React / Next.js / Remix | `markstream-react` | beta | `pnpm add markstream-react` | [React](/frameworks/react) / [Next.js](/frameworks/next) | SSR entries for Next.js |
| Svelte 5 | `markstream-svelte` | beta | `pnpm add markstream-svelte svelte@^5` | [Svelte](/frameworks/svelte) | Svelte 5 only |
| Solid | `markstream-solid` | beta | `pnpm add markstream-solid solid-js` | [Solid](/frameworks/solid) | Svelte behavior baseline; no virtualization |
| Angular standalone | `markstream-angular` | alpha | `pnpm add markstream-angular` | [Angular](/frameworks/angular) | Angular 20+ standalone |
| Vue 2.6 / 2.7 | `markstream-vue2` | compatibility | `pnpm add markstream-vue2` | [Vue 2](/frameworks/vue2) | Legacy Vue 2; Vue 2.6 needs `@vue/composition-api` |
| Parser only | `stream-markdown-parser` | stable | `pnpm add stream-markdown-parser` | [Parser API](/guide/parser-api) | No UI renderer |

## Choose by use case

| Use case | Best package | Why |
| --- | --- | --- |
| Vue AI chat | `markstream-vue` | Most mature renderer and the deepest Vue/Nuxt docs |
| React AI chat | `markstream-react` | React renderer for streaming chat; compare it with Streamdown for direct streaming alternatives |
| Next.js SSR-first Markdown | `markstream-react/next` | Server HTML first, then client enhancement |
| Svelte 5 AI chat | `markstream-svelte` | Svelte 5 renderer with the shared Markstream parser behavior |
| Solid AI chat | `markstream-solid` | Solid renderer with the Svelte behavior baseline; no virtualization |
| Angular standalone app | `markstream-angular` | Angular 20+ standalone component package |
| Legacy Vue 2 AI chat | `markstream-vue2` | Compatibility port for Vue 2.6 / 2.7; use `nodes` for high-frequency long streams |
| Parser-only pipeline | `stream-markdown-parser` | Structured nodes without a UI runtime |

## Package maturity

`markstream-vue` has a stable 1.x API contract. Current npm versions may still carry beta tags while the 1.0 release gate and cross-framework package family are finalized.

| Package | Maturity | Notes |
| --- | --- | --- |
| `markstream-vue` | stable | Main renderer, most documented path |
| `stream-markdown-parser` | stable | Parser-only package shared by renderers |
| `markstream-react` | beta | React and Next.js entries are documented separately |
| `markstream-svelte` | beta / experimental | Svelte 5 only |
| `markstream-solid` | beta | Svelte behavior baseline; no virtualization |
| `markstream-angular` | alpha | Angular standalone component |
| `markstream-vue2` | compatibility | Vue 2.6 / 2.7 legacy support; not the first choice for new Vue 3 projects |

## Quick examples

::: code-group

```vue [Vue]
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender mode="chat" :content="content" :final="isDone" />
</template>
```

```tsx [React]
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Message({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

```svelte [Svelte]
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'
</script>

<MarkdownRender {content} final={isDone} />
```

```ts [Angular]
import { Component, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'
import 'markstream-angular/index.css'

@Component({
  selector: 'app-message',
  imports: [MarkstreamAngularComponent],
  template: '<markstream-angular [content]="content()" [final]="true" />',
})
export class MessageComponent {
  content = signal('# Hello from Markstream')
}
```

```tsx [Solid]
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, isDone: boolean }) {
  return <MarkdownRender content={props.content} final={props.isDone} />
}
```

:::

## Common questions

### Is Markstream only for Vue?

No. `markstream-vue` is the most mature package, but Markstream also has React, Svelte, Solid, Angular, Vue 2, Next.js, and parser-only entries.

### Should I use Markstream or marked / markdown-it?

Use `marked` or `markdown-it` when you only need `markdown -> HTML`. Use Markstream when Markdown is rendered as framework components, changes during streaming, or needs stable AI-chat mid-states.

### Should I use markstream-react, Streamdown, or react-markdown?

Compare `markstream-react` with Streamdown when you are choosing a React streaming Markdown renderer. Use `react-markdown` as the static React Markdown baseline when content is short, complete, and tied to a mature remark/rehype plugin chain.

### Which packages are stable?

`markstream-vue` and `stream-markdown-parser` are stable. `markstream-react` and `markstream-solid` are beta, `markstream-svelte` is beta / experimental, `markstream-angular` is alpha, and `markstream-vue2` is a compatibility port.

### Should I use markstream-vue2 for a new project?

Use `markstream-vue2` only when the app must stay on Vue 2.6 / 2.7. For Vue 3 or new Nuxt projects, start with `markstream-vue`. For short completed Markdown in Vue 2, a smaller static Markdown renderer may be simpler.

## Common next steps

- Use [Vue / Nuxt installation](/guide/installation) after choosing `markstream-vue`.
- Use [React installation](/guide/react-installation) after choosing `markstream-react`.
- Use [Svelte Quick Start](/guide/svelte) after choosing `markstream-svelte`.
- Use [Solid](/frameworks/solid) after choosing `markstream-solid`.
- Use [Angular installation](/guide/angular-installation) after choosing `markstream-angular`.
- Use [Vue 2 landing](/frameworks/vue2) after choosing `markstream-vue2`.
