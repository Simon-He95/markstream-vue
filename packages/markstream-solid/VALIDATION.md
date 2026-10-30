# Solid 验证记录

关联 Issue：[#799](https://github.com/Simon-He95/markstream-vue/issues/799)。日期：2026-10-30。功能对照见 [PARITY.md](./PARITY.md)。

## 功能与打包

| 检查 | 结果 |
| --- | --- |
| Vue 3 公开 API 对照 | 181 个运行时导出对应项、10 组组件/渲染器属性契约通过 |
| Solid 客户端单元测试 | 11 个文件，85 个测试通过 |
| Solid SSR 单元测试 | 3 个测试通过 |
| 公共 core 单元测试 | 8 个文件，103 个测试通过 |
| Vue 3 / Solid pre → highlight 几何交接 | wrap / scroll、首次导航 / 刷新、窄屏、明暗主题全部通过 |
| 原仓库全量测试 | 393 个文件，3,532 个测试通过（限并发完整运行） |
| 根目录及 Solid 类型检查、根库构建 | 通过 |
| Solid browser/node 构建、声明、CSS、worker/utils/tailwind 子路径 | 通过 |
| tarball 独立安装、外部 TSX 消费者及 SSR | 通过；临时消费者没有 Vue/React，也没有安装可选 peers |
| Solid playground 生产构建 | 通过 |
| 生产浏览器完整功能回归 | 通过；包含真实 worker、选区、完整播放和源码视图 |
| 组件样式逐项对照 | 43 个用例 × 25 项计算属性 × 4 个状态，共 4,300 项一致 |
| Docs | 中英指南、框架入口、playground 导航、LLM 文档、构建及 SEO 输出检查通过 |
| peer dependencies、frozen lockfile | 通过 |
| 仓库 lint | 排除本地已有的未跟踪 analysis/、video/ 目录后通过；本次没有修改这些目录 |

仓库全量测试使用限并发运行。共享样式提取改变了内联 CSS 属性顺序，相应更新一个代码块快照；移除 lazy measurement chunk 后，将旧的源码字符串检查替换为实际的 rAF 合并、卸载取消及旧回调行为测试。没有放宽几何交接断言。完整命令为：

```bash
pnpm exec vitest --run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000
```

jsdom 对旧高度估算器的 Canvas getContext 打印未实现提示，但最终测试通过。生产构建包含可选图表/语法语言的大资源 chunk 提示，不能把这些体积直接视作库入口开销。

## 回归场景

- 与 Vue 3 共用聊天页 CSS、速度面板 CSS、主题列表、Markdown 样例与分片采样算法；实际操作品牌/代码主题、HTML policy、TPS/两种随机传输、源码编辑/恢复及手机端深色设置。
- 代码头的 padding/gap、Material 图标、26px 按钮，pre/highlight 的字体、行高、tab size、gutter、滚动条及 wrap/scroll。首批节点立即渲染；实测换行交接首字符横向差约 0.03px、纵坐标相同，切换前后块高度均为 383px（本机）。
- 共用 ReadableStream 的 1 字符 Unicode 分片回归；修复 UTF-16 代理对被拆开编码时 emoji 损坏的问题。
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

Chrome 156.0.8078.49，1440 × 1000。原始记录时间：2026-10-30T13:46:59.443Z。生产构建中 Vue 3 / Solid 使用相同 parser、语料和渲染选项，完整加载 Vue 基础 CSS，并分别配置 KaTeX/Mermaid workers 和匹配的高亮池；可选集成在 playground 中 dedupe 为同一依赖实例。预热 1 轮、测量 3 轮，交替框架顺序后取中位数。

普通恢复语料是 250 个章节、1,000 个顶层节点、40,478 字符；普通流式使用 12 个章节、每帧追加 128 字符。长历史追加先渲染这 1,000 个节点，种子恢复不计时，然后继续追加尾部。重内容包含真实代码高亮、diff、KaTeX 和 Mermaid，等待相应 DOM 目标出现。D2/infographic 做了真实浏览器功能验证，未将它们的渲染耗时纳入比较表。

禁用 fade、smooth pacing 和视口推迟。普通代码使用 pre 路径并保留与 Vue 3 对应的代码头/复制/行号；窗口场景只启用节点窗口。原 restore-batched 场景保留 batchRendering=true / final=true / maxLiveNodes=0；Vue 3 此时立即恢复全文，Solid 已对齐。新增 restore-progressive 在双方同时启用 virtualScroll 协调，让双方真正分批；完成判断统计实际 node-content，而非含占位符的 node-slot，并断言各批合计全部 1,000 节点。总耗时包含帧间等待及异步目标等待，并非纯 CPU 或网络吞吐。帧间隔通过独立 rAF 采样，长任务阈值是浏览器 Long Tasks API 的 50 ms。DOM 元素统计是 light DOM，不包含编辑器 shadow DOM。

| 场景 | 总耗时 ms（Vue 3 / Solid） | 更新 P95 ms（Vue 3 / Solid） | 帧间隔 P95 ms（Vue 3 / Solid） | 长任务次数（Vue 3 / Solid） |
| --- | --- | --- | --- | --- |
| 全量立即恢复 | 242.3 / 219.8 | 180.7 / 206.6 | 242.2 / 217.8 | 1 / 1 |
| 64 节点窗口恢复 | 55.5 / 24.2 | 51.8 / 22.3 | 53.2 / 23.8 | 1 / 0 |
| 开启 batch 的完成态恢复（原场景） | 246.8 / 218.8 | 235.8 / 206.1 | 246.8 / 216.6 | 1 / 1 |
| 外层协调下真正分批恢复 | 727.8 / 400.0 | 61.9 / 17.0 | 20.9 / 18.6 | 1 / 0 |
| 普通流式更新 | 266.2 / 265.9 | 3.9 / 2.9 | 17.6 / 17.4 | 0 / 0 |
| 重内容恢复 | 33.5 / 33.9 | 3.1 / 3.4 | 22.6 / 17.7 | 0 / 0 |
| 重内容流式更新 | 117.2 / 116.0 | 2.0 / 1.9 | 21.5 / 17.6 | 0 / 0 |
| 1,000 节点历史后继续追加 | 139.2 / 154.5 | 58.5 / 37.3 | 61.4 / 45.1 | 1 / 0 |

完成态恢复不再误走分批。真正分批采用与 Vue 3 一致的预算阈值和批量上下限；移除 idle 后的额外定时器。表中保留所有场景的实测结果；同步更新、帧间隔和端到端耗时是不同指标，不能据此宣称任意输入都更快。布局包装层、调度与框架运行时不同，DOM 元素数也不同。

初次加入长历史追加测试时触发了回归阈值。CPU 采样显示主要开销是稳定历史节点重复参与响应式传播，解析只占少部分；修复包括解析配置去重、结构相同节点复用、每个逻辑索引的 memo 及细粒度 store context。新增引用回填和稳定前缀更新测试，避免复用造成旧内容。浏览器更新回归阈值为 `max(100ms, Vue 3 P95 × 2)`；内容、DOM/实例复用和活动节点上限独立断言。

原始数据和截图位于仓库根目录 `.tmp/solid/performance.json`、`.tmp/solid/measurements.json`、`.tmp/solid/playground.png`、`.tmp/solid/parity.png`，由测试生成且被 git 忽略。本页保存本轮摘要；本轮完整原始数据另存为 [benchmarks/performance.json](./benchmarks/performance.json)。

## 重复执行

```bash
pnpm --filter markstream-solid typecheck
pnpm test:solid
pnpm test:smoke:solid
pnpm test:e2e:solid-playground
pnpm test:e2e:line-number-handoff-playgrounds --framework=vue3,solid
CODE_OVERFLOW=scroll pnpm test:e2e:line-number-handoff-playgrounds --framework=vue3,solid
pnpm typecheck
pnpm exec vitest --run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000
pnpm exec eslint . --cache --ignore-pattern 'video/**'
pnpm run check:peer-deps
```

Vue 的插件、事件、slots 与 ref 使用 Solid 的 provider、回调、JSX/render props 和 accessor 绑定方式，详见对照清单。

## 本次恢复与滚动修复

上轮生产记录中 Solid restore-batched 为 799.5 ms，Vue 3 为 237.6 ms；默认播放记录两次回退（32px、12px）。[修复前性能原始数据](./benchmarks/performance-before-restoration-fix.json) 保留这组基线。逐帧开发诊断进一步区分 JSON diff 折叠、plain pre/highlight 空行交接以及 Mermaid 源码/预览上限不一致，见 [诊断记录](./benchmarks/scroll-diagnosis-before.json)；开发诊断的时间和事件数不与生产指标混用。

代码体只保留真实展示过的流式测量高度，受到 maxHeight 限制，内容替换、字体/主题和用户展开/折叠时释放；没有改动共享滚动手势检测或放宽性能阈值；输入 final 后仍继续响应内容尺寸变化，直到平滑渲染收尾，完成时检查底部距离不超过 1px。完成态与分批条件对齐 Vue 3 后，原场景和新增真正分批场景一起复测。额外的 Image failed 并非网络图片本身：标题 `## Image` 被错误地按 tag 分派给自定义图片组件，生成空地址图片。现仅 HTML 节点走 tag 匹配，普通标题/段落和 typed 自定义节点保留原类型，并覆盖单字符 streaming。示例图片复用静态 SVG 与随共享语料打包的 Vue PNG，浏览器检查实际解码尺寸；不再依赖远程图床。

## 完整播放、组件与 worker

组件、worker、样式与调度问题的定位记录见 [COMPONENT_VALIDATION.md](./COMPONENT_VALIDATION.md)。逐项原始结果见 [component-styles.json](./benchmarks/component-styles.json)，worker 消息见 [workers.json](./benchmarks/workers.json)，播放轨迹见 [playback.json](./benchmarks/playback.json)。

连续三轮默认完整播放均为零滚动回退，完成时底部距离不超过 1px，且两张图实际解码为 128×128 和 400×400。rAF 帧间隔 P95 依次为 18.3 / 18.6 / 18.0 ms；最大长任务为 65 / 0 / 0 ms。三轮轨迹保存在 [playbacks.json](./benchmarks/playbacks.json)，组件摘要保存于 [component-validation.json](./benchmarks/component-validation.json)。标题 Image 的错误路由修复前 DOM 见 [image-diagnosis-before.json](./benchmarks/image-diagnosis-before.json)。

本轮同场景 restore-batched 的 Solid 中位耗时由 799.5 ms 降至 218.8 ms（本轮 Vue 3 为 246.8 ms）。新增真正分批场景 Vue 3 / Solid 为 727.8 / 400.0 ms，更新 P95 为 61.9 / 17.0 ms；每个框架每轮均断言分批增量合计 1,000 节点。恢复门禁收紧为 `max(300ms, Vue 3 × 1.5)`，原有更新 P95 门禁保持不变。立即恢复依然可能产生长任务，需短帧时应使用真正分批或节点窗口。

## Virtual timeline 入口回归

真实点击 1,000 条 Markdown 消息的 Virtual timeline 时，restoreState 的 effect 调用了读取 metrics / offsets 又写入高度 revision 的恢复函数，意外订阅了它自己写回的信号，循环触发直到栈溢出。heightCache 恢复路径具有相同问题。现在恢复操作置于 untrack 中，仅外部传入的状态/触发项/缓存变化触发 effect；外部状态继续更新和正常测量仍生效。

新增已知宽度 640px 的单测，在修复前稳定抛出 Maximum call stack size exceeded；修复后状态和独立高度缓存都能应用，并继续接受新状态及测量。此前 jsdom 的零宽度和普通 user-message 时间线没有覆盖这条 Markdown 状态恢复路径。

生产浏览器分别在 streaming 和 restore 完成后真实点击进入、滚到 Message 999、返回 Message 0、退出，并验证页面保持响应。两轮首尾分别只挂载 18 / 20 条消息，没有浏览器错误。82 个客户端测试、3 个 SSR 测试、类型检查、打包消费者与完整生产浏览器回归通过。原始数据见 [timeline.json](./benchmarks/timeline.json)，截图见 [timeline.png](../../playground-solid/screenshots/timeline.png)。

全量复测还捕获一条独立的共享 parser 前缀歧义：脚注定义尚未收到冒号时，`[^1]` 暂时成为 math_block，随后转成 footnote，可出现约 8–11px 收缩。这与本次时间线递归无关；后续三轮完整回归通过，但不能据此排除该偶发分片情形。诊断轨迹见 [footnote-prefix-rollback.json](./benchmarks/footnote-prefix-rollback.json)。本次没有改动共享 parser 的数学语法。

## 嵌套引用样式回归

以 Vue 3 为基线，同一三层引用在 Solid 中曾都是 28px 高；原因是缺少复杂引用内容的布局容器，父子外边距折叠。现在复杂引用使用 content containment，单段落继续直接渲染，并复用移入 core 的既有简单行内识别函数。没有增加 NodeRenderer 实例、额外解析或复制 Vue 的判断逻辑。

桌面原例三层高度对齐为 108 / 68 / 28px；各层带段落为 220 / 124 / 28px；引用内含列表为 120px，简单段落仍为 28px。新增三项单测覆盖复杂/简单布局、自定义段落、streaming 身份及内容恢复。全仓 3,532 测试、Solid 85 + 3 测试、core 103 测试、Vue/Solid 构建和类型检查通过。

浏览器逐层比较 x/y、宽度与高度，允许 0.1px 舍入误差；覆盖 4 个样例 × 桌面/窄屏 × 明/暗主题，并断言纯三层引用的边框逐层缩短。额外验证流式追加和最终收尾保留原 blockquote 元素。修复前几何见 [blockquote-before.json](./benchmarks/blockquote-before.json)，当前结果见 [blockquote-geometry.json](./benchmarks/blockquote-geometry.json)。
