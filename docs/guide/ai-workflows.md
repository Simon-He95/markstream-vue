# AI / Skills Workflows

If you use Codex, Cursor, Claude Code, ChatGPT, or another coding assistant to adopt markstream, the fastest way to get useful output is to give the tool the right constraints up front.

This page is intentionally practical: copyable prompts, rollout checklists, and what a reusable markstream-focused skill should cover.

## Start with your goal

- Want repository skills you can install right now: jump to [Install the repository skills](#install-the-repository-skills)
- Want ready-made prompt templates without cloning the repo: jump to [Copyable prompts](#2-copyable-prompts)
- Want to migrate from another renderer with an assistant: start with [Copyable prompts](#2-copyable-prompts) and the rollout pattern below
- Want to version reusable AI assets inside your own repo: read [Repository assets](#repository-assets)

## Install the repository skills

For end users, the recommended command is the shared `skills` installer:

```bash
npx skills add Simon-He95/markstream-vue
```

That path works because the repository now publishes reusable skills under `.agents/skills`, which `npx skills` can discover directly from GitHub.

The Vercel `skills` installer also supports multiple source formats:

```bash
# GitHub shorthand (owner/repo)
npx skills add Simon-He95/markstream-vue

# Full GitHub URL
npx skills add https://github.com/Simon-He95/markstream-vue

# Direct path to one skill in this repo
npx skills add https://github.com/Simon-He95/markstream-vue/tree/main/.agents/skills/markstream-install

# Any git URL
npx skills add git@github.com:Simon-He95/markstream-vue.git
```

- `npx skills add Simon-He95/markstream-vue` is the primary recommendation for Codex-compatible skill installation
- `markstream-vue@1.0` does not publish a CLI `bin`
- repository scripts such as `pnpm skills:list` and `pnpm prompts:list` are maintainer helpers for cloned checkouts, not npm package surface

The prompts stay in the repository under `prompts/`. Copy them from GitHub or from a cloned checkout; they are not published through the `markstream-vue` npm package.

## Repository assets

This repository now includes reusable assets you can version with the codebase:

- Task skills: `markstream-install`, `markstream-custom-components`, `markstream-migration`
- Framework entry skills: `markstream-vue`, `markstream-nuxt`, `markstream-vue2`, `markstream-vue2-cli`, `markstream-vue2-vite`, `markstream-react`, `markstream-angular`, `markstream-svelte`
- `prompts/install-markstream.md`
- `prompts/override-built-in-components.md`
- `prompts/add-custom-tag-thinking.md`
- `prompts/migrate-react-markdown.md`
- `prompts/audit-markstream-integration.md`

Use `.agents/skills/` when you want reusable Codex workflow assets that GitHub-based installers can discover automatically. The task skills cover cross-framework work; the framework entry skills make Vue 3, Nuxt, Vue 2, Vue 2 CLI, Vue 2 Vite, React, Angular, and Svelte 5 scenarios directly discoverable. Use `prompts/` when you want copyable starting prompts for humans or other assistants.

## 1. Give the AI these five facts first

Before you ask for code changes, include:

- framework and version, for example Vue 3, Nuxt 3, React 18, Angular 20, or Svelte 5
- CSS stack, for example Tailwind, UnoCSS, reset libraries, or a design system
- rendering mode: static article, docs site, SSR, or streaming chat
- required peers: Monaco, Mermaid, D2, KaTeX, or Shiki
- whether overrides must stay scoped to one area of the app

Without that context, assistants often install the wrong peers or place CSS in the wrong order.

## 2. Copyable prompts

### Install markstream in an existing Vue 3 app

```text
Install markstream-vue into this Vue 3 app.
Use the smallest peer-dependency set that matches these needs: [fill in Monaco / Mermaid / D2 / KaTeX / Shiki].
Keep CSS order safe with my existing stack: [fill in Tailwind / UnoCSS / reset library].
Add one minimal render example, and explain whether I should use `content` or `nodes`.
If you replace or override anything, keep it scoped with `custom-id`.
```

### Migrate from `react-markdown`

```text
Migrate this React codebase from react-markdown to markstream-react.
Audit which remark/rehype behaviors have no direct 1:1 equivalent.
Replace simple renderer overrides first, then call out anything that needs custom nodes, customHtmlTags, or parser/node post-processing.
Preserve existing user-visible behavior where practical.
```

### Add a custom tag such as `thinking`

```text
Add support for a trusted custom Markdown tag named `thinking`.
Use `customHtmlTags` plus a scoped `setCustomComponents` mapping.
Render nested Markdown inside the custom component, and keep the implementation streaming-friendly.
Do not use global overrides unless there is a clear reason.
```

### Debug styling or SSR issues

```text
Audit this markstream integration for CSS order, reset conflicts, optional peers, and SSR-only problems.
Check whether `markstream-vue/index.css` is loaded in the correct layer, whether KaTeX CSS is missing, and whether browser-only peers are gated behind client-only boundaries.
Explain the smallest fix set.
```

## 3. What a reusable markstream skill should do

If you are building a reusable prompt, template, or coding skill around markstream, it should reliably cover these steps:

- detect the framework and package manager
- install only the required peers for the requested features
- place CSS after resets and use `@import '...' layer(components)` when utility frameworks are involved
- choose `content` for simple rendering and most streaming chat; use built-in smooth streaming for jittery token streams; choose `nodes` plus `final` only for worker-preparsed/custom AST flows
- use `custom-id` for overrides by default
- point the user to the right docs page after making changes

Good follow-up links for a skill to cite:

- [Installation](/guide/installation)
- [Usage & Streaming](/guide/usage)
- [Override Built-in Components](/guide/component-overrides)
- [Custom Tags & Advanced Components](/guide/custom-components)
- [Troubleshooting](/guide/troubleshooting)

## 4. Point AI agents at the agent context file

For repository-aware assistants, also point them to:

- [AI / LLM context](/llms)

That file is agent-facing. This page is human-facing. In practice, the best results come from giving the assistant both:

- the task-specific prompt from this page
- the repository context file from `/llms`

## 5. A rollout pattern that works well

When the task is bigger than a one-file demo, ask the assistant to work in this order:

1. install and verify peers
2. make the base renderer work
3. fix CSS order
4. add scoped overrides or custom tags
5. run tests or docs build

That sequence prevents most “it compiled but looks wrong” outcomes.
