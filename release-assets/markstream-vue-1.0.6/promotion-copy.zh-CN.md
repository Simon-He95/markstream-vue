# markstream-vue 1.0.6 推广文案

## 首发文案（微博 / X / 即刻）

markstream-vue 1.0.6 发布了 ⚡

这次不讲“体感优化”，直接上同机、同夹具、同参数的 5 次中位数：

- 重内容会话恢复：主线程工作量 **-74.5%**
- DOM 节点：**-60.0%**
- 峰值 JS 堆内存：**-59.3%**
- 长任务总时长：**-78.1%**
- TypeScript 代码流追帧时间：**-20.4%**

核心变化是让长会话恢复“先渲染你看得见的”：自动虚拟化长文档，代码、图片、KaTeX、Mermaid、D2、Infographic 等重节点进入视口附近再加载；同时重做了流式批调度、解析节点复用，以及代码 / diff / Monaco 的稳定交接。

升级：`pnpm add markstream-vue@1.0.6`

Release：https://github.com/Simon-He95/markstream-vue/releases/tag/markstream-vue%401.0.6

注：74.5% 是 95 节点重内容会话“初始未滚动恢复”专项基准，不是所有 Markdown 场景的统一加速倍数。

## 长文案（掘金 / V2EX / GitHub Discussion）

markstream-vue 1.0.6 的重点不是再堆一个配置，而是减少用户看到首屏之前不该发生的工作。

在 1.0.5 中，恢复一段很长的 AI 会话时，视口外的代码、图片、数学公式、Mermaid 和 Infographic 也可能提前挂载、加载和增强。1.0.6 会在 `chat` / `minimal` 的长文档最终态自动收紧渲染窗口，并让重节点按视口优先级工作。

同一台 Apple M1 Pro、同一套 1.0.6 测试夹具分别加载两个 tag 源码，Chrome 4× CPU 限速，5 次中位数：

| 指标 | 1.0.5 | 1.0.6 | 变化 |
| --- | ---: | ---: | ---: |
| 初始恢复主线程工作量 | 1579.5 ms | 402.1 ms | **-74.5%** |
| DOM 节点 | 583 | 233 | **-60.0%** |
| 峰值 JS 堆内存 | 43.0 MB | 17.5 MB | **-59.3%** |
| 长任务总时长 | 1218 ms | 267 ms | **-78.1%** |

代码密集的流式场景也有收益：TypeScript fence 的追帧时间从 381.2 ms 降到 303.6 ms（-20.4%），主线程工作量下降 18.1%。常规 14–35 KB 文档的累计流式解析时间下降约 5.7%–8.9%。

这次还修复了流式代码块 / diff 高度抖动、Monaco 交接、未完成 fence language、数学与 Mermaid 中间态、虚拟时间线恢复身份，以及 CJK 强调符等问题。

边界也说清楚：纯文本流式主线程指标在本次测试里基本持平，超大 CHANGELOG 的累计流式解析也基本持平。1.0.6 最大的收益来自长会话恢复、视口外重内容和代码密集流。

安装：`pnpm add markstream-vue@1.0.6`

完整 Release：https://github.com/Simon-He95/markstream-vue/releases/tag/markstream-vue%401.0.6

## 英文短文案

markstream-vue 1.0.6 is out ⚡

Measured on the same source-level harness, five-run median, Chrome at 4× CPU throttle:

- Heavy restore main-thread work: **-74.5%**
- DOM nodes: **-60.0%**
- Peak JS heap: **-59.3%**
- Long-task time: **-78.1%**
- TypeScript-fence catch-up: **-20.4%**

Long restored chats now keep the node window bounded and defer offscreen code, images, math, Mermaid, D2, and Infographic work until it approaches the viewport. Streaming parser reuse, render batching, and code/diff/Monaco handoff are also tighter.

`pnpm add markstream-vue@1.0.6`

https://github.com/Simon-He95/markstream-vue/releases/tag/markstream-vue%401.0.6

Heavy-restore numbers cover the initial unscrolled 95-node benchmark, not every Markdown workload.

## 配图文案

- 主标题：`markstream-vue 1.0.6`
- 副标题：`HEAVY RESTORE, REWRITTEN.`
- 数据 1：`MAIN-THREAD WORK −74.5%`
- 数据 2：`DOM NODES −60.0%`
- 数据 3：`PEAK HEAP −59.3%`
- 角标：`5-RUN MEDIAN · CHROME 4× CPU`
- 图片替代文本：`雷姆站在流式代码与 Markdown 卡片之间，markstream-vue 1.0.6 的三项重内容恢复基准数据分别为主线程工作量下降 74.5%、DOM 节点下降 60.0%、峰值堆内存下降 59.3%。`
