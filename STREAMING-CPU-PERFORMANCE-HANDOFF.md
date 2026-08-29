# Handoff：Streaming CPU 性能调查

## Why — 原始目标

Simon 希望在 streaming Markdown 渲染效果完全不变的前提下继续降低 CPU/performance 成本；允许架构级改动，但只有在预期收益足够大时才值得承担风险。

## How — 调查方式

- 2 轮并行探索，每轮由独立 verifier 收口；
- 覆盖 parser、Vue renderer、virtual layout、Fenwick、scheduler、heavy nodes、worker、SSR/hydration、GC/allocation、DOM/layout、producer backlog；
- 使用源码审计、Vitest/parser tests、Node parser 阶段计时、Node CPU profile、Fenwick microbenchmark、Playwright/Chrome 小规模 benchmark；
- 所有未通过当前 HEAD 端到端复现的数据均标为 `[UNVERIFIED]` 或限制为特定 workload；
- 调查期间未修改 runtime 源码，工作区保持干净。

完整报告：[STREAMING-CPU-PERFORMANCE-INVESTIGATION.md](STREAMING-CPU-PERFORMANCE-INVESTIGATION.md)

## What — 最重要的发现

1. **当前不是 naive full parse/render。** Stream/tail parse、structured node reuse、renderer dirty-tail cache、virtual layout、batch/coalescing、heavy defer/worker 已经存在。
2. **Plain parser 的已测最大阶段是 tokenize。** 50k synthetic blocks：total 2767ms，tokenize 1621ms（58.6%），processTokens 749ms（27.1%）。不要先重写 processTokens。
3. **HTML/details 是不同热点。** 50k HTML/details：HTML passes 2726ms（51.5%）；10k blocks/100 appends：HTML passes 1911ms（总计 3654ms，约 53.6%）。HTML pass 增量化是当前最有数据支持的 parser prototype。
4. **Fenwick growth 是最强算法信号，且已做最小修复。** N=10000/M=1000 的同机复测中，逐节点 append 中位数从 5373.4ms 降至 55.6ms（约 96.7x），batch append 从 12.75ms 降至 11.94ms；完整 Fenwick arrays 与 full rebuild 对照一致。该数据仍是 Node microbenchmark，不是 Vue/DOM E2E。
5. **非虚拟 renderer 仍有 O(N) 工作。** dirty prefix scan、`cache.slice()` 仍存在；50.4x rendered-item benchmark 是局部 synthetic 算法证据，不是 Vue/DOM E2E。`visibleNodes` computed 是惰性的，不属于非虚拟路径热点。
6. **Parser worker/heavy islands 尚未被证明值得大改。** 可能降低主线程 blocking，但 worker transfer、总 CPU、DOM/layout、SSR/hydration、plugin semantics 仍未量化或完整覆盖。

## Progress — 完成与剩余

### 已完成

- 第一轮热点地图；
- 第一轮独立 verifier：GAPS；
- 第二轮 parser 阶段 profiling；
- 第二轮 Vue/Chrome 小规模 profiling；
- 第二轮 Fenwick/scheduler 直接实测；
- Fenwick 扩容最小修复、full-rebuild differential 与修复前后复测；
- 第二轮 worker/restore/SSR 语义审计；
- 第二轮独立 verifier：GAPS，但达到“研究报告可交付”门槛；
- 报告和本 handoff 已保存到仓库根目录。

### 尚未完成

- 1k/10k+ 节点真实浏览器 streaming baseline；
- GC/allocation rate、minor/major GC、retained heap；
- producer/render backlog、CPU throttle、coalesced/dropped commit；
- parser tokenize 的前缀扫描范围和函数级准确归因；
- Fenwick growth 在真实 Vue batching/DOM 场景的调用 trace；
- Timeline estimate callback 的重/轻成本矩阵；
- parser worker round-trip 与 heavy island 的端到端实验；
- 完整 Mermaid SSR/hydration 和 custom plugin 语义等价性；
- full-mix fixture 的 streamed/static oracle 不一致问题定位。

## Continue — 下一位执行者建议

1. 建立稳定的当前 HEAD Chrome baseline：固定构建、浏览器、硬件、CPU throttle、warm/cold 和 3 warmup + 5 measured runs。
2. 先修 benchmark harness 的规模/正确性问题：大 fixture timeout 和 full-mix oracle mismatch 必须可解释，不能只排除失败样本。
3. 为每个 commit 输出可加总阶段：parser tokenize/HTML/process、renderer stabilization、Vue patch、DOM mutation、style/layout/paint、GC/heap、scheduler/backlog、final flush。
4. 用真实 trace 量化 Fenwick 修复后的端到端绝对收益；只有它仍显著时才继续改调度或数据结构。
5. 对 HTML/details 先做 feature-gated pass 增量 prototype，保留 cold parse shadow/differential gate。
6. 只有 plain tokenizer 或 renderer 二次 stabilization 经 profiling 证明占主导，才设计 ParseResult metadata / persistent vectors；不要凭 O(N) 静态事实直接重构。
7. Parser worker 仅考虑默认 parser、append-only、可序列化 options 的 MVP；保留主线程 plugin/custom renderer fallback。
8. 所有 layout/worker/island 试验必须带内容等价、逐 commit AST/DOM 等价、scroll anchor、focus/selection、hydration warning 和 failure-path 门禁。

## Blind spots — 刻意未放行的方向

- 没有把历史 `.tmp` restore 数据当作当前 HEAD 硬证据；
- 没有把 Node microbenchmark 直接当成浏览器端到端收益；
- 没有把 static O(N)/O(M²) 直接当成主热点；
- 没有批准全面 NodeRenderer 重写、强制 worker、全量 parser worker、统一 heavy islands；
- 没有为了性能弱化 custom plugin、custom component、sanitization、math/fence、SSR/hydration 的语义保护。
