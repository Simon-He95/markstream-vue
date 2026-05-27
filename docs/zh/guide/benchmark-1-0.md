---
description: 生成 markstream-vue 1.0 benchmark 报告，包含环境披露和 playground 性能指标。
---

# 1.0 Benchmark 报告

发布 `markstream-vue@1.0` 前运行公开 benchmark 报告：

```bash
pnpm benchmark:1.0
```

这个命令会先构建 playground，再用 `vite preview` 启动站点，并执行已经纳入性能回归覆盖的 playground 检查：

- Diagnostic Studio 的 baseline、thinking、diff、stress 样例，会在 MarkdownCodeBlock 和 Monaco 两种模式下访问 `/test?benchmark=1`。该 benchmark 路由会禁用版本沙箱 iframe 与标注层，让 frame 指标和 renderer DOM 指标更接近 renderer surface。
- 主 playground 的 reverse-flex chat 场景，会访问 `/?benchmark=1` 并覆盖 initial load、full-scroll pass 和 streaming replay。

脚本会生成：

```txt
benchmark/
  results/
    diagnostic-baseline.json
    ...
  1.0.0.chrome-linux-x64.json
  1.0.0.chrome-linux-x64.md
  latest-summary.md
```

Markdown 摘要会记录 release package version、git SHA、workspace package versions、Node、OS、CPU、browser、viewport、server mode、LCP、CLS、settle time、frame sample count、frame p95 `requestAnimationFrame` interval、full-scroll heavy-settle frame p95、max long task、page DOM node count、renderer DOM node count、visible fallback count、重节点 readiness、scroll drift，以及浏览器暴露时的 Chrome-only best-effort renderer unmount + GC 后 heap。

Initial 行只报告当前 viewport 内可见重节点的 readiness；如果当前 viewport 没有重节点，则显示 N/A。Full-scroll 行会在滚完整个 surface 后报告所有重节点的 readiness。Page DOM nodes 只用于诊断；renderer DOM nodes 会限定在 `.preview-surface` 或 `.chatbot-messages` 内，也是 release gate 使用的 DOM 预算。每个阶段都会记录 frame p95；full-scroll 行的 `scrollFrameP95Ms` 只覆盖 active scroll loop。`heavySettleFrameP95Ms` 单独记录 post-scroll heavy block settle。1.0 中 frame p95 是 report metric；硬门禁保留在 fallback count、重节点 readiness、DOM budget、CLS、long tasks 和 settle time 上。

如果单个场景失败，runner 会继续执行剩余场景，写出包含 passed 和 failed 条目的完整报告，然后以非零状态退出。

仅调试脚本时，可以设置 `MARKSTREAM_BENCHMARK_SKIP_BUILD=1` 复用已有 playground build。除非 build artifact 刚刚生成，否则不要把这个快捷方式生成的结果当作 release evidence。排查单个问题时，可以设置 `MARKSTREAM_BENCHMARK_SAMPLES=baseline,diff` 缩小样例范围。

## CI workflow

`1.0 Benchmark` GitHub Actions workflow 会在 nightly schedule 运行，也可以手动触发。它会把生成的 `benchmark/` 目录作为 artifact 上传。

Release notes 优先引用 workflow artifact。本地生成的报告只是当前 OS、CPU、browser 环境下的快照；`benchmark/latest-summary.md` 只是本地报告的便捷副本，不代表 CI latest。报告会记录 parse commit、smooth-stream 合并解析次数，以及 markdown-it stream parser 的 full/append/tail/cache 计数，方便定位 stream parser 退化。这些数字是 release regression metrics，不是普适性能保证。不要宣称生成报告里没有出现的 speedup。

## Release gate

1.0 release gate 运行：

```bash
pnpm run release:gate:1.0
```

该命令会执行 `release:verify`、`docs:build:ci`、`size:check` 和 benchmark report。Release 命令会把报告输出到 `.tmp/benchmark`，避免发布依赖 tracked benchmark artifacts。

发布前再跑完整 package dry run：

```bash
pnpm run release:dry-run:1.0
```

它会重复 release gate，然后 dry-run parser、core 和 Vue package 的发布路径。
