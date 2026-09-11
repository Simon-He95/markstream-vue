# 将 React Playground 搬到 Solid，并展示本次移植的实际能力

本文件是待执行的目标与验收合同。此次只编写计划，不启动 goal，不实施迁移，不设置默认 token、轮数或时间预算。

## 目标与当前基线

在 `playground-solid/` 交付一个可以独立启动、生产构建和浏览器验证的 Solid playground：保留 React playground 的主要页面、样例和交互，用 Solid 响应式实现，并提供一条可以亲手操作、观察结果的 Solid 特性演示路径。完成意味着页面功能、稳定更新、真实依赖集成和消费方式都有可复现证据，不能以改了品牌、页面能打开或截图正常代替迁移完成。

规划基线为当前 `main` 的 `1f51247eb98615a6c9451fbb5e8ad21c0647ca78`（`feat: add Solid renderer package`），连同前一提交 `df1dade0` 的移植约定；保留 `f808226c` 中快速流式输出自动滚动的修复。开始实施时记录 HEAD 和工作区差异，后续新增提交不自动改变本计划的行为基线。

本次检查到的事实：

- `playground-react18/` 作为页面和交互主基线；`playground-react19/` 复用了前者的 Test Lab、流模拟器、自动滚动、预设及行号检查页，作为补充核对来源，不重复迁移两套应用。
- `packages/markstream-solid/` 已有 renderer、流式 controller、自定义组件、代码块、KaTeX、Mermaid、D2、Infographic、HTML 工具、CSS 和 Worker 导出。能力边界仍遵循 [SOLID_PORTING.md](./SOLID_PORTING.md)：以 Svelte 实际行为为包基线，React 提供页面及共同能力参考。
- 当前版本没有被 Git 跟踪的 `playground-solid/`，`pnpm-workspace.yaml` 也没有登记该目录。Solid 的 `PORTING_STATUS.md` 和 `VERIFICATION.md` 却记录了 `markstream-solid-playground` 构建、浏览器及 hydration 通过。这些历史记录不能充当本次完成证据，须补齐可复现源码、脚本和新运行结果，并澄清记录对应版本。
- Solid 台账仍有部分实现和待验证项目；`render-window` 工具存在，但主渲染器未接入虚拟化。不能宣称完整 React parity、虚拟化已可用或性能优于 React。

## 方法与执行合同

参考 Bun 的 [Rewriting Bun in Rust](https://bun.com/blog/bun-in-rust)：先固定映射与资源所有权，试搬代表性链路，以少量行为变化完成移植；复用行为断言，把编译和运行失败变成队列，独立审查，发现重复错误时修正规则并回查已搬代码。以下是这些原则在本仓库的应用，不照搬其并发规模。

按用户指定的 [write-goal skill](https://github.com/AkaraChen/skills-public/blob/main/write-goal/SKILL.md)，以终态、证据、范围、修复循环和阻塞规则组织目标。写入文件与启动执行分开；本计划不触发提交、发布或部署。

完整迁移交付在独立 Solid 应用中；实施和验收按批次推进。先保持 React 页面结构、输入数据、默认值和交互，再增加 Solid 展示区。不要同时重构其他框架或建立 React runtime 兼容桥。

实施时建立 `playground-solid/PORTING_STATUS.md`。逐项记录源路径与能力、目标路径、API 映射、资源所有权、验证场景、证据和状态；状态限定为待搬运、已实现、已验证、已说明的框架差异、阻塞。每个页面的按钮、设置、路由和样例都要有归属，不能只按文件计数。

## 页面与功能搬运清单

| 来源 | Solid 交付 | 验收要点 |
| --- | --- | --- |
| React 18 `src/App.tsx`、`main.tsx`、`index.css`、`markdown.ts` | 首页 `/`、应用入口、主题与演示内容 | 保留聊天展示、流式操作和设置；明确 Solid 标识；导航、设置持久化、窄屏布局可用 |
| `shared/useStreamSimulator.ts`、`streamPresets.ts` | Solid 流模拟器及原预设 | 保留 balanced、SSE、WebSocket、proxy-buffered、weak-mobile、custom；分片和延迟范围、burstiness、两种 slice 和 transport 模式行为一致；保留随机源注入，支持确定性重放 |
| `shared/useChatAutoScroll.ts` | Solid 自动滚动逻辑 | 快速输出持续贴底；用户上滚后不抢滚动；回到底部恢复跟随；图表增高和暂停恢复不丢失正确状态 |
| `shared/TestLab.tsx`、`test-lab.css` | `/test` 编辑与预览实验室 | 样例、粘贴、流式控制、全屏、主题、URL/hash 分享与恢复、preview 模式和跨框架链接可用 |
| `playground-shared/testLabFixtures.ts`、`testPageState.ts`、`markdownPaste.ts` | 复用纯数据与工具，登记 Solid | 保留 baseline、thinking、diff、stress；新增 Solid 的类型、卡片和本地链接；没有真实部署地址时不得编造公网 origin |
| `components/ThinkingNode.tsx`、`shared/markstreamPlayground.ts` | Solid ThinkingNode 与作用域注册 | 自定义标签中的嵌套 Markdown 持续更新；展开状态不因追加丢失；隔离多个 renderer 的注册和配置 |
| `shared/LineNumberHandoffCheck.tsx` | `/line-number-handoff-check` | 普通 pre 与增强代码块在亮暗主题下行号、对齐和长行滚动正确；沿用源页输入，不把静态对照称为已验证异步切换 |
| `shared/MigrationDemoPage.tsx` | `/migration-demo` 改为 Solid 接入与移植演示 | 保留代码示例布局和导航，展示真实可类型检查的 Solid 用法、流式 accessor、组件注册与 Worker 配置；原 react-markdown 迁移案例注明为 React 专属，不冒充 Solid 迁移工具 |
| React 18/19 的 Vite、TS、CSS 和资源配置 | Solid Vite/JSX 配置、静态资源、workspace 和根脚本 | 独立 JSX 编译；生产构建使用公开包入口；CSS 作用域为 `.markstream-solid`；Worker 产物和深链接可访问 |

登记 React 19 相对 React 18 的可观察差异，有共同能力补充则纳入台账；React hooks、memo、startTransition、StrictMode 本身不构成须搬运的产品能力。不能把 React 专属 renderer 参数照抄进 Solid 后静默忽略。共同能力缺口进入修复队列；确属 React 独有的能力记录来源及理由，不据此扩张 Solid 包目标。

## Solid 展示设计

首页默认载入一段混合 Markdown 流，能直接开始、暂停、继续、停止和重置；用户无需先懂框架细节即可体验。本次移植的重点能力提供可一键载入的样例和简短说明，调试计数置于可展开的观察面板，不占据主要阅读区域。演示说明区分“Markstream 在 Solid 上保留的能力”和“Solid 接入方式”，不把跨框架共用能力宣传为 Solid 独有。

| 展示主题 | 用户操作与可见结果 | 必须留下的证据 |
| --- | --- | --- |
| 稳定流式与结束追平 | 切换网络预设；分别开关 smoothStreaming、typewriter、fade；暂停、继续、提前结束和 reset | 输入与可见输出最终一致；传输结束和显示追平分开；已有文字不整段重新淡入；单测覆盖相关组合与未闭合 Markdown |
| Solid controller 接入 | 独立样例使用 `useSmoothMarkdownStream`，演示 enqueue、pause/resume、finish、flush、reset | 页面读取 `source()`、`visible()`、`pendingChars()`、`caughtUp()`、`final()`；使用外部平滑 controller 时关闭 renderer 的重复平滑；样例类型检查通过 |
| 代码块稳定更新 | 流中选择文字、滚动长代码、追加内容，切换亮暗主题；另有 diff、复制、折叠、字体及 HTML preview 样例 | 普通追加保持 DOM shell、runtime 实例、滚动和选区；语言前缀收敛、code/diff 模式改变的重建条件另列；真实 stream-diffs 参与验证 |
| 自定义组件与响应式 props | ThinkingNode 中追加嵌套 Markdown；同时展示两个配置不同的 renderer，更新主题和局部组件映射 | 内容和配置确实响应更新，实例内交互状态保留，无跨实例污染；owner 卸载后清理注册订阅和私有资源 |
| 图表、公式与 Worker | 同一样例展示 Mermaid、D2、Infographic、行内和块级公式；切换源码/预览、主题，重置或离开页面 | 真实 SVG/KaTeX DOM 与 Worker 资源请求；旧异步结果不能覆盖新输入；错误源码和 peer 缺失有可读降级及恢复路径 |
| 长文和资源生命周期 | 载入 stress、执行完成态批量渲染、流中切换页面再返回 | 页面仍可操作；重复进入退出不积累私有 timer、RAF、observer、订阅、编辑器实例；标注“批量渲染”，不使用“虚拟列表”描述 |
| SSR 与 hydration | 从可重复生成的 SSR 页面进入，再追加流式内容和切换主题 | 同一组件服务端输出与客户端 hydrate，保留服务端节点身份，交互和后续追加正常；无 hydration 错误或挂载替代水合 |

不要求新建 SolidStart 应用；SSR 展示可以是独立的最小 fixture。界面中的控制只绑定实际生效的公开 API。使用缺失 peer 的独立消费 fixture 验证降级，不通过隐藏错误或永远显示源码完成图表演示。

## React 到 Solid 的映射与所有权约定

实施前在 `playground-solid/PORTING.md` 固定下列映射，并为流任务、滚动 observer、Worker、组件注册和编辑器写明创建、更新、取消和销毁位置：

- `useState` 改为 signal 或必要的 store；动态 props 持续通过 `props.x`/accessor 读取，不初始化时解构成快照。事件处理读取最新状态，避免保留旧 source 或旧设置。
- `useMemo` 改为纯派生 memo/accessor；不在派生表达式中创建 Worker、编辑器或订阅。`useCallback`/`memo` 不机械保留；`startTransition` 根据源端用途核对，不能认为 Solid 同名 API 自动等价。
- `useEffect` 按用途拆成响应式 effect、挂载和 cleanup；明确 effect 重跑与组件卸载的区别。不能依赖从 `onMount` 返回函数自动清理，须在正确 owner 中注册 `onCleanup`。
- `useRef` 分成 DOM 引用与普通可变资源句柄；列表根据节点身份选 `For`、`Index` 或稳定槽位，追加不得因新对象导致全树重建。
- 暂停不等于完成；stop、reset、替换输入和离开页面分别取消旧 transport/reader/timer，并保证旧回调不能写回新流。保留 scheduler 与 ReadableStream 两种实现的可观察语义。
- 模拟器中的纯算法、预设和样例可以带来源复制或最小提取；不能从带 React import 的 hook 模块间接引入 React。直接复用现有 `playground-shared` 纯工具，避免借机扩建共享架构。
- Worker 在浏览器生命周期内创建，应用共享资源由明确的统一 owner 管理；单个演示组件卸载不终止其他组件仍在使用的 Worker。浏览器全局与 localStorage 的访问不能破坏 SSR。

## 实施队列与检查关卡

1. **基线与台账**：盘点全部页面、设置、样例和测试；完成 `PORTING.md` 与能力台账。复核历史 Solid 验证记录的源码缺失，记录源端失败与已知差异，固定后续对照输入。
2. **骨架与三条试搬链路**：新增 workspace 包 `markstream-solid-playground`、Vite Solid 插件、CSS、路由及 scripts。先试搬“模拟器到 renderer 的流式链路”“ThinkingNode 嵌套与作用域”“长代码追加与自动滚动”，验证动态 props、final、实例身份和取消，再扩大到所有页面。
3. **完整页面搬运**：按前述清单完成首页、Test Lab、行号检查和 Solid 接入页；复用共享 fixture，逐项确认默认值、持久化、分享链接、浏览器前进后退及直接打开深链接。保持 React 18/19 原有行为。
4. **特性展示与必要修复**：补齐 Solid 样例、观察面板和 SSR fixture。演示暴露的 Solid 共同能力缺陷可在包内做最小修复并增加回归；同步对应台账，不用 UI 绕过 renderer 缺陷。
5. **失败队列与审查**：按根因整理类型、构建、行为、浏览器失败，每项保存复现、修复位置及重验结果。每批分别审查源行为遗漏和 Solid 响应式/生命周期错误；如执行环境具备独立审查者，采用一个实现者和两个独立审查上下文，审查者只找问题，修复回到实现者。未执行独立审查须如实记录，不标记通过。反复出现的错误先修订映射规则，再搜索全部已搬模块。
6. **交付验收**：运行最终检查、生产预览、打包消费和浏览器场景，生成 `playground-solid/VERIFICATION.md`，关联每个已验证条目的日志、测试或截图。清空未搬运、未验证和本次回归队列后停止。

如并行实施，必须明确文件归属，共享配置和集成检查由一个负责人处理；不得使用 stash/reset 等操作互相覆盖修改。此计划本身不启动任何 agent 或实现任务。

## 完成条件与验证命令

以下命令中，Solid 包命令已经存在；playground 的 scripts 和根入口属于待新增交付。执行者必须核实 filter 确实匹配包，不能把“未找到项目”或“无测试”视为通过。

```sh
# 已有 Solid 包检查；build 为 SSR 和生产消费准备产物
pnpm --filter markstream-solid typecheck
pnpm --filter markstream-solid test
pnpm --filter markstream-solid build
pnpm --filter markstream-solid test:ssr

# 待新增的 playground 检查与 fixture
pnpm --filter markstream-solid-playground typecheck
pnpm --filter markstream-solid-playground test
pnpm --filter markstream-solid-playground build
pnpm --filter markstream-solid-playground hydration:generate

# 待新增的统一入口
pnpm play:solid
pnpm play:solid:build
pnpm play:solid:preview

# 最终仓库回归，测试使用一次性运行
pnpm lint
pnpm typecheck
pnpm exec vitest run
```

`dev`/`preview` 是常驻服务，验收其就绪、页面行为和资源加载，不要求自然退出。最终报告写出实际端口、浏览器版本、运行命令、退出码、测试数、失败归因和证据路径；本文件列命令不表示它们已经执行。

只有以下条件全部满足才可报告完成：

- **完整度**：台账覆盖所有来源页面与可观察交互；必需能力待搬运、待验证和未解决回归数均为零。框架差异有具体来源及理由，不能将难以实现的共同能力改名为差异。
- **行为测试**：复用 `test/react-playground-stream-simulator.test.ts`、`test/react-playground-stream-behavior.test.tsx`、`test/playground-react-live-preview-config.test.ts` 和相关流式回归的输入与有效断言，换用 Solid 挂载层。新增确定性分片、final/reset、取消、自动滚动及 scoped component 用例；不只检查源码字符串或复制实现逻辑作为断言。
- **浏览器证据**：在真实依赖下走完展示表中的操作；首页、Test Lab、接入页和行号页具有桌面亮暗主题及窄屏截图，导航和分享往返可用。无本次引入的未处理异常、失败 Worker 请求、hydration 错误或持续 fallback。截图与 DOM/runtime 计数配合使用，截图本身不能证明复用和清理。
- **SSR 可复现**：服务端和客户端使用同一 fixture，生成及 hydration 脚本在仓库中，使用 Solid 所需 hydration bootstrap；浏览器检查水合前后节点身份及水合后追加，不只检查服务端字符串输出。
- **生产与打包消费**：production build 通过公开 `markstream-solid`、CSS 和 Worker 子路径消费，不使用源码 alias 掩盖导出问题；另从新打包 tarball 安装到隔离消费者，验证有 peers/缺 peers 两种配置。所需未发布 workspace 依赖也本地打包安装，脚本可重跑，不依赖历史 `/tmp` 目录。
- **仓库回归**：最终相关检查退出 0，React 18/19 和共享工具没有新回归。若共享文件变动，验证两个 React playground 的生产构建并按仓库要求 sanity-check 原 playground。既有失败须在基线复现并证明无新增失败；无法归因时保持未完成。
- **文档一致**：README 写明启动、构建、预览、页面入口和演示操作；新台账和验证报告完整；Solid 包历史报告中无法从仓库复现的陈述已标注历史状态，并链接新的可复现证据，不静默沿用旧“通过”。

性能记录代表性长文和流式体验、实例创建/销毁及明显卡顿，不设“比 React 快多少”的门槛，也不凭单次测量作性能宣传。

## 工作边界与停止规则

允许修改 `playground-solid/`、必要的 Solid 包缺陷、对应测试/脚本/文档、workspace/锁文件/根 scripts，以及共享 playground 工具中 Solid 登记和复用必需的最小调整。保留既有 [GOAL.md](./GOAL.md) 的包移植目标，本计划不将其中未完成项目一律扩大为此次 playground 工作。

不重构 Vue/React/Svelte 或 parser/core 架构，不引入 React/Svelte runtime 依赖，不新建无关服务，不实现 React 独有能力或虚拟化。不得删减有效断言、跳过失败测试、关闭类型检查、忽略 props、伪造计数或用永久 fallback 制造通过。不覆盖用户修改，不执行破坏性 Git 操作；提交、推送、发布、部署和发送外部消息不在本目标内。

普通实现错误和测试失败继续进入修复循环；修复后先重跑受影响检查，最终再统一回归，已通过且未受影响的检查无需反复执行。完成条件全部有证据后停止并报告修改范围、结果和已说明的差异，不继续增加展示功能。

遇到缺失权限、无法取得的依赖、不可用外部服务或必须突破上述范围的问题，先保存最小复现并完成独立可做的工作；没有剩余可推进工作时，报告具体阻塞、未完成队列和需要的输入，停止等待方向。不得把外部阻塞、历史报告或尚未运行的检查写成完成，不无限重试同一失败命令。
