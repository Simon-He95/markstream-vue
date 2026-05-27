---
description: 从 beta 或 rc 版本迁移到 markstream-vue 1.0 的说明。
---

# 迁移到 1.0

`markstream-vue@1.0` 稳定的是 Vue 3 renderer package。发布 `1.0.0` 时，`markstream-vue`、`markstream-core` 和 `stream-markdown-parser` 会一起发布。

## 1.x 稳定范围

- `MarkdownRender`、`VueRendererMarkdown` 和 `useSmoothMarkdownStream`。
- 直接传入 `content` 渲染，以及传入预解析 `nodes` 渲染。
- 默认启用 `htmlPolicy="safe"` 的安全 HTML 渲染。
- 可选 Mermaid、KaTeX、D2、Infographic 和 Monaco 集成。
- CSS exports、Tailwind safelist export、worker client exports、SSR imports，以及 app 作用域的自定义组件。

## 升级前检查

1. 把 rc package 的依赖 pin 替换成最终 Vue package：

```bash
pnpm add markstream-vue@1.0.0
```

只有当应用直接 import `markstream-core` 或 `stream-markdown-parser` API 时，才需要显式 pin 这两个包。

2. 引入一个已发布 CSS 文件：

```ts
import 'markstream-vue/index.css'
```

3. SSR 或多租户应用优先使用 app 作用域自定义组件：

```ts
app.use(VueRendererMarkdown, {
  components: {
    thinking: ThinkingNode,
  },
})
```

4. 不要把跨框架 package、底层 worker 实现文件、仓库里的 skills/prompts、height-estimation experiments 当作 1.x 兼容承诺。

## beta/rc 到 1.0 的 breaking 或 intentional changes

- npm package 只发布 `dist`，不再暴露 CLI `bin`。
- 底层 CDN/worker 实现文件只为 bundler 兼容保留 import 能力；文档化的 worker client exports 才是稳定 API。
- Safe HTML 与 URL protocol allowlist 默认更严格。
- Mermaid SVG 会在 mount 前 sanitize；除非对可信图表显式开启，否则 Mermaid interactions 会被禁用。
- `VueRendererMarkdown({ components })` 是推荐的自定义组件注册方式。全局 `setCustomComponents()` 仍然支持。

## Release validation

发布前运行 1.0 publish dry run：

```bash
pnpm run release:dry-run:1.0
```

把 `1.0 Benchmark` workflow artifact，或带环境披露的本地 benchmark report，附到 release notes。
