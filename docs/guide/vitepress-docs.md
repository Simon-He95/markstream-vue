# VitePress docs playbook

This page captures the structure we want for the documentation site so that new pages stay consistent and users can quickly answer the questions they usually have:

1. What problem does the library solve and how does it fit into my stack (Vue, Nuxt, VitePress)?
2. Which component should I reach for, and what props + events matter?
3. How do I debug visual glitches (CSS resets, Tailwind/UnoCSS layers, browser defaults)?

Use this page as the checklist before adding or polishing pages in the `/guide` section.

## 1. Tell the whole component story

For every major component (e.g., `MarkdownRender`, `CodeBlockNode`, `ImageNode`, `MermaidBlockNode`, `MathBlockNode`):

- **At-a-glance cards** — include a short summary block with: “Best for”, “Peers required”, “Key props/events”.
- **Usage ladder** — include three code snippets that escalate:
  1. *Minimal render* — single-file example that just renders the component.
  2. *Full-featured usage* — highlight advanced props, slots, or events (e.g., streaming, toolbars).
  3. *Integration example* — show the component wired into VitePress, Nuxt, or a custom renderer via `setCustomComponents`.
- **Callouts for failure modes** — each component section should dedicate 2–3 bullets to “Common gotchas” (e.g., `MermaidBlockNode` failing without `mermaid` peer, `CodeBlockNode` needing Monaco styles).
- **Cross-links** — close every component section with “See also” links so readers can navigate between `components`, `advanced`, `parser-api`, and troubleshooting content.

Suggested heading layout per component:

```md
## ComponentName

> One-line description (problem the component solves)

### Quick Reference
- Best for
- Key props/events (link to API tables)
- Required peers

### Usage
```vue
<!-- Minimal example -->
```

```vue
<!-- Full example + playground link -->
```

### Customize & Integrate
- Slots / `setCustomComponents` usage
- CSS handles (variables, classes)

### Common pitfalls
- Browser default style conflicts
- Peer dependency requirements
```

## 2. Structure the sections users visit first

Visitors follow a predictable path: **Quick Start → Usage & API → Components → Troubleshooting**. Each of these pages should surface:

- A “Choose your entry point” list (VitePress, Nuxt, standalone Vue) with links.
- Visual map of the renderer pipeline (Markdown → parser → AST → component tree).
- “What to do when things go wrong” callout linking to CSS reset instructions, UnoCSS/Tailwind guides, and playground repro tips.
- A shared “Component matrix” table summarizing which node renderer lives in which file. Add badges for “Slots”, “Events”, “Customizable via CSS variables”.

## 3. Bake troubleshooting into the docs

Style bugs are the number one source of issues, especially when combining the renderer with Tailwind or UnoCSS. Every page that mentions CSS should:

- Remind users to include a reset:

```css
/* docs styles entry */
@import 'modern-normalize';
@import 'markstream-vue/index.css';
```

- Mention that the packaged CSS is scoped under an internal `.markstream-vue` container. `MarkdownRender` renders inside that container by default; standalone node components should be wrapped with `<div class="markstream-vue">...</div>` so styles and variables apply.

- Explain that most “styles look wrong” bugs come from the **browser default stylesheet** (margin on `p`, `pre`, `code`, `table`). Encourage importing a reset (`modern-css-reset`, `tailwindcss base`, UnoCSS `preflight`) *before* the library CSS.
- Mention that Tailwind/UnoCSS run in different CSS layers. If the renderer styles are inserted before `@layer base/components/utilities`, utilities might override them, so wrap the import:

```css
@layer components {
  @import 'markstream-vue/index.css';
}
```

- Point to `docs/guide/tailwind.md` for Tailwind-specific instructions and include a UnoCSS snippet:

```ts
// uno.config.ts
import { defineConfig, presetUno, presetWind } from 'unocss'

export default defineConfig({
  presets: [presetUno(), presetWind()],
  preflights: [
    {
      layer: 'preflights',
      getCSS: () => '@import "markstream-vue/index.css";',
    },
  ],
})
```

## 4. Checklists before publishing a new page

1. **Link it from the sidebar** (English + Chinese locales).
2. **Add playground reproduction** link whenever showing usage.
3. **Add reset reminder** if the page touches styling.
4. **Verify Tailwind/UnoCSS order** by running `pnpm docs:dev` and testing with devtools layers.
5. **Update troubleshooting** if a new edge case is documented.

## 5. Track known problem categories

Document issues by grouping them into three buckets:

- **Browser defaults** — padding/margins on headings, buttons, `<details>`. Recommend `@unocss/reset` or `modern-css-reset`.
- **Utility frameworks** — Tailwind or UnoCSS classes overriding component CSS. Outline the layer strategy and prefix recommendation (`prefix: 'tw-'`).
- **Third-party CSS** — UI libraries injecting `:root` variables or `body` styles. Suggest scoping overrides via the `custom-id` prop and `setCustomComponents`.

Even with container-scoped package CSS, third-party global styles can still affect the renderer (e.g., resets, `body` typography, global `a` styles). Prefer scoping your overrides to the renderer instance via `custom-id` and `[data-custom-id="..."]` selectors.

Each bucket should have its own section inside `docs/guide/troubleshooting.md` so readers can skim and jump directly to the fix.
