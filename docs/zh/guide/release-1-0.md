---
description: markstream-vue 1.0 稳定范围、发布门禁、性能报告和发布前检查清单。
---

# 1.0 发布就绪

`markstream-vue@1.0` 表示 Vue 3 renderer package 已进入生产可用稳定范围。1.x 会保持稳定 API、行为、安全默认值和 package exports，除非进入下一个 major 版本。

## 1.0 稳定范围

- Vue 3 `MarkdownRender`。
- 原始 `content` 渲染和预解析 `nodes` 渲染。
- `final`、`typewriter`、`smoothStreaming`、`useSmoothMarkdownStream`。
- 默认安全 HTML 策略 `htmlPolicy="safe"`。
- 可选 Mermaid、KaTeX、D2、Infographic、Monaco 集成。
- Vue / Vite / Nuxt / VitePress SSR import 与 render-to-string。
- CSS exports：`index.css`、`index.tailwind.css`、`index.px.css`。
- Worker client exports：`markstream-vue/workers/katexWorkerClient` 与 `markstream-vue/workers/mermaidWorkerClient`。
- `markstream-vue/tailwind` 默认与命名 safelist exports。

## 实验或内部范围

- Vue 2、React、Angular、Svelte、Next adapters 与 playgrounds。
- 仓库 CLI helpers、skills/prompts、agent assets。
- 低层 worker implementation files 与 CDN worker helper subpaths。
- Height-estimation experiment APIs。
- 内部调试/性能 props。

这些内容可以继续存在于仓库中，但不属于 1.x 兼容性承诺。

## 发布版本策略

1.0 正式发布时三个包一起发：

```txt
markstream-vue@1.0.0
markstream-core@1.0.0
stream-markdown-parser@1.0.0
```

## 发布门禁

发布前运行：

```bash
pnpm run release:gate:1.0
```

该命令会执行 release verification、docs build、size budget 和 1.0 benchmark report。当前 public benchmark 覆盖已发布 playground 场景：Diagnostic Studio 的 baseline、thinking、diff、stress，以及主 playground reverse-flex chat。Diagnostic Studio 场景使用 `/test?benchmark=1`，主 playground 使用 `/?benchmark=1`；报告中的 frame p95 使用 phase-local sample window，full-scroll 行的 `scrollFrameP95Ms` 只覆盖 active scroll loop，post-scroll heavy block settle 的 `heavySettleFrameP95Ms` 单独记录。1.0 中 frame p95 是 report metric；硬门禁保留在 fallback count、重节点 readiness、DOM budget、CLS、long tasks 和 settle time 上。benchmark 会生成 `benchmark/*.json`、`benchmark/*.md`、`benchmark/latest-summary.md`，release notes 应优先引用 `1.0 Benchmark` workflow artifact；本地生成的报告只代表文件名和环境信息披露的本机快照。

最终发布前运行完整 dry run：

```bash
pnpm run release:dry-run:1.0
```

它会重复 release gate，然后按顺序 dry-run parser、core 和 Vue package 的发布路径。

## Release operator checklist

这份 checklist 用于 1.0 正式发布和 release notes 最终确认。未勾选项是发布当天的人工确认项，不代表当前 1.0 readiness 状态。

- [x] 稳定与实验 API 已记录。
- [x] Parser/core 与 Vue 3 renderer 采用同版本 1.0.0 发布策略。
- [x] Legacy fence renderer escaping 有测试覆盖。
- [x] Safe HTML 文档与 XSS 回归测试完成。
- [x] App-scoped custom component registry 有 SSR 测试覆盖。
- [x] CSS、Tailwind、worker subpath exports 已纳入 smoke test。
- [ ] Unit、SSR、public API、package export checks 已通过。
- [ ] `pnpm run release:dry-run:1.0` 已通过。
- [ ] Nuxt SSR smoke 已通过 dev 和 preview 模式。
- [ ] VitePress docs build 已通过。
- [x] Migration notes 与 changelog 已记录 beta/rc 到 1.0 的变更。
- [ ] 当前 playground benchmark report 或最新 workflow artifact 已附到 release notes。
