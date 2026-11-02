# Codex 流式淡入、分词与节奏适配

后续已加入结束立即 flush 与淡入收束。本文下方的“结束后排空”与长尾数据记录改动前的行为；当前行为和 CPU/Paint 重复测量见 [结束性能验证](./streaming-finish-results.md)。

检查日期：2026-11-02。本机客户端版本：26.1027.51404（23880）。

## 参数来源

读取 `/Applications/ChatGPT.app/Contents/Resources/app.asar` 内的前端资源：

- `webview/assets/b74e19ff7ff4.css`：Markdown 的 `FadeIn` 使用透明度 0 → 1、`cubic-bezier(.37, .55, .86, .88)`、`both`；`AdaptiveStreaming` 下时长取 `--animation-duration-streaming-text`。
- `webview/assets/fd9b7fd80db1.css`：`--animation-duration-streaming-text: .7s`，普通基础过渡时长为 `.15s`。
- `webview/assets/app-initial-61c1d0e6137e.js`：ASCII 按字母/数字连续串分词；非 ASCII 使用 word segmenter，标点与空白附在前词。词增长时复用身份，已完成的词不重播。自适应流式路径的词间延迟为 0，输出节奏由前置缓冲器控制。
- 同一 JS 中的缓冲器每 50ms 排出内容，以新到达速率 10%、已有速率 90% 更新估计，再按积压量调整。资源包含到达间隔下限的两个配置分支，静态检查不能确定用户会话实际命中哪一支；不能据此宣称逐帧完全复现。

700ms 是该客户端自适应流式文字的时长，并非所有入场动画的统一时长。

## 本次实现

1. Vue 的 TextNode / InlineCodeNode 默认改为上述 700ms 曲线，现有 CSS 变量继续生效。
2. 共享 fade controller 按词处理新增尾部。新词拥有独立动画，增长中的同一个词保持 ID 和开始时间，已完成词的后续字符不重新淡入。只重新分词末词与新增文本；中文词典重新划分末词时保留已显示边界。
3. 取消固定 4 批上限，动画结束后依序回收完成前缀。单次追加超过 64 个词时，只合并这一批同龄的前缀，并独立保留末词；不会把新词塞入更早的动画。
4. 共享出字 controller 加入到达速率的 10% 平滑估计，并保留已有积压追赶、速度上下限、字素和代码围栏保护。Vue 默认仍最多 20 次提交/秒，去掉首次 80ms 等待。保留原有最低 40 字/秒，避免降低到 1 字/秒后长尾收束过慢。
5. Vue 的后台标签页更新直接归入静态文本，避免后台延迟派发 animationend 时累积动画节点；恢复可见后新增词继续淡入。
6. Vue 开启 fade 时，小包不再绕过 pacing，大包不再整段直出。静态首屏仍直接显示；最终文本仍按原有 finish 规则排空队列。fade 的解析默认间隔为 0，避免在受控出字后再等待 80ms；显式 `parseCoalesceMs` 继续优先。

这复用了 Codex 的主要视觉策略和到达速率估计，并保留 markstream 的既有积压调度、完成语义和 Markdown 保护。不是 Codex 调度器的逐项复制。共享 core 的分词也被 Solid 使用，速率估计会影响复用该 controller 的框架；相应共享测试和 Solid 渲染/选区测试已检查。

## 使用与对比

```vue
<MarkdownRender
  :content="markdown"
  :final="isFinished"
  fade
  smooth-streaming="auto"
  :max-live-nodes="0"
/>
```

```sh
node scripts/build-streaming-fade-tuner.mjs
python3 -m http.server 4198 --bind 127.0.0.1 --directory .tmp/fade-comparison
```

打开 http://127.0.0.1:4198/ 。左侧是构建时 HEAD 的旧实现，右侧是工作区实现。可用 `FADE_BASELINE_REF` 指定旧提交；本次使用 `4556e5d6b1ef9bb4476bf983123ac25a3b01b2a9`。双方接收相同输入，勾选出字节奏比较完整行为，取消勾选则单独比较 fade。右侧可切换曲线，但仍使用新分词逻辑。面板下方性能表是此前历史基线数据，不代表这次适配。

## 浏览器结果

Chrome 156.0.8078.74，生产构建：

- 暂停首词动画于 350ms，继续每 16ms 追加新词直到 20 个。首词动画对象及透明度不变；后续每个新词从 0 开始，突破第 4 批后也没有继承旧透明度。TextNode 与 InlineCodeNode 均通过。
- 每 16ms 追加一个英文词，连续 250 次：两个组件的活跃词节点峰值均为 43，结束后剩余动画为 0；TextNode 最终仅 3 个元素，InlineCodeNode 为 2 个，文本完整。
- 活跃词选区跨追加与动画完成保持不变，释放后补齐文本；减少动态效果下动画立即完成并清理。
- 中英混排、粗体、行内代码、列表、emoji、组合字符的最终 DOM 文本与同内容的静态渲染一致。没有浏览器异常。

以下每个场景、每个版本只测一次，顺序独立运行，1100×800、headless、无 CPU 降速。两侧均启用 smoothStreaming、设置 parseCoalesceMs=0。主线程为 CDP TaskDuration，包含输入、队列排空、动画完成和相同采样代码，不含 GPU；单次 smoke 数据不能推导稳定性能收益。完整渲染器的动画数量在输入更新时采样，可能漏掉两次输入之间的峰值；上面的 250 词压力检查则覆盖每次新增词。

| 输入 | 主线程旧/新 ms | 帧间隔 p95 旧/新 ms | 新版动画节点（输入采样峰值） | 新版长任务 |
| --- | ---: | ---: | ---: | ---: |
| 密集：4 字 / 16ms | 359.2 / 340.1 | 16.7 / 16.7 | 17 | 0 |
| 突发：混合 Markdown / 200ms | 322.7 / 398.7 | 16.8 / 16.8 | 22 | 0 |
| 慢速：1 字 / 100ms | 87.6 / 99.3 | 16.7 / 16.7 | 4 | 0 |

密集输入的总完成时间由约 2.55s 变为 4.07s（包含 2.22s 输入、排空和淡入）：持续小包现在经过 pacing，且最后一批淡入为 700ms。突发输入主线程工作也有所增加。需要更快收尾时仍可通过已有的 `smoothStreamingOptions` 调整延迟、速度或 `flushOnFinish`。

原始采样见 [codex-streaming-results.json](./codex-streaming-results.json)。本次未测 GPU、低端设备或大规模多消息同时播放；长动画意味着更多活跃节点，不能把取消 4 批上限理解为没有渲染成本。

## 验证汇总

- 功能测试（排除 `.tmp` 和性能 benchmark）：392 个文件，3553 项通过；1 项大文本分享测试在并发运行时超过其 15 秒限制，单独复跑用时 3.26 秒并通过。没有修改该测试断言或超时设置。
- 共享 core：7 个文件、360 项通过；Solid 渲染与选区：2 个文件、30 项通过。
- 后台静态更新、回到前台恢复淡入、分词身份和到达速率等专项回归通过；最终生产预览也验证了后台清理与 pacing 开关。
- `pnpm lint`、修改文件检查、`pnpm typecheck`、core 构建和前后两个生产预览构建通过。
- 包含性能基准的全量测试曾遇到 `prefix-incremental.bench.test.ts` 的 120 秒超时；未调整基准阈值，不能将该全量命令标为通过。
