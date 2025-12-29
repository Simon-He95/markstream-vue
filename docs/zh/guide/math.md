# 数学公式（KaTeX）

`markstream-vue` 在检测到 `katex` 时使用 KaTeX 渲染数学。KaTeX 为可选 peer 依赖，需单独安装。

安装示例：

```bash
pnpm add katex
```

在入口文件导入样式：

```ts
import 'katex/dist/katex.min.css'
```

## CDN 用法（无 bundler）

如果你通过 CDN `<script>` 引入 KaTeX（即 `window.katex` 存在），库会优先使用该全局对象。若 KaTeX 是在首次渲染之后才加载完成，请重置一次 loader：

```ts
import { createKaTeXWorkerFromCDN, enableKatex, setKatexLoader, setKaTeXWorker } from 'markstream-vue'

// 主线程使用 CDN 全局（UMD）
setKatexLoader(() => (window as any).katex)
enableKatex(() => (window as any).katex)

// 可选：把 renderToString 放到 worker（worker 内部同样从 CDN 加载 KaTeX）
const { worker } = createKaTeXWorkerFromCDN({
  mode: 'classic',
  katexUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js',
  mhchemUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/mhchem.min.js',
})
if (worker)
  setKaTeXWorker(worker)
```

若没有安装 KaTeX，数学表达式将被保留为纯文本以保证 SSR 安全。

注意：在撰写源码 Markdown 时，请务必在 TeX 括号定界符前使用字面（转义）反斜杠。
也就是说应写成 `\\(...\\)` 而不是 `\(...\)`，以便解析器能够可靠地识别行内 TeX。
未转义的 `\(...\)` 无法与普通括号区分，可能不会被解析为数学公式。
