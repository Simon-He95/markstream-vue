# AI / Skills 工作流

如果你会用 Codex、Cursor、Claude Code、ChatGPT 之类的编码助手来接入 markstream，这页的目标就是帮你把任务描述得更准确，少走弯路。

这里不是泛泛而谈，而是直接给你可复制的任务模板、接入清单，以及一个 markstream 相关 skill 至少该覆盖什么。

## 先按你的目标选入口

- 想直接安装可用的 skills：先看 [安装仓库里的 skills](#安装仓库里的-skills)
- 想直接复制官方 prompt 模板：先看 [可直接复制的任务模板](#2-可直接复制的任务模板)
- 想让 AI 帮你做迁移：先看 [可直接复制的任务模板](#2-可直接复制的任务模板)，再配合文末的接入顺序
- 想把 AI 资产跟着仓库一起版本化：看 [仓库里的现成资产](#仓库里的现成资产)

## 安装仓库里的 skills

对最终用户来说，最推荐的是直接使用通用的 `skills` 安装器：

```bash
npx skills add Simon-He95/markstream-vue
```

这条路径之所以可用，是因为仓库里的可复用 skills 现在已经放在 `.agents/skills` 下，`npx skills` 可以直接从 GitHub 仓库识别并安装。

Vercel 的 `skills` 安装器也支持多种来源格式：

```bash
# GitHub shorthand（owner/repo）
npx skills add Simon-He95/markstream-vue

# 完整 GitHub URL
npx skills add https://github.com/Simon-He95/markstream-vue

# 仓库里的单个 skill 直链
npx skills add https://github.com/Simon-He95/markstream-vue/tree/main/.agents/skills/markstream-install

# 任意 git URL
npx skills add git@github.com:Simon-He95/markstream-vue.git
```

- `npx skills add Simon-He95/markstream-vue` 是当前最推荐的 Codex-compatible 安装方式
- `markstream-vue@1.0` 不发布 CLI `bin`
- `pnpm skills:list`、`pnpm prompts:list` 这类脚本只面向克隆仓库后的维护者，不属于 npm 包公开表面

`prompts/` 仍然保留在仓库里；可以直接从 GitHub 或克隆后的仓库复制，不通过 `markstream-vue` npm 包发布。

## 仓库里的现成资产

这个仓库现在已经有可版本化、可复用的资产：

- 任务型 skills：`markstream-install`、`markstream-custom-components`、`markstream-migration`
- 框架入口 skills：`markstream-vue`、`markstream-nuxt`、`markstream-vue2`、`markstream-vue2-cli`、`markstream-vue2-vite`、`markstream-react`、`markstream-angular`、`markstream-svelte`
- `prompts/install-markstream.md`
- `prompts/override-built-in-components.md`
- `prompts/add-custom-tag-thinking.md`
- `prompts/migrate-react-markdown.md`
- `prompts/audit-markstream-integration.md`

`.agents/skills/` 适合放可复用、并且能被 GitHub 安装器自动发现的 Codex 工作流资产。任务型 skills 负责跨框架工作流，框架入口 skills 则让 Vue 3、Nuxt、Vue 2、Vue 2 CLI、Vue 2 Vite、React、Angular、Svelte 5 这些场景更容易被直接发现；`prompts/` 适合放给人类或其他助手直接复制使用的提示词模板。

## 1. 先把这五类信息告诉 AI

在让 AI 开始改代码前，尽量先说明：

- 框架和版本，例如 Vue 3、Nuxt 3、React 18、Angular 20、Svelte 5
- CSS 技术栈，例如 Tailwind、UnoCSS、reset 库、设计系统
- 渲染模式：静态文章、文档站、SSR，还是流式聊天
- 需要哪些可选能力：Monaco、Mermaid、D2、KaTeX、Shiki
- 组件覆盖是否必须限制在某个业务区域内

少了这些上下文，AI 很容易装错 peer，或者把 CSS 放到错误的顺序里。

## 2. 可直接复制的任务模板

### 在现有 Vue 3 项目里安装 markstream

```text
把 markstream-vue 接入到这个 Vue 3 项目里。
只安装满足这些能力所需的最小 peer 依赖：[在这里填写 Monaco / Mermaid / D2 / KaTeX / Shiki]。
结合我现有的 CSS 技术栈处理样式顺序：[在这里填写 Tailwind / UnoCSS / reset 库]。
补一个最小可运行示例，并说明我应该用 `content` 还是 `nodes`。
如果需要覆盖组件，请默认使用带 `custom-id` 的 scoped 方式。
```

### 从 `react-markdown` 迁移

```text
把这个 React 项目从 react-markdown 迁移到 markstream-react。
先审计哪些 remark/rehype 行为没有直接 1:1 对应项。
优先迁移简单的渲染器替换，再标出哪些地方需要 custom nodes、customHtmlTags，或者解析后处理。
尽量保持现有用户可见行为不变。
```

### 支持 `thinking` 这类自定义标签

```text
为这个项目增加一个可信的 Markdown 标签 `thinking`。
请使用 `customHtmlTags` + scoped `setCustomComponents`。
自定义组件内部需要继续渲染嵌套 Markdown，并保持流式输出友好。
除非有充分理由，否则不要使用全局覆盖。
```

### 排查样式或 SSR 问题

```text
审计这套 markstream 接入的 CSS 顺序、reset 冲突、可选 peers 和 SSR 问题。
重点检查 `markstream-vue/index.css` 是否在正确的 layer 中、KaTeX CSS 是否缺失、浏览器专属依赖是否在 client-only 边界之后初始化。
最后给出最小修复集。
```

## 3. 一个可复用的 markstream skill 至少该做什么

如果你在做可复用的 prompt、模板或 coding skill，建议它稳定覆盖这些步骤：

- 自动识别框架和包管理器
- 按需求只安装必要的 peers
- 遇到 Tailwind / UnoCSS 时，把 CSS 放在 reset 之后，并使用 `@import '...' layer(components)`
- 普通渲染和大多数流式聊天优先用 `content`；token 抖动场景使用内置 smooth streaming；只有 worker 预解析、自定义 AST 或独立状态层接管解析时，才优先用 `nodes` + `final`
- 组件覆盖默认走 `custom-id` 作用域
- 改完后告诉用户下一步应该看哪一页文档

一个好的 skill 可以顺手引用这些页面：

- [安装](/zh/guide/installation)
- [使用与流式渲染](/zh/guide/usage)
- [覆盖内置组件](/zh/guide/component-overrides)
- [自定义标签与高级组件](/zh/guide/custom-components)
- [故障排除](/zh/guide/troubleshooting)

## 4. 让 AI 也读懂仓库上下文

如果你使用的是“能读仓库”的代理型助手，最好再让它一起参考：

- [AI / LLM 上下文](/llms.zh-CN)

`/llms.zh-CN` 更偏代理使用的项目地图；这页更偏人类可直接复制的任务模板。实际效果最好的是两者一起给：

- 这页的任务模板
- `/llms.zh-CN` 的仓库上下文

## 5. 一个很稳的接入顺序

当任务不只是“一页 demo”时，让 AI 按这个顺序推进，成功率通常最高：

1. 安装并确认 peers
2. 先让基础渲染器跑通
3. 修正 CSS 顺序
4. 再增加 scoped 覆盖或自定义标签
5. 最后跑测试或文档构建

这样能明显减少“代码能编译，但页面效果不对”的情况。
