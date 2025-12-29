# Tailwind Integration & Style Ordering

If your project uses a Tailwind component library like `shadcn`, you may run into style ordering or overriding issues when including `markstream-vue` CSS. The recommended approach is to import the library CSS inside a controlled Tailwind layer.

`markstream-vue` scopes its packaged CSS under an internal `.markstream-vue` container to reduce global conflicts. Tailwind utilities from `markstream-vue/index.css` apply only inside the renderer container.

Example `styles/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  @import 'markstream-vue/index.css';
}
```

Alternatives:
- Place the library CSS inside `@layer base` if you want it to be more foundational and harder to override.
- Import the library CSS after your component or application CSS if you prefer the library styles to win.

Always re-run your dev server after changing the import order.

## Avoid duplicate CSS with Tailwind

To reduce duplicated utility CSS when using Tailwind, prefer the "tailwind-ready" output shipped by this package instead of the full, precompiled `index.css`.

- Tailwind v3 (recommended workflow):
  - Import `index.tailwind.css` in your app so consumers get only the framework+component styles without embedded Tailwind utilities.
  - Add the generated class list to your `tailwind.config.js` `content` so Tailwind can pick up the classes used by the renderer and not re-generate them.

Example (Tailwind v3 / `tailwind.config.js`):

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,vue}',
    // include the helper produced by the package
    // installed packages can reference: require('markstream-vue/tailwind')
    require('markstream-vue/tailwind'),
  ],
}
```

Example CSS import (app entry):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import 'markstream-vue/index.tailwind.css';
```

- Tailwind v4: you can directly include `index.tailwind.css` and rely on the v4 scanner to discover classes without needing the extra `tailwind.ts` helper.

- Non-Tailwind projects: continue to import the precompiled `index.css`:

```css
@import 'markstream-vue/index.css';
```

Notes:
- The package exposes a `./tailwind` entry (`./dist/tailwind.ts`) which exports the extracted class list. When installing from npm, `require('markstream-vue/tailwind')` will load that helper for use in your Tailwind config.
- If you develop locally against the repo, you may reference the generated file directly (e.g. `./dist/tailwind.ts`).

Quick try — verify Tailwind classes are discovered by adding `index.tailwind.css` and a small component:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Tailwind test\n\nThis text is styled by tailwind'
</script>

<template>
  <div class="prose">
    <MarkdownRender :content="md" />
  </div>
</template>
```

## UnoCSS integration

UnoCSS follows the same rules: import resets first, then wrap renderer CSS so component styles stay in the correct layer.

1. Install Uno presets (`presetUno`, `presetWind`) and include the package CSS inside a `preflight`:

```ts
// uno.config.ts
import { defineConfig, presetUno, presetWind } from 'unocss'

export default defineConfig({
  presets: [presetUno(), presetWind()],
  preflights: [
    {
      // ensures the CSS runs with the base reset
      layer: 'preflights',
      getCSS: () => '@import "markstream-vue/index.css";',
    },
  ],
})
```

2. If you prefer to rely on CSS layers manually, include the CSS in your main stylesheet:

```css
@import '@unocss/reset/tailwind.css';

@layer components {
  @import 'markstream-vue/index.css';
}
```

3. Use Uno prefixes (e.g., `uno` config `rules: [], shortcuts: [], theme: {}` + `shortcutsPrefix: 'u-'`) when class names collide with renderer classes. Tailwind users can also set `prefix: 'tw-'` in `tailwind.config.js`.

Troubleshooting tip: enable the “Cascade Layers” view in devtools to check whether Uno/Tailwind utilities override renderer selectors. If utilities appear below the component layer, move the import into `@layer components` or adjust the preflight order.
