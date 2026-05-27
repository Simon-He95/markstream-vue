---
layout: home
description: Streaming-friendly Markdown renderer for Vue, React, Angular, Svelte, and Nuxt with guided docs for installation, VitePress, AI chat, overrides, and migration.
hero:
  name: markstream-vue
  text: Streaming-friendly Markdown renderer
  tagline: Vue 3 • Vue 2 • React • Angular • Svelte • Nuxt
  actions:
    - theme: brand
      text: Install by scenario
      link: /guide/installation
    - theme: alt
      text: Find my path
      link: /guide/
    - theme: alt
      text: Migration / AI
      link: /guide/ai-workflows
features:
  - title: Install the right peer set
    details: Pick the smallest dependency set for docs sites, chat UIs, Monaco-heavy editors, or diagram-first content.
    link: /guide/installation
  - title: Choose `content` vs `nodes`
    details: Static pages, VitePress docs, and SSE or token-streaming apps do not need the same integration path.
    link: /guide/usage
  - title: Find the right API layer
    details: Use API Reference for parser hooks and scoping, or Renderer & Node Components when you already know the component you need.
    link: /guide/api
  - title: Override built-in components
    details: Replace `image`, `code_block`, `mermaid`, `link`, or other node renderers with scoped, project-safe overrides.
    link: /guide/component-overrides
  - title: Add custom tags
    details: Turn trusted HTML-like tags such as `thinking` into custom nodes without rewriting the parser.
    link: /guide/custom-components
  - title: Migrate faster
    details: Move from existing Markdown renderers, wire framework-specific integrations, and learn where 1:1 migrations do not exist.
    link: /guide/react-markdown-migration
  - title: Work better with AI tools
    details: Use sharper prompts and reusable skill checklists for installation, migration, overrides, and troubleshooting.
    link: /guide/ai-workflows
---

A streaming-friendly Markdown renderer with progressive Mermaid support, streaming diff code blocks, and high-performance handling of large documents.

<SupportQRCodes
  title="Support markstream-vue"
  description="If markstream-vue helps your work, you can support ongoing maintenance with Alipay or WeChat Pay."
  note="Thank you for helping keep the docs, demos, and package maintenance moving."
  alipay-label="Alipay"
  wechat-label="WeChat Pay"
/>

## Pick The Shortest Path

| If you are trying to... | Start here | Then go to |
| --- | --- | --- |
| get the first render on screen | [Installation](/guide/installation) | [Quick Start](/guide/quick-start) |
| integrate it into a docs site or VitePress theme | [Docs Site & VitePress](/guide/vitepress-docs-integration) | [Custom Tags & Advanced Components](/guide/custom-components) |
| wire streaming or SSE output | [AI Chat & Streaming](/guide/ai-chat-streaming) | [Performance](/guide/performance) |
| debug a broken integration but you do not know why | [Troubleshooting by Symptom](/guide/troubleshooting-path) | [Troubleshooting](/guide/troubleshooting) |
| replace one built-in node renderer | [Override Built-in Components](/guide/component-overrides) | [Renderer & Node Components](/guide/components) |
| add trusted tags such as `thinking` | [Custom Tags & Advanced Components](/guide/custom-components) | [API Reference](/guide/api) |
| work at the parser / AST layer | [API Reference](/guide/api) | [Parser API](/guide/parser-api) |
| migrate or use AI to speed up adoption | [AI / Skills workflows](/guide/ai-workflows) | [react-markdown migration](/guide/react-markdown-migration) |

## Choose Your Role

### I am new to markstream

- Start with [Guide Home](/guide/) if you want the task-oriented map.
- Use [Installation](/guide/installation) if you already know the framework and just need the right peer set.
- Use [Quick Start](/guide/quick-start) if you want the smallest Vue 3 example first.

### I am integrating it into an existing app

- Use [Usage & Streaming](/guide/usage) to choose between `content` and `nodes`.
- Use [Docs Site & VitePress](/guide/vitepress-docs-integration) if the app is really a docs site, content hub, or VitePress theme.
- Use [AI Chat & Streaming](/guide/ai-chat-streaming) if the UI updates constantly and you want a single guided path.
- Use [Troubleshooting by Symptom](/guide/troubleshooting-path) if you do not yet know which subsystem is broken.
- Use [Troubleshooting](/guide/troubleshooting) if the install works but CSS, peers, or SSR look wrong.
- Use [Nuxt SSR](/nuxt-ssr) when browser-only peers must stay behind client boundaries.

### I am customizing rendering

- Use [Renderer & Node Components](/guide/components) when you already know the node/component you need.
- Use [Override Built-in Components](/guide/component-overrides) to replace `image`, `code_block`, `mermaid`, `link`, and other built-ins safely.
- Use [API Reference](/guide/api) and [Parser API](/guide/parser-api) for parser hooks, AST transforms, and scoping helpers.

### I want help from AI tools

- Use [AI / Skills workflows](/guide/ai-workflows) for repository skills, copyable prompts, and rollout order.
- Use [AI / LLM context](/llms) if your assistant can read repository context files.

## Choose Your Framework

::: tip Framework Support
All framework packages share the same core rendering model, but the entry pages differ by runtime and migration path.
:::

| Framework | Best first page | Use when | Demo |
| --- | --- | --- | --- |
| Vue 3 (`markstream-vue`) | [Guide Home](/guide/) | You want the main, most fully documented integration path | [Live demo](https://markstream-vue.simonhe.me/) |
| VitePress docs site | [Docs Site & VitePress](/guide/vitepress-docs-integration) | You are embedding renderer output into documentation pages or a content-driven site | [Live demo](https://markstream-vue.simonhe.me/) |
| Nuxt | [Nuxt SSR](/nuxt-ssr) | You need client-only guards, SSR notes, or worker setup | [Live demo](https://markstream-nuxt.pages.dev/) |
| Vue 2 (`markstream-vue2`) | [Vue 2 Quick Start](/guide/vue2-quick-start) | You are on Vue 2.6 / 2.7 and need the compatible package | [Live demo](https://markstream-vue2.pages.dev/) |
| React (`markstream-react`) | [React Quick Start](/guide/react-quick-start) | You are adopting React directly or migrating from `react-markdown` | [Live demo](https://markstream-react.pages.dev/) |
| Angular (`markstream-angular`) | [Angular Quick Start](/guide/angular-quick-start) | You are using standalone Angular components | [Live demo](https://markstream-angular.pages.dev/) |
| Svelte (`markstream-svelte`) | [Svelte Quick Start](/guide/svelte) | You are using Svelte 5 and need the same renderer API and worker paths | [Live demo](https://markstream-svelte.pages.dev/) |

## Common Destinations

- [API Reference](/guide/api) for parser helpers, scoping, and render-pipeline decisions
- [Renderer & Node Components](/guide/components) for exported renderer and node component reference
- [Troubleshooting by Symptom](/guide/troubleshooting-path) for first-pass diagnosis before diving into subsystem docs
- [Troubleshooting](/guide/troubleshooting) for CSS/reset order, peers, and common issues
- [Features](/guide/features) for a capability overview across streaming, Mermaid, Monaco, KaTeX, and more
- [AI / LLM context](/llms) and [AI / LLM 上下文](/llms.zh-CN) for repository-aware assistants

## How The Docs Are Organized

- `Start Here` is task-oriented: install, first render, streaming usage, and props.
- `Customization` covers renderer overrides, custom tags, parser hooks, styling, and troubleshooting.
- `Feature Guides` is now collapsed by default and holds the deeper dives for code blocks, Mermaid, KaTeX, D2, Monaco, and related nodes.
- `Frameworks & Migration` is for Vue 2, React, Angular, Svelte, Nuxt, and AI-assisted adoption workflows once you already know your target path.
