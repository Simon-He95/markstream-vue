# Streaming CPU 性能优化调查报告

> 日期：2026-08-29
> 核心问题：在 streaming Markdown 渲染效果完全不变的前提下，当前架构还有哪些 CPU / performance 优化机会，哪些大改方向真正可能带来巨大收益？
> 调查轮次：2 轮；每轮并行探索 + 独立 verifier 1 个；结论：**研究报告可交付，但不批准直接进行大范围重构**。

## 结论摘要

当前实现已经不是“每个 token 都全量 parse + 全量重建 Vue 节点”的朴素架构。它已经包含：

- markdown-it stream/tail 解析；
- structured top-level node reuse；
- `useMarkdownParsing` 的稳定 prefix / dirty tail 复用；
- 非虚拟 rendered-item cache；
- 虚拟时间线与 Fenwick height tree；
- batch rendering、parse coalescing、smooth streaming；
- Code / KaTeX / Mermaid 等重节点的 defer 或 worker 路径。

调查后的最重要判断是：

1. **普通 Markdown 大文档：当前已测最大 parser 阶段是 tokenize，不是 `processTokens`。** 50k synthetic blocks 的 cold parse 中，tokenize 约占 58.6%，`processTokens` 约占 27.1%。
2. **HTML/details 文档：顶层 HTML pass 是最明确的 parser 热点。** 50k blocks 中 HTML passes 约占 51.5%；10k blocks / 100 次 append 中累计约 1.91 秒，占总时间约 53.6%。
3. **Fenwick 扩容是目前最明确的可量化算法热点，并已在本 PR 中做最小修复。** N=10000、M=1000 的同机复测中，逐节点 append 中位数从 5373.4ms 降至 55.6ms（约 96.7x），batch append 从 12.75ms 降至 11.94ms；这是算法级 micro-benchmark，不是端到端 UI 数据。
4. **非虚拟 rendered-item 路径仍有 O(N) prefix scan 与 `cache.slice()`。** 但现有 synthetic rebuild benchmark 的 50.4x 只证明局部算法收益，不能当作真实 Vue/DOM 端到端收益。
5. **parser worker 与 heavy-node islands 有潜在高收益，但目前没有足够证据证明它们会同时降低总 CPU、主线程长任务和用户感知延迟。** parser worker 还会触及 MarkdownIt plugin、custom renderer、SSR/hydration、对象 identity 等语义边界。
6. **目前不建议先重写 `processTokens`、全面重写 NodeRenderer、强制所有 heavy node 使用 worker，或移除 restore/focus/measurement 的同步保护。** 这些方向要么没有根因证据，要么风险高于已证实收益。

---

## 一、调查范围与方法

### 覆盖维度

- parser / tokenizer / safe-markdown / math boundary；
- structured AST reuse 与 renderer 二次 stabilization；
- Vue render / computed / non-virtual rendered items / Paragraph children；
- virtualization / Fenwick / height measurement / restore；
- batch scheduler / coalescing / producer backlog；
- Code / KaTeX / Mermaid / HTML heavy nodes；
- worker transfer / concurrency / abort / backpressure；
- SSR / hydration / custom MarkdownIt plugin 语义边界；
- benchmark 质量、GC/allocation、DOM/layout 证据质量。

### 验证方式

- 静态源码审计，所有结论尽量附 `file:line`；
- parser 阶段计时与 CPU profile；
- Fenwick 直接 micro-benchmark；
- 现有 Vitest / parser test / worker / restore 测试；
- 现有 Playwright/Chrome streaming benchmark；
- 两轮独立 verifier 审计，明确区分硬证据、静态事实和 `[UNVERIFIED]` 推断。

说明：原始调查没有修改运行时代码。PR review 阶段只落地了已通过正确性对照和性能复测的 Fenwick 扩容修复；其余大改方向仍未放行。`pnpm run build:parser` 产生的 dist 和 `.tmp` benchmark 输出均为生成物。

---

## 二、Current state：已确认的性能基础

### 2.1 Parser 增量复用已经有效

普通 append 路径已经具备 stream/tail 解析和 stable top-level reuse：

- [structured-node-reuse.ts](packages/markdown-parser/src/parser/reuse/structured-node-reuse.ts#L395) 在 token array identity 保持时只扫描 tail；
- [structured-node-reuse.ts](packages/markdown-parser/src/parser/reuse/structured-node-reuse.ts#L439) 只处理 dirty tail；
- [useMarkdownParsing.ts](src/components/NodeRenderer/composables/useMarkdownParsing.ts#L1390) 和 [useMarkdownParsing.ts](src/components/NodeRenderer/composables/useMarkdownParsing.ts#L1456) 又对 parsed nodes 做稳定化和 custom boundary warm-up。

当前 parser deterministic benchmark 的代表性数据：

| 场景 | stream total | commit p95 | reuse ratio | tail hits | full parses |
|---|---:|---:|---:|---:|---:|
| prose/code/math 1x | 约 22.2ms | 8.24ms | 0.818 | 14 | 3 |
| prose/code/math 2x | 约 30.1ms | 6.04ms | 0.912 | 30 | 3 |
| prose/code/math 4x | 约 41.4ms | 1.14ms | 0.956 | 62 | 3 |

这证明 stable prefix reuse 生效，但不证明每个 commit 已经是 O(append delta)：tokenizer、HTML pass、数组边界维护和 renderer 层仍可能扫描或复制全量数据。

### 2.2 Vue rendered-item 增量维护已经解决了主要的全量重建

非虚拟路径已经使用 `WeakMap` cache、source-node identity 和 dirty-tail rebuild：

- [NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L5669)；
- [NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L5954)；
- [NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L5994)；
- [NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L6028)。

现有 synthetic benchmark 在 5000 nodes、200 appends × 10 下报告：

```text
old = 286.77ms/session
new =   5.69ms/session
speedup = 50.4x
```

但该 benchmark 的 old/new 是局部模拟函数，并不包含 Vue mount/update、slot、DOM patch、ResizeObserver、layout 或 GC。因此它只能证明“dirty-tail 算法相对朴素全量 rebuild 有显著局部收益”，不能解释为真实产品端到端加速 50.4x。

### 2.3 Layout 与 scheduler 已有大量防护

已确认存在：

- height fallback prefix 增量失效和重建：[useHeightModel.ts](src/components/NodeRenderer/composables/useHeightModel.ts#L411)；
- Fenwick tree 增量更新：[useHeightMeasurements.ts](src/components/NodeRenderer/composables/useHeightMeasurements.ts#L144)；
- ResizeObserver + RAF 批量写入：[NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L4317)；
- virtual metrics 限频与同轮 DOM scan 复用：[NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L4082)；
- batch scheduler 的 coalescing、自适应 batch 和 timeout fallback：[useBatchRenderingScheduler.ts](src/components/NodeRenderer/composables/useBatchRenderingScheduler.ts#L200)；
- timeline layout 的 dirty-tail rebuild 和 Fenwick delta：[MarkstreamVirtualTimeline.vue](src/components/MarkstreamVirtualTimeline/MarkstreamVirtualTimeline.vue#L463)。

因此，不能把当前问题概括为“virtualization 或测量完全没有增量化”。剩余问题主要是某些扩容、estimate、restore 和多个调度链之间的边界成本。

---

## 三、阶段性实测与根因判断

### 3.1 Plain Markdown：tokenize 是最大已测阶段

函数级计时使用 5k / 10k / 50k blocks 的 synthetic plain Markdown：

| blocks | chars | total | safe markdown | tokenize | processTokens |
|---:|---:|---:|---:|---:|---:|
| 5,000 | 431,670 | 401.7ms | 2.4ms | 277.6ms | 92.0ms |
| 10,000 | 866,670 | 557.1ms | 0.6ms | 396.9ms | 109.3ms |
| 50,000 | 4,466,670 | 2,767.3ms | 5.5ms | 1,621.0ms | 749.1ms |

50k 时：

- tokenize 约 58.6%；
- `processTokens` 约 27.1%；
- 其余阶段约 14.3%。

因此，当前证据**不支持**先重写 `processTokensWithContext` 或整个 token-to-node pipeline。更值得查的是 `md.stream.parse(source, env)` 实际扫描范围、stream fallback、tokenizer block/inline tokenize，以及 renderer 侧和 parser 侧重复的稳定性工作。

### 3.2 HTML/details：HTML pass 是最强候选根因

| blocks | chars | total | tokenize | processTokens | htmlBlockPasses |
|---:|---:|---:|---:|---:|---:|
| 5,000 | 690,560 | 1,032.1ms | 378.9ms | 187.5ms | 419.1ms |
| 10,000 | 1,385,560 | 1,199.4ms | 282.8ms | 184.1ms | 636.9ms |
| 50,000 | 7,105,560 | 5,292.2ms | 1,246.8ms | 838.5ms | 2,726.4ms |

50k 时 HTML pass 约 51.5%，高于 tokenize 和 `processTokens`。

在 10k blocks、每次追加 100 blocks、共 100 commits 的 streaming 模型中：

```text
plain:       total 2912.44ms, processTokens 850.44ms
HTML:        total 3653.67ms, htmlBlockPasses 1911.48ms,
             processTokens 437.44ms
```

代码也支持这一归因：

- [parser/index.ts](packages/markdown-parser/src/parser/index.ts#L202) 明确说明 HTML passes 仍需每次 append 运行；
- [parser/index.ts](packages/markdown-parser/src/parser/index.ts#L213) 依次执行 `mergeSplitTopLevelHtmlBlocks`、`combineStructuredDetailsHtmlBlocks`、`structureGenericHtmlBlockChildren`；
- [structure.ts](packages/markdown-parser/src/parser/html/structure.ts#L219) 的 details fragment parse 禁用 stream parse 和 structured reuse；
- `structureGenericHtmlBlockChildren` 虽接收 `tailStart`，前两个 merge/combine pass 仍可能遍历完整结果。

**结论：**对 HTML/details-heavy workload，HTML pass 增量化是当前最有数据支持、也最值得 prototype 的 parser 大方向。它不是所有用户的全局热点；plain workload 仍由 tokenize 主导。

### 3.3 Structured reuse 和 renderer stabilization 存在重复工作，但收益尚未完成归因

当前两个层次分别维护 dirty boundary、stable prefix、signature 和 custom component boundary：

- parser reuse：[structured-node-reuse.ts](packages/markdown-parser/src/parser/reuse/structured-node-reuse.ts#L404)；
- renderer stabilization：[useMarkdownParsing.ts](src/components/NodeRenderer/composables/useMarkdownParsing.ts#L1364)；
- signature / dirty scan：[useMarkdownParsing.ts](src/components/NodeRenderer/composables/useMarkdownParsing.ts#L912)；
- reference/custom boundary：[useMarkdownParsing.ts](src/components/NodeRenderer/composables/useMarkdownParsing.ts#L695)。

此外还存在可见的线性复制：

```text
previous.groupStarts.concat(tailGroups.starts)
previousSeed.slice(...).concat(...)
previous.nodes.slice(...).concat(tailNodes)
```

位置见 [structured-node-reuse.ts](packages/markdown-parser/src/parser/reuse/structured-node-reuse.ts#L295)、[structured-node-reuse.ts](packages/markdown-parser/src/parser/reuse/structured-node-reuse.ts#L404)、[structured-node-reuse.ts](packages/markdown-parser/src/parser/reuse/structured-node-reuse.ts#L439)。

**可确认事实：**存在重复稳定性证明和 O(N) 数组工作。
**尚未确认：**它们在真实混合 workload 中是否超过 tokenizer / HTML pass / DOM / GC 成本。

合理的未来架构是让 parser 内部返回带 metadata 的 ParseResult，例如 `dirtyStartIndex`、reused prefix count 和 boundary summary，让 renderer 不再重新证明同一稳定 prefix。但这是中高风险内部协议改造，当前不能声称会产生巨大端到端收益。

### 3.4 Fenwick measured-node 扩容：最明确的算法热点

原实现的 [useHeightMeasurements.ts](src/components/NodeRenderer/composables/useHeightMeasurements.ts) 在 dataset 增长时遍历全部 `nodeHeights`，重新应用已测节点在扩容后的 Fenwick update path。[NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L1924) 会在节点数量变化时触发同步。

直接 benchmark：

| N 总节点 | M 已测节点 | 逐节点 append | batch append | 比值 |
|---:|---:|---:|---:|---:|
| 1,000 | 100 | 55.4ms | 1.94ms | 28.5x |
| 1,000 | 500 | 139.1ms | 1.75ms | 79.4x |
| 10,000 | 100 | 558.6ms | 12.6ms | 44.2x |
| 10,000 | 1,000 | 5,108.3ms | 16.1ms | 316.6x |
| 100,000 | 100 | 5,750.6ms | 143.3ms | 40.1x |
| 100,000 | 1,000 | 58,462.6ms | 139.9ms | 417.9x |

每个矩阵的 sum/count 语义校验通过。

这证明连续逐节点扩容的算法敏感性，但 benchmark 是直接调用 composable 的 Node microbenchmark：不包含 Vue batching、watch 调度、DOM 或浏览器 layout。

PR review 阶段采用了更小的修复：扩容时只初始化新增 slots、应用新增范围内已有的 measurement，并补齐覆盖旧边界的少量 Fenwick slots；不再遍历全部已测节点，也没有引入延迟调度、feature gate 或新状态。N=10000、M=1000 的同机复测结果：

| 场景 | 修复前中位数 | 修复后中位数 | 比值 |
|---|---:|---:|---:|
| 逐节点 append 10,000 次 | 5373.4ms（3 runs） | 55.6ms（5 runs） | 约 96.7x |
| batch append 10,000 个 | 12.75ms（7 runs） | 11.94ms（7 runs） | 约 1.07x |

sum/count 结果一致；单元测试还将逐步与批量增长后的完整 Fenwick arrays 和 full rebuild 对照，覆盖 1/2/4/8/16 等边界。该修复的算法收益已确认，真实 UI 中的绝对收益仍取决于 append commit 频率和 measured-node 密度。

### 3.5 Timeline `estimateItemHeight`：明确 O(N)，重要性取决于 callback

[MarkstreamVirtualTimeline.vue](src/components/MarkstreamVirtualTimeline/MarkstreamVirtualTimeline.vue#L771) 在 layout signature evaluation 中对所有 items 调用 host `estimateItemHeight`。现有测试确认：

- append / length growth 会按新的 N 全量调用；
- structural revision / width bucket 变化会全量调用；
- 单项 DOM measured height 变化不会全量调用；
- final-only 变化不会重新调用 estimate。

相关测试见 [virtual-timeline.test.ts](test/virtual-timeline.test.ts#L775) 和 [virtual-timeline.test.ts](test/virtual-timeline.test.ts#L4610)。

这是可信的 O(N) 事实，但轻/重 callback 的实际 wall time 尚未测量。只有当 host callback 本身昂贵，按 identity/revision/width bucket 缓存才有可能成为显著收益。

### 3.6 Vue / Paragraph：仍有 O(N) / O(M) 工作，但没有主导性证据

非虚拟路径：

- rendered-item dirty boundary prefix scan：[NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L5994)；
- 变更路径的 `cache.slice()`：[NodeRenderer.vue](src/components/NodeRenderer/NodeRenderer.vue#L6044)。

Paragraph 路径：

- `meaningfulChildren.filter`：[ParagraphNode.vue](src/components/ParagraphNode/ParagraphNode.vue#L93)；
- media-only 分支的 `slice(i + 1).some(...)`，潜在 O(M²)：[ParagraphNode.vue](src/components/ParagraphNode/ParagraphNode.vue#L104)；
- `processedChildren` 每次完整 map 和 signature：[ParagraphNode.vue](src/components/ParagraphNode/ParagraphNode.vue#L281)。

这些是可验证的复杂度事实，但尚未取得 1k/5k/10k top-level nodes 或长 inline/media paragraph 的真实浏览器阶段数据。不能仅凭静态 O(N) 把它们排在已测 HTML pass 或 Fenwick 热点之前。

### 3.7 Browser / DOM：当前成功样本太小

现有真实 Chrome streaming fixture 成功运行 1 warm-up + 3 runs，最终只有约 93 DOM nodes：

```text
total p50       784.5ms
catch-up        741.9ms
update p95        1.4ms
layout           23.607ms / 17 次
recalc style      1.102ms / 17 次
long tasks        0
heap delta        5.443MB
```

它证明当前小 fixture 可以测到 Vue patch、DOM mutation、layout、style 和 heap 指标，但不能外推到 1k/10k+ 节点。更大 workload 的现有 fixture 曾出现 timeout；一次 full-mix probe 还出现 streamed/static text oracle 不一致，因此失败运行没有被纳入性能结论。

### 3.8 Heavy node / worker / restore

当前已有：

- KaTeX worker 并发上限、cache、abort、timeout、backpressure；
- Mermaid worker shared-call 去重、timeout、abort、worker replacement；
- Code/Mermaid/Infographic/D2 viewport defer；
- restore floor、width bucket、anchor 和 hydration fallback 保护。

KaTeX 小公式的现有测试显示 direct path 可能比 worker 更快；cache hit 则可能带来数量级收益。该结论来自测试模型，不等同于真实浏览器 Worker round-trip。

重型节点在 restore 上有潜在高收益，但当前历史/生成数据不能作为本 HEAD 的硬证据：曾记录 changelog 级别约 382ms task、335ms long task、333ms frame p95、4376 DOM nodes，但没有本轮可复现的完整浏览器采集链路和完整环境披露。因此只能作为待复现信号。

静态审计还发现 KaTeX worker uncaught error 回包使用固定 id `__worker_uncaught__`：[katexRenderer.worker.ts](src/workers/katexRenderer.worker.ts#L70)。这更偏健壮性/故障诊断缺口，不应被误报为已量化的 CPU 根因。

---

## 四、候选方向比较

| 方向 | 当前证据 | 预期收益 | 改动规模 | 风险 | 建议 |
|---|---|---:|---:|---:|---|
| HTML/details pass 增量化 | HTML cold/append 阶段计时直接支持 | HTML-heavy 高；普通 Markdown 低 | 大 | 高，跨 chunk / nested details / raw 定位 | **最值得 prototype** |
| Fenwick append 扩容 | Node microbenchmark + full-rebuild differential | 逐节点 append 算法级约 96.7x | 小 | 低，内部结构不变 | **已做最小修复；继续采集 E2E trace** |
| tokenizer / stream scan 优化 | plain 50k tokenize 58.6% | 大 plain 文档高 | 大 | 很高，Markdown 语义和 fallback | 先 profile，不直接重写 |
| Parser → renderer dirty metadata | 双层扫描/复制有源码证据 | 中到高，取决于 renderer 占比 | 中到大 | 高，HTML/plugin/custom boundary | 作为内部协议 prototype |
| parser worker | 可减少主线程 parser 阻塞 | 主线程流畅度潜在高；总 CPU/wall time未证实 | 很大 | 极高，plugin/identity/SSR/clone | 仅做默认 parser MVP |
| heavy-node islands | restore/大 DOM 潜在高 | restore/scroll 高；stream总CPU未证实 | 大 | 高度、hydration、scroll anchor | 先 Code/diagram prototype |
| Timeline estimate cache | O(N) callback 已确认 | callback 重时中到高 | 中 | 外部状态隐式依赖 | 先加 call-count + callback benchmark |
| measurement transaction | 同帧多调度链可能重复 read | 中，主要降 layout/GC | 中 | bottom pin / restore freshness | Chrome trace 后做 |
| 全面 append-only renderer | 现有局部 benchmark 已 50.4x | 继续收益大概率低到中 | 很大 | Vue/插件/virtualization 行为 | 暂不做 |
| 强制所有公式/图表 worker | 现有 worker 已较完整，小任务可能更慢 | 主要是主线程 UX，不一定降总 CPU | 中到大 | queue、fallback、hydration | 不建议 |
| 重写 `processTokens` | 当前占比 plain 27%、HTML 16% | 不确定 | 大 | parser correctness | 暂不做 |

---

## 五、推荐路线图

### P0：先建立可重复的真实 baseline，不改公开行为

这是所有大改的前置依赖，目标不是“再跑一个 benchmark”，而是让阶段成本可加总：

1. 固定当前 HEAD、构建模式、Chrome 版本、硬件、CPU throttle、warm/cold 状态；
2. 至少覆盖 1k / 10k top-level blocks，必要时再覆盖 50k；
3. corpus 分为 plain、HTML/details、code-heavy、math-heavy、Mermaid-heavy、custom plugin；
4. 每组执行 3 warmups + 5 measured runs，记录 p50/p95/max，而非单次值；
5. 每次 commit 记录：
   - source chars / appended chars；
   - parse mode、tail/full/fallback reason；
   - tokenize、HTML pass、processTokens、stabilization；
   - Vue update、DOM mutation、style/layout/paint；
   - GC/allocation/retained heap；
   - rendered count、live DOM count；
   - producer backlog、render backlog、coalesced/dropped commits；
   - scroll drift、anchor correction、final flush。

验收：当前 baseline 自身必须通过 final cold parse、每 commit AST/semantic snapshot 和最终 DOM/text oracle。已有 full-mix oracle 不一致的 fixture 必须先定位，不得用“排除失败运行”代替修复或解释。

### P1：HTML pass 增量化 prototype

只在 parser 内部做 feature-gated prototype，优先：

- `mergeSplitTopLevelHtmlBlocks`；
- `combineStructuredDetailsHtmlBlocks`；
- open details/container state；
- tail dirty range 与 unchanged prefix result reuse；
- details fragment cache 的命中率和失效原因。

硬门禁：每个 chunk 与 cold parse 的 parsed-node JSON、attrs、loading/final、source offsets、HTML sanitize 结果完全一致；覆盖跨 chunk 标签、嵌套 details、同 raw sibling、未闭合 HTML、final transition、custom HTML tags。

只有在 10k/50k HTML append 中确认 html pass 时间按 dirty tail 下降，才批准扩大实现范围。

### P1：Fenwick 修复后的真实调用 trace

最小算法修复已完成；下一步只需在 benchmark/dev 环境观测：

- items length 每秒变化次数；
- 每次 M measured 数；
- 每次 growth 的时间；
- Vue batching 是否已经把多个 append 合并；
- 修复后的绝对耗时和端到端占比。

只有 trace 仍显示该路径显著，才考虑调度或数据结构层面的进一步改动。

### P1/P2：plain tokenizer 与 ParseResult metadata

对 plain workload，先将 tokenizer 内部阶段继续拆分，确认 `md.stream.parse` 是否反复扫描稳定 prefix。只有确认前缀扫描占比较高，才考虑：

- append offset / revision receipt；
- safe-markdown piece table 或 safe-prefix boundary；
- token stream chunk/persistent vector；
- parser 返回 `dirtyStartIndex`、reuse count、boundary summary；
- renderer 跳过已由 parser 证明的稳定 prefix。

这条路线的核心不是“把所有数组改成 persistent vector”，而是用 profile 证明每个 O(N) 复制/扫描确实在目标 workload 中可见。

### P2：parser worker MVP

仅支持：默认 parser、append-only source、无任意 custom MarkdownIt、无 token/node transform hook、可序列化 options。主线程继续持有：

- custom component registry；
- Vue node identity；
- DOM / height / scroll；
- 不支持 worker 的 fallback。

记录 worker init、postMessage、serialize/clone、worker compute、return、Vue commit 各阶段。对比 direct parser 的总 CPU、主线程 long task、frame p95、输入延迟和内存；如果只降低主线程 blocking 而不降低总 wall-clock，应明确定位为“流畅度优化”，而不是“总 CPU 优化”。

### P2：heavy-node island prototype

先只覆盖 CodeBlock 和 Mermaid/KaTeX 中的一类，不要一次性统一所有节点：

- offscreen 保留准确 placeholder/estimated height；
- visible 时加载 enhancement；
- enhancement 后通过现有 height model 反馈真实尺寸；
- 保留 `viewportReady` latch、SSR fallback、worker timeout/abort；
- 测量 restore task、long task、frame p95、DOM count、scroll drift 和 hydration warning。

---

## 六、正确性与等价性门禁

任何涉及 parser、AST identity、layout、worker 或 islands 的改动，都必须同时满足：

### Parser / stream

- append、rewrite、rollback、reset、final；
- incomplete fence、unfinished math、跨 chunk delimiter；
- reference / footnote 定义追加；
- details、generic HTML、custom HTML tags、sanitize；
- Mermaid、KaTeX、code language；
- 每个 commit 与 cold parse 的结构化节点差分；
- final output 与 fresh final parse 差分。

### Plugin / custom renderer

- `customMarkdownIt`；
- `preTransformTokens`、`postTransformTokens`、`postTransformNodes`；
- link validator；
- custom component mapping identity 变化；
- custom renderer props、events、lifecycle 和路由优先级。

当前这些路径会保守地关闭部分 reuse，例如 [structured-node-reuse.ts](packages/markdown-parser/src/parser/reuse/structured-node-reuse.ts#L191) 和 [useMarkdownParsing.ts](src/components/NodeRenderer/composables/useMarkdownParsing.ts#L1324)。不能为了 benchmark 数字直接放宽 gate。

### Layout / interaction

- `prefixSum` / `lowerBound` 数值一致；
- virtual range、height floor、width bucket；
- restore anchor 和相对 offset；
- bottom pin、reverse flex、user-scrolled；
- ResizeObserver、图片/代码/图表异步尺寸变化；
- focus、selection、scroll drift；
- hydration 无 mismatch 且首次布局不塌陷。

### Worker / failure

- abort before/after post；
- timeout、busy、worker replacement；
- `onerror`、`messageerror`、`postMessage` throw；
- unknown request id；
- worker uncaught error 能关联 request 或明确拒绝全部 pending；
- CSP、module/classic worker、CDN 失败和无可选 peer fallback。

---

## 七、验证记录

| 结论 | 方法 | 结果 / 状态 |
|---|---|---|
| parser stable prefix reuse 生效 | deterministic parser benchmark | reuse ratio 4x 约 0.956；硬证据 |
| plain tokenize 为最大已测 parser 阶段 | 5k/10k/50k 函数级计时 | 50k tokenize 1621ms；硬证据，Node parser scope |
| HTML pass 为 HTML workload 主导阶段 | 5k/10k/50k + 10k/100 commits | 50k 占约 51.5%，append 累计约 1911ms；硬证据，synthetic HTML scope |
| `processTokens` 不是当前全局第一优先级 | 同上 | plain 27.1%、HTML 15.8%；硬证据，但未进一步拆内部函数 |
| Fenwick growth 修复 | N/M Node microbenchmark + full-rebuild differential | 10k/1k 逐节点 5373.4ms → 55.6ms，batch 12.75ms → 11.94ms；算法级硬证据，非 E2E |
| rendered-item dirty-tail 算法优于朴素路径 | synthetic benchmark | 50.4x；局部算法证据，非真实 Vue E2E |
| 非虚拟路径保留 O(N) scan/slice | 源码审计 | `NodeRenderer.vue:5994`, `6044`；硬复杂度事实，收益 `[UNVERIFIED]` |
| Timeline estimate 保留全量 callback | 源码 + Vitest call-count | append/revision/width 变化按 N 调用；callback wall-time `[UNVERIFIED]` |
| scheduler 有 coalescing / adaptive batch | Vitest | 行为测试通过；producer backlog/frame budget `[UNVERIFIED]` |
| 小规模真实 Chrome 能测 Vue/DOM/layout | Playwright benchmark | 93 DOM nodes、无 long task；不能外推大规模 |
| worker / hydration 现有边界测试存在 | Vitest worker/SSR/heavy suites | 相关 5 files/56 tests、另 6 files/26 tests 通过；真实 CDN/完整 Mermaid hydration `[UNVERIFIED]` |
| parser worker 能带来巨大总收益 | 静态架构分析 | **未验证**，当前没有 parser worker |
| heavy islands 能解决 changelog restore 长任务 | 历史数据 + 静态推断 | **未验证**，需当前 HEAD 大规模 Chrome baseline |
| GC/allocation、producer backlog 已被充分归因 | 当前 benchmark | **未完成**，只有小 fixture heap delta |

---

## 八、最终判定与明确建议

第二轮独立 verifier 结论为 **GAPS**：

- 研究已经从“可能存在很多 O(N)”推进到 workload-specific 阶段数据；
- parser 的 plain / HTML 方向已出现明确分化；
- Fenwick 的算法热点已有强 microbenchmark 信号；
- 但真实大规模 Chrome、GC/allocation、producer backlog、worker round-trip、SSR/hydration 等仍不足；
- 不能据此批准 parser worker、全面 layout 重构、NodeRenderer 大重写或统一 islands。

**当前最合理的执行顺序：**

1. 先补 P0 真实端到端 baseline 和 backlog/GC/DOM 分层观测；
2. 对 HTML/details workload 做增量 pass prototype；
3. 对已修复的 Fenwick growth 采集真实调用 trace，确认端到端绝对收益；
4. 对 plain workload 继续拆 tokenize/stream scan；
5. 只有 profile 明确支持时，才进入 ParseResult metadata、parser worker 或 heavy island 的大改 prototype；
6. 每个 prototype 都以逐 commit cold-parse differential + scroll/hydration/worker failure gate 收口。

---

## 九、盲点与限制

以下问题本轮没有足够证据，不能在结论中伪装成已解决：

- 当前生产 corpus 中 plain / HTML/details / custom plugin 的真实比例；
- 真实浏览器中 parser、Vue、DOM/layout、GC 的可加总占比；
- 1k/10k+ nodes 的稳定 streaming benchmark；
- `md.stream.parse` 的实际前缀扫描范围；
- `ParagraphNode` 长 inline/media 场景的实际耗时；
- producer 速率超过 render 速率时的 backlog、输入延迟和 dropped/coalesced commit 数；
- Fenwick 增长在真实 Vue batching 下的调用频率；
- Timeline estimate callback 的真实成本；
- parser worker structured clone / initialization / result injection 成本；
- Mermaid CDN Blob worker 与真实 SSR hydration；
- 完整 allocation rate、minor/major GC 和 retained heap；
- 所有 custom MarkdownIt/plugin 组合的语义等价性。

这些不是理由去停止优化，而是批准“大改”前必须补齐的实验条件。
