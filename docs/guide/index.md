---
title: Guide
description: Task-first guide for choosing the right Markstream path across framework entry points, installation, streaming usage, component overrides, and migration.
keywords:
  - markstream guide
  - markdown installation
  - streaming markdown usage
  - component overrides
  - framework entry points
---

# Guide

For Vue 3 and Nuxt, follow the three-step path below. If you use another framework, choose its package from [Frameworks](/frameworks/) first.

## Get Vue Working

1. [Vue Quick Start](/guide/quick-start) — install, import CSS, and copy a complete static or streaming example.
2. Choose one scenario: [AI Chat & Streaming](/guide/ai-chat-streaming), [Nuxt SSR](/nuxt-ssr), or [Docs Site & VitePress](/guide/vitepress-docs-integration).
3. Add only the optional peers you need from [Installation](/guide/installation).

If the first render fails, use [Troubleshooting by Symptom](/guide/troubleshooting-path). Once it works, use [Usage & API](/guide/usage) and [Props & Options](/guide/props) as reference rather than reading every page in order.

## I Want To Customize Rendering

- [API Reference](/guide/api) for parser helpers, scoping, and render-pipeline entry points.
- [Renderer & Node Components](/guide/components) for exported renderer and node component reference.
- [Override Built-in Components](/guide/component-overrides) to replace `image`, `code_block`, `mermaid`, `link`, or other built-ins.
- [Custom Tags & Advanced Components](/guide/custom-components) to support trusted tags such as `thinking`.
- [YAML Front Matter Cookbook](/guide/frontmatter-cookbook) to extract page metadata or convert it into a trusted custom tag.
- [Advanced Parser Hooks](/guide/advanced) and [Parser API](/guide/parser-api) for token or AST-level customization.

## I Want To Adopt It In An Existing App

- [Nuxt SSR](/nuxt-ssr) for browser-only peers and client-only guards.
- [AI / Skills workflows](/guide/ai-workflows) for copyable prompts, reusable checklists, and migration tasks.
- [Migrate from react-markdown](/guide/react-markdown-migration) and the [Migration Cookbook](/guide/react-markdown-migration-cookbook) for React teams.
- [Troubleshooting](/guide/troubleshooting) when the install works but styles, peers, or SSR do not.

## Framework Entry Points

### Vue 3 / Nuxt (markstream-vue) — most mature renderer

| Page | Description |
|------|-------------|
| [Installation](/guide/installation) | Install the package and only the peers you actually need |
| [Vue Quick Start](/guide/quick-start) | Render your first Vue Markdown document |
| [Usage & Streaming](/guide/usage) | Decide between `content` and `nodes` |
| [Docs Site & VitePress](/guide/vitepress-docs-integration) | Guided path for docs pages, `enhanceApp`, trusted tags, and CSS order |
| [AI Chat & Streaming](/guide/ai-chat-streaming) | Guided path for chat UIs, SSE, and token-by-token output |
| [API Reference](/guide/api) | Parser helpers, scoping, and render-pipeline entry points |
| [Renderer & Node Components](/guide/components) | Renderer and node component reference |
| [Customization](/guide/component-overrides) | Override built-ins and add custom tags |
| [YAML Front Matter](/guide/frontmatter-cookbook) | Extract metadata before rendering or map it to a trusted custom tag |

### Vue 2 (markstream-vue2)

| Page | Description |
|------|-------------|
| [Installation](/guide/vue2-installation) | Vue 2 specific setup |
| [Quick Start](/guide/vue2-quick-start) | Vue 2 examples |
| [Components & API](/guide/vue2-components) | Vue 2 component reference |

### React (markstream-react)

| Page | Description |
|------|-------------|
| [Installation](/guide/react-installation) | React specific setup |
| [Quick Start](/guide/react-quick-start) | React examples |
| [React Components](/guide/react-components) | React renderer and node components |
| [Migrate from react-markdown](/guide/react-markdown-migration) | Migration path for existing React Markdown apps |
| [Migration Cookbook](/guide/react-markdown-migration-cookbook) | Before/after recipes for common migration scenarios |

### Angular (markstream-angular)

| Page | Description |
|------|-------------|
| [Installation](/guide/angular-installation) | Angular specific setup |
| [Quick Start](/guide/angular-quick-start) | Standalone Angular examples |

### SolidJS (markstream-solid)

| Page | Description |
| --- | --- |
| [Quick Start](/guide/solid) | Workspace/tarball setup, Solid TSX, streaming, workers, custom components, SSR and restoration |
| [Framework overview](/frameworks/solid) | Capabilities and workspace preview status |

### Svelte (markstream-svelte)

| Page | Description |
|------|-------------|
| [Quick Start](/guide/svelte) | Svelte 5-only renderer usage, workers, and custom components |

### Nuxt

- [Nuxt SSR Guide](/nuxt-ssr) for client-only boundaries, workers, and browser-only peers.
