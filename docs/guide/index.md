---
description: Task-first guide for choosing the right markstream-vue path across installation, streaming usage, VitePress docs sites, component overrides, and migration.
---

# Guide

This guide is organized by task first, framework second. Start with the shortest path that matches what you are trying to do today.

## I Want To Get Something Working Quickly

- [Install by scenario](/guide/installation) for peer-dependency decisions and CSS order.
- [Quick Start](/guide/quick-start) for the smallest Vue 3 example.
- [Usage & Streaming](/guide/usage) if you need to choose between `content` and `nodes`.
- [Docs Site & VitePress](/guide/vitepress-docs-integration) if you are wiring stable Markdown pages, theme CSS, and custom tags inside a docs site.
- [AI Chat & Streaming](/guide/ai-chat-streaming) if the UI updates continuously and you need one guided path for peers, parsing, performance, and troubleshooting.
- [Troubleshooting by Symptom](/guide/troubleshooting-path) if you do not yet know whether the issue is CSS, peers, SSR, or custom-tag wiring.
- [Props & Options](/guide/props) if the renderer already works and you only need configuration.

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

### Vue 3 (markstream-vue) ⭐ Recommended

| Page | Description |
|------|-------------|
| [Installation](/guide/installation) | Install the package and only the peers you actually need |
| [Quick Start](/guide/quick-start) | Render your first Markdown document |
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

### Svelte (markstream-svelte)

| Page | Description |
|------|-------------|
| [Quick Start](/guide/svelte) | Svelte 5-only renderer usage, workers, and custom components |

### Nuxt

- [Nuxt SSR Guide](/nuxt-ssr) for client-only boundaries, workers, and browser-only peers.
