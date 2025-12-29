# Troubleshooting

If something breaks, here are common fixes:

- If you get `window is not defined` during SSR, wrap components in `<client-only>` for Nuxt and use the `onMounted` guard for Vite SSR.
- Install `katex` when math rendering fails, and import `katex/dist/katex.min.css` in your app entry.
- For Mermaid issues, upgrade or pin `mermaid` to a version >= 11 and check asynchronous render logs.
- If you load KaTeX/Mermaid via CDN `<script>`, make sure `window.katex` / `window.mermaid` exist before first render, or call `setKatexLoader(() => window.katex)` / `setMermaidLoader(() => window.mermaid)` once after they load.
- For performance concerns, check that `viewportPriority` is true and avoid too many heavy nodes in a single mount.

If unsure, reproduce issue using the playground (or the hosted quick test) and then open an issue with stack trace and minimal markdown sample.

Hosted quick test: https://markstream-vue.simonhe.me/test

Open a new issue (quick link): https://github.com/Simon-He95/markstream-vue/issues/new?template=bug_report.yml

## Common problems (FAQ)

- Tailwind / CSS utilities overriding styling: If your project uses Tailwind or a component library (e.g., shadcn), utility classes or global styles may override the library's styles. See the Tailwind integration guide for recommended import ordering and strategies: [/guide/tailwind](/guide/tailwind).

  Quick fixes:

  - Import `markstream-vue/index.css` inside a `@layer components { ... }` block (see the Tailwind page). This controls style ordering.
  - Consider setting a `prefix` in Tailwind config (e.g., `tw-`) to avoid collisions with component library class names.
  - Use scoped selectors or `:deep` to target only the elements you need to override.

  Note: `markstream-vue` scopes its packaged CSS under an internal `.markstream-vue` container (including theme variables and Tailwind utilities), so most conflicts come from ordering/resets inside the renderer area rather than global leakage.

- Want to tweak looks? You can customize via CSS variables in `src/index.css` (e.g., `--vscode-editor-background`, `--vscode-editor-foreground`) or override component classes in your app's stylesheet. Use the `@apply` helper or your own stylesheet to keep style rules isolated.

- Slots first: if the styling you want needs layout changes inside a component, check whether the component provides a named slot (e.g., `header-left`, `header-right`, `loading`). Slots are an easy and stable escape hatch that let you re-render interior markup without overriding internals.

- Still not enough? Use `setCustomComponents(id, mapping)` to replace an entire renderer for a node with your own Vue component. See the `Advanced` guide for `setCustomComponents` usage and how to scope them to a `custom-id`.
  Quick example (replace the renderer for `code_block` nodes scoped to `my-docs`):

```ts
import { setCustomComponents } from 'markstream-vue'

setCustomComponents('my-docs', {
  code_block: MyCustomCodeBlock,
})
```

  This will cause all `MarkdownRender` instances with `custom-id="my-docs"` to render the `code_block` node using `MyCustomCodeBlock` instead of the default. See `Advanced` for more examples.

- Repro / report flow: When you run into rendering anomalies or errors, try to reproduce them with the `playground` app and a minimal markdown sample. If it's still broken, run unit tests locally with `pnpm test` to rule out regressions. Then open an issue with:

  1. Minimal markdown example that reproduces the problem (include in the issue body or link to a gist).
  2. Steps to reproduce (playground link or `playground` instructions), and the environment (browser, Node version, Vite/Nuxt).
  3. Any error stack traces and relevant console output.

  Prefer to share a small `playground` reproduction and include a link; maintainers will triage and ask for more context if needed.

  Extra tip: if you can write a unit/integration test that reproduces the bug, add it under the `test/` folder and run `pnpm test` locally — this is the fastest way for maintainers to validate and fix regressions.

## CSS looks wrong? Start here

Most rendering bugs are caused by style ordering, missing resets, or utility frameworks (Tailwind/UnoCSS) trumping component CSS. Run through this checklist before filing an issue:

1. **Reset browser defaults** — margins on `p`, `dl`, `table`, and `pre` differ per browser. Import a reset (`modern-css-reset`, `@unocss/reset`, or Tailwind's `@tailwind base`) *before* `markstream-vue` styles:

```css
@import 'modern-css-reset';
@tailwind base;
@tailwind components;

@import 'markstream-vue/index.css';
```

2. **Use CSS layers** — When Tailwind or UnoCSS runs in `@layer components` or `utilities`, wrap the library CSS import so the cascade is predictable:

```css
@layer components {
  @import 'markstream-vue/index.css';
}
```

For UnoCSS, inject the CSS inside `preflights`:

```ts
import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  preflights: [
    {
      layer: 'components',
      getCSS: () => '@import "markstream-vue/index.css";',
    },
  ],
})
```

3. **Double-check peer CSS** — Monaco, KaTeX, and Mermaid each ship CSS. Missing imports show up as invisible editors or unstyled formulas. Confirm the component guide you are following calls out the extra stylesheet.

4. **Scope overrides via `custom-id`** — When integrating with larger design systems, renderers can stomp on each other. Add `custom-id="docs"` to `MarkdownRender` and apply overrides scoped to `[data-custom-id="docs"]` so other layouts stay untouched.

If none of the above helps, reproduce the issue in the playground (`pnpm play`) with a CSS-only snippet and include the link when reporting the bug.

Quick test — run the playground locally to reproduce and debug:

```bash
pnpm play
# open the playground and reproduce the issue with a minimal Markdown sample
```
