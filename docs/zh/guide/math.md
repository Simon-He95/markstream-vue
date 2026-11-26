---
title: 数学公式（KaTeX）
description: 在 markstream-vue 中使用 KaTeX 渲染数学公式，介绍安装 katex、导入样式以及 CDN 全局对象与 worker 的配置方法。
keywords:
  - KaTeX
  - 数学公式
  - 流式渲染
---

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

单个 `$` 遵循 Pandoc 的规则：起始的 `$` 后面必须是非空白字符，结束的 `$` 前面必须是非空白字符、后面不能紧跟数字。下一个 `$` 无法闭合公式时，起始的 `$` 按文本处理，所以 `$ x $` 和 `$5 and $6` 都不会被当成公式。

`**$312** and **$289**`、`$210 + $98 = $308` 等金额文本在流式输入时也会保持为文本。`$210 +` 这样的未完成数字片段会等待操作数出现后再进入公式加载状态。`$1$`、`$2 + 3 = 5$`、`$1,000 + x$` 等闭合公式仍按数学公式渲染。存在歧义时，可以将金额的美元符号转义为 `\$`，或为公式使用显式 TeX 括号定界符。

`\(...\)` 是显式的 TeX 定界符：类型由定界符决定，而不是由内容决定。
`\(3\)`、`\(dx\)`、`\(n!\)` 都会渲染为公式；流式解析中未闭合的 `\(` 会直接按公式预测，
不会在文本和公式之间反复切换。需要字面括号时直接写 `(` 即可——`\(` 和 `\)`
不再按 CommonMark 转义处理。需要保留旧语义时，可在 `mathOptions` 中设置
`inlineParenDelimiter: 'escape'`。
