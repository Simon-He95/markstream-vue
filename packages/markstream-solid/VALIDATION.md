# Solid 验证记录

关联 Issue：[#799](https://github.com/Simon-He95/markstream-vue/issues/799)。日期：2026-10-30。功能对照见 [PARITY.md](./PARITY.md)。

## 功能与打包

| 检查 | 结果 |
| --- | --- |
| Vue 3 公开 API 对照 | 181 个运行时导出对应项、10 组组件/渲染器属性契约通过 |
| Solid 客户端单元测试 | 7 个文件，63 个测试通过 |
| Solid SSR 单元测试 | 3 个测试通过 |
| 原仓库全量测试 | 392 个文件，3,528 个测试通过（限并发完整运行） |
| 根目录及 Solid 类型检查 | 通过 |
| Solid browser/node 构建、声明、CSS、worker/utils/tailwind 子路径 | 通过 |
| tarball 独立安装、外部 TSX 消费者及 SSR | 通过；临时消费者没有 Vue/React，也没有安装可选 peers |
| Solid playground 生产构建 | 通过 |
| 生产浏览器完整功能回归 | 通过 |
| peer dependencies、frozen lockfile | 通过 |
| 仓库 lint | 排除任务开始前已有的未跟踪 video/ 目录后通过；本次没有修改该目录 |

默认并发的仓库测试首轮出现动态导入错误及超时；失败的 10 个文件限并发复跑后 287 个用例通过，随后完整限并发运行的 3,528 个用例全部通过。未修改旧测试或 Vue 库源码来放宽断言。完整命令为：

```bash
pnpm exec vitest --run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000
```

jsdom 对旧高度估算器的 Canvas getContext 打印未实现提示，但最终测试通过。生产构建包含可选图表/语法语言的大资源 chunk 提示，不能把这些体积直接视作库入口开销。

## 回归场景

- 1 / 7 / 64 / 1024 字符分片，与直接 final 渲染比较；覆盖中英文、emoji、格式化文本、列表、表格、链接及未闭合围栏。
- 非追加替换、清空、全量恢复后续流、重复 final、平滑流收尾、simple/precise 光标收尾及卸载清理。
- 根、段落、文本、代码 DOM 引用复用；编辑器实例增量更新；已完成代码块不因后续段落重复更新。
- 原生代码头、复制反馈及异步 clipboard writer、折叠/展开、字体、主题、行号、split/unified diff、按钮和宽度开关、HTML/SVG artifact 回调、具名头部的 Solid render props。
- HTML iframe 的默认 sandbox 阻止脚本，显式 allow-scripts 能执行；自定义 sandbox 优先；动态 srcdoc、Escape/关闭与 Portal 清理。
- 真实 KaTeX、Mermaid、D2、infographic、stream-diffs；图表 source/preview、SVG 可见尺寸、缩放、平移、全屏、SVG 下载及保留旧预览直到新结果可用。
- 3,000 节点加载后立即到末尾、返回顶部；活动节点保持 64 以内；禁用窗口后全量恢复全部 3,000 个节点。
- 文档虚拟状态/高度缓存往返；未知宽度等待恢复、结构签名变化拒绝旧缓存、晚到高度变化保持底部锚点、用户滚走后释放锚点。
- 外层会话列表窗口和导航、线程隔离、旧回调拦截、测量 key 不兼容拒绝恢复、loading cap 和卸载时的任务清理。
- provider 级组件、翻译、图标隔离；自定义块级提示；语言别名/重型组件自定义优先级和属性转发；后续引用定义更新此前链接。
- 服务端完整输出；100 段 HTML hydration 保持根 DOM，再继续追加。

## 性能方法

Chrome 156.0.8078.49，1440 × 1000。原始记录时间：2026-10-30T08:30:17.108Z。生产构建中 Vue 3 / Solid 使用相同 parser、语料和渲染选项；可选集成在 playground 中 dedupe 为同一依赖实例。预热 1 轮、测量 3 轮，交替框架顺序后取中位数。

普通恢复语料是 250 个章节、1,000 个顶层节点、40,478 字符；普通流式使用 12 个章节、每帧追加 128 字符。长历史追加先渲染这 1,000 个节点，种子恢复不计时，然后继续追加尾部。重内容包含真实代码高亮、diff、KaTeX 和 Mermaid，等待相应 DOM 目标出现。D2/infographic 做了真实浏览器功能验证，未将它们的渲染耗时纳入比较表。

禁用 fade、smooth pacing 和视口推迟。普通代码使用 pre 路径并保留与 Vue 3 对应的代码头/复制/行号；窗口、分批场景仅分别启用相应选项。总耗时包含帧间等待及异步目标等待，并非纯 CPU 或网络吞吐。帧间隔通过独立 rAF 采样，长任务阈值是浏览器 Long Tasks API 的 50 ms。DOM 元素统计是 light DOM，不包含编辑器 shadow DOM。

| 场景 | 总耗时 ms（Vue 3 / Solid） | 更新 P95 ms（Vue 3 / Solid） | 帧间隔 P95 ms（Vue 3 / Solid） | 长任务次数（Vue 3 / Solid） |
| --- | --- | --- | --- | --- |
| 全量立即恢复 | 257.7 / 181.6 | 197.5 / 168.6 | 257.7 / 178.9 | 1 / 1 |
| 64 节点窗口恢复 | 51.9 / 22.3 | 48.2 / 20.2 | 49.4 / 21.8 | 0 / 0 |
| 分批恢复 | 247.3 / 766.6 | 237.0 / 15.4 | 247.3 / 17.7 | 1 / 0 |
| 普通流式更新 | 266.5 / 266.4 | 4.2 / 3.2 | 17.5 / 17.4 | 0 / 0 |
| 重内容恢复 | 33.6 / 33.2 | 3.3 / 3.0 | 21.2 / 19.4 | 0 / 0 |
| 重内容流式更新 | 116.8 / 116.3 | 2.0 / 1.8 | 17.5 / 17.7 | 0 / 0 |
| 1,000 节点历史后继续追加 | 148.9 / 189.1 | 61.8 / 38.5 | 64.5 / 42.0 | 1 / 0 |

立即恢复和窗口恢复在本机语料中 Solid 耗时较低；分批恢复的完整落地时间更长，但首次更新和帧间隔更短，并避免了本轮的长任务。长历史追加的 Solid 更新 P95 较低，但端到端耗时并非所有场景都更短，不能宣称全面更快。布局包装层、调度与框架运行时不同，DOM 元素数也不同。

初次加入长历史追加测试时触发了回归阈值。CPU 采样显示主要开销是稳定历史节点重复参与响应式传播，解析只占少部分；修复包括解析配置去重、结构相同节点复用、每个逻辑索引的 memo 及细粒度 store context。新增引用回填和稳定前缀更新测试，避免复用造成旧内容。浏览器更新回归阈值为 `max(100ms, Vue 3 P95 × 2)`；内容、DOM/实例复用和活动节点上限独立断言。

原始数据和截图位于仓库根目录 `.tmp/solid/performance.json`、`.tmp/solid/measurements.json`、`.tmp/solid/playground.png`、`.tmp/solid/parity.png`，由测试生成且被 git 忽略。本页保存本轮摘要。

## 重复执行

```bash
pnpm --filter markstream-solid typecheck
pnpm test:solid
pnpm test:smoke:solid
pnpm test:e2e:solid-playground
pnpm typecheck
pnpm exec vitest --run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000
pnpm exec eslint . --cache --ignore-pattern 'video/**'
pnpm run check:peer-deps
```

Vue 的插件、事件、slots 与 ref 使用 Solid 的 provider、回调、JSX/render props 和 accessor 绑定方式，详见对照清单。
