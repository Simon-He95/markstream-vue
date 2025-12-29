# Math Rendering Options (KaTeX)

This project uses KaTeX for math rendering when available. KaTeX is a peer dependency and must be installed separately.

Install KaTeX:

```bash
pnpm add katex
```

Import KaTeX styles in your entry file (e.g., `main.ts`):

```ts
import 'katex/dist/katex.min.css'
```

## CDN usage (no bundler)

If you load KaTeX via `<script>` tags (so `window.katex` exists), the library can use it. If KaTeX loads after the first render, reset the loader once:

```ts
import { createKaTeXWorkerFromCDN, enableKatex, setKatexLoader, setKaTeXWorker } from 'markstream-vue'

// use the CDN global (UMD) on the main thread
setKatexLoader(() => (window as any).katex)
enableKatex(() => (window as any).katex)

// optional: offload renderToString into a worker (CDN-loaded inside worker)
const { worker } = createKaTeXWorkerFromCDN({
  mode: 'classic',
  katexUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js',
  mhchemUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/mhchem.min.js',
})
if (worker)
  setKaTeXWorker(worker)
```

Customize math parsing behaviour with `getMarkdown` options or `setDefaultMathOptions`:

```ts
import { getMarkdown, setDefaultMathOptions } from 'markstream-vue'

setDefaultMathOptions({
  commands: ['infty', 'perp'],
  escapeExclamation: true,
})

const md = getMarkdown()
```

If KaTeX is not installed, the renderer will leave math content as text and still be import-safe under SSR.

Important: when writing source Markdown, always use literal (escaped) backslashes
for TeX parenthesis delimiters. Write `\\(...\\)` rather than `\(...\)` so
the parser can reliably detect inline TeX delimiters. Unescaped `\(...\)`
cannot be distinguished from ordinary parentheses and may not be parsed as math.

```ts
// Try snippet to demonstrate KaTeX usage
const example = `\\(E = mc^2\\)`
console.log(example)
```
