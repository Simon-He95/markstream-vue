# Solid Playground 实施交接

更新时间：2026-09-10。此文件供之后接手的 agent 使用，不表示已开始实施或已完成验证。

## 接手任务

将 React playground 搬到 `playground-solid/`，并通过真实可操作的样例展示本次 Solid renderer 移植的能力。完整范围、完成条件及停止规则以 [GOAL-PLAYGROUND.md](./GOAL-PLAYGROUND.md) 为准；本文件解释从哪里开始、怎样推进，以及前一轮已经查明的事项。

用户本轮只要求编写计划与交接文件。请根据接手时用户的指令行动：用户要求实施时，直接按目标推进；仅要求阅读或评审时，不自动实现。目标文件开头的“此次只编写计划”描述编写时的状态，不应被误读为禁止用户以后授权实施。普通实施不必先启动 goal mode；如要启动，遵循接手环境的授权规则。

## 当前状态：已完成什么、没有做什么

- 仓库：`/home/akrc/Developer/markstream`；写交接时分支为 `main`，HEAD 为 `1f51247eb98615a6c9451fbb5e8ad21c0647ca78`，提交标题为 `feat: add Solid renderer package`。
- 前两项相关提交：`df1dade0` 写入 Solid 包移植目标和交接；`f808226c` 修复快速流式输出时自动滚动贴底。搬运时保留该滚动行为。
- 已检查 React 18/19 页面结构、共享模块、Solid 公开接口、主要流式实现、移植台账与历史验证报告；已编写 `GOAL-PLAYGROUND.md`。
- 写本文件前 `git status --short` 只有未跟踪的 `GOAL-PLAYGROUND.md`；本文件也是新交付。没有提交、推送或更改实现文件。接手后重新检查，不能假定工作区仍是此状态，也不要删除这些未跟踪文档。
- 当前提交没有被跟踪的 `playground-solid/`，workspace 未登记该目录。没有启动 dev server、安装依赖或运行应用测试；前一轮只检查了文档格式和改动范围。
- 现有 Solid 包测试的通过情况来自历史报告，本轮没有重新执行，不能作为接手后的验证结果。

## 先读这些文件

按顺序阅读，重点避免把包移植和 playground 迁移混为同一项无限扩大的工作：

1. 根目录 `AGENTS.md` 及待修改目录下适用的指令。
2. [GOAL-PLAYGROUND.md](./GOAL-PLAYGROUND.md)：本任务的完整验收合同。
3. [SOLID_PORTING.md](./SOLID_PORTING.md)：包的行为基线、响应式映射和稳定更新约束。开头仍有准备阶段的历史措辞，实际进度须对照源码。
4. [Solid 移植台账](./packages/markstream-solid/PORTING_STATUS.md)、[历史验证报告](./packages/markstream-solid/VERIFICATION.md)、包 `package.json`、`src/index.ts`：核实真实 API、scripts 和分发入口。
5. [GOAL.md](./GOAL.md)：仅用于了解包移植背景；不要把其中所有遗留项目无条件纳入本任务。

方法来源是 [Bun 的移植文章](https://bun.com/blog/bun-in-rust)。已有目标按用户指定的 [write-goal skill](https://github.com/AkaraChen/skills-public/blob/main/write-goal/SKILL.md) 编写；实施者无需先重写目标或重新询问已经明确的范围。

## 源码导航与已确定的选择

| 要做的事 | 从哪里读 | 如何处理 |
| --- | --- | --- |
| 页面与应用骨架 | `playground-react18/src/App.tsx`、`main.tsx`、`index.css`、`markdown.ts` | React 18 是主基线，保留布局、样例和交互，换成 Solid 实现 |
| React 19 补充核对 | `playground-react19/src/App.tsx`、`main.tsx` | 它复用了 React 18 的 shared 模块；只登记并补充可观察差异，不搬两份应用 |
| 流式状态机 | `playground-react18/src/shared/useStreamSimulator.ts`、`streamPresets.ts` | 保留随机源注入、预设、分片、暂停/继续/取消语义；纯算法与 React hooks 分开 |
| 自动滚动 | `playground-react18/src/shared/useChatAutoScroll.ts` | 保留快速流贴底、用户上滚退出跟随、回底恢复以及内容增高处理 |
| Test Lab | `playground-react18/src/shared/TestLab.tsx`、`test-lab.css` | 搬到 `/test`，保留编辑、分享、预览、全屏及流设置 |
| 共享数据与链接 | `playground-shared/testLabFixtures.ts`、`testPageState.ts`、`markdownPaste.ts` | 复用纯工具并登记 Solid；不要编造不存在的线上域名 |
| 自定义节点 | `playground-react18/src/components/ThinkingNode.tsx`、`shared/markstreamPlayground.ts` | Solid 组件及隔离注册，验证嵌套 Markdown 和交互状态保留 |
| 行号检查 | `playground-react18/src/shared/LineNumberHandoffCheck.tsx` | 保留 `/line-number-handoff-check` 和原输入；源页是静态对照，不足以证明异步交接 |
| 接入说明页 | `playground-react18/src/shared/MigrationDemoPage.tsx` | 保留 `/migration-demo` 入口和代码展示布局，内容改成可验证的 Solid 接入示例 |
| Solid 流式 API | `packages/markstream-solid/src/composables/useSmoothMarkdownStream.ts`、`components/NodeRenderer.tsx` | controller 返回 accessor；外部平滑时关闭 renderer 重复平滑 |
| Solid 扩展与资源 | `src/customComponents.ts`、`components/CodeBlockNode.tsx`、`components/RenderChildren.tsx`、`src/workers/`（均在 Solid 包内） | 核实注册清理、节点身份、runtime 复用和 Worker 所有权 |

新增目录固定为 `playground-solid/`，包名使用 `markstream-solid-playground`，根入口为 `play:solid`、`play:solid:build`、`play:solid:preview`。这些是待新增项目，不能直接运行一个尚未登记的 filter 后把空结果当成功。

## 建议从这里开始实施

1. 运行 `git status --short`、`git log -5 --oneline`，检查当前是否已有 Solid playground 或他人后续修改。若已有工作，在其基础上继续，不覆盖或从零重建。检查 `packageManager`、实际 scripts、依赖和端口，再用 pnpm。
2. 创建 `playground-solid/PORTING.md` 和 `PORTING_STATUS.md`：按目标文件的表逐项登记页面、按钮、设置和样例，并记录 timer、reader、observer、Worker、注册订阅的所有权。先将历史记录与当前可复现状态分开。
3. 建立最小可运行骨架：独立 Solid JSX/Vite 配置、workspace、CSS、包入口和 scripts。先完成三条纵向链路：流模拟器 → renderer；ThinkingNode 嵌套与作用域；长代码追加 → 自动滚动。用真实动态输入验证后再批量搬页面。
4. 完成首页、Test Lab、行号检查和 Solid 接入页。检查浏览器前进/后退、刷新深链接、hash 分享、设置持久化及窄屏显示。避免从 React shared hook 模块间接引入 React runtime。
5. 加入可一键操作的 Solid 展示：平滑输出与 final 追平、代码实例保留、局部自定义组件、真实图表/公式与 Worker、长文批量渲染。SSR/hydration 采用可重复生成的最小 fixture，不必新建 SolidStart 工程。
6. 把失败按根因排队，修复后重跑相关检查。出现共性映射错误，先修订 `PORTING.md` 再检查已搬代码。最后执行完整验收，写 `VERIFICATION.md` 并逐项链接证据。

按 Bun 方法分别审查“是否遗漏源行为”和“Solid 响应式/生命周期是否正确”。如接手环境允许并行审查，按目标中的独立审查安排执行，明确文件归属；没有实际进行的审查不得标记通过。

## 特别容易踩的坑

- **历史 playground 证据缺源码**：Solid 历史报告称 playground build、浏览器和 hydration 已通过，但当前提交没有相应应用。重新交付源码、生成脚本和证据，澄清旧记录；不要依赖旧 `/tmp` 路径或将历史报告复制成新验收。
- **有 API 不等于有行为**：Solid 包仍有部分实现和待验证项。React 参数必须追到 Solid 消费位置；共同能力缺陷做最小修复，React 独有能力明确说明。`render-window` 尚未接入主 renderer，不能展示为虚拟化。
- **Solid props 不能读成初始化快照**：不要照搬 React 组件参数解构和函数重执行假设。controller 的 `visible()`、`pendingChars()` 等持续读取 accessor；事件处理也不能捕获旧输入。
- **清理时机不能照搬**：正确注册 `onCleanup`，不要依赖从 `onMount` 返回函数自动清理。当前 `NodeRenderer.tsx` 存在从 `onMount` 返回注册取消函数的写法，是需要用卸载用例核实的风险点，本轮尚未复现或修复。
- **保留实例需要测量**：截图无法证明没有重建；用 DOM 引用、挂载与 runtime 创建/销毁计数验证普通追加。语言/节点类型或 code/diff 改变时的必要重建另行记录。
- **模拟预设不是网络服务**：SSE/WebSocket 是源 playground 的流量节奏预设；transport 实际是 scheduler/ReadableStream。不要擅自新增后端服务或宣传真实网络协议验证。
- **双重平滑与错误 final**：传输完成不代表 UI 已追平。外部 controller 示例关闭内部平滑；stop、reset、替换输入和卸载分别验证旧任务取消。
- **共享资源清理不能误伤其他组件**：Worker 生命周期由明确的应用 owner 管理；单组件卸载不能终止其他组件使用的服务。样例注册也要区分全局与局部所有权。
- **开发 alias 会掩盖发布问题**：生产构建走公开包/CSS/Worker 入口，并做 tarball 消费验证。对未发布的 workspace 依赖同时本地打包，避免意外从 registry 拉到不匹配版本。

## 验证与交付

完整命令及每项完成条件见 `GOAL-PLAYGROUND.md`。已有 Solid 包的 `typecheck`、`test`、`build`、`test:ssr` 可作为起点；playground 的对应 scripts 和 `hydration:generate` 要先实现。Solid JSX 测试保持独立配置，不能依赖根 Vue 配置碰巧编译成功。

优先复用这些测试的输入、操作序列与有效行为断言，替换框架挂载层：

- `test/react-playground-stream-simulator.test.ts`
- `test/react-playground-stream-behavior.test.tsx`
- `test/playground-react-live-preview-config.test.ts`
- `packages/markstream-solid/test/renderer.test.tsx`

每批运行受影响检查，最终执行 Solid 包与 playground 检查、真实浏览器展示、SSR/hydration、打包消费，以及根 `pnpm lint`、`pnpm typecheck`、`pnpm exec vitest run`。共享模块改变时补验 React 18/19 构建和原 playground。浏览器操作前读取接手环境适用的 browser skill。

验证报告记录实际命令、退出码、测试数、端口、浏览器版本、日志/截图路径、已知差异和失败归因。缺 peer 的降级用独立 fixture 检查；真实依赖场景必须确实渲染，不能永久显示 fallback。既有失败须基线复现，本轮新增失败必须修复，不能弱化断言或跳过测试。

最终至少交付：完整 `playground-solid/` 应用、README、PORTING.md、PORTING_STATUS.md、VERIFICATION.md、对应测试与可复现 fixture、必要的 workspace/scripts/共享登记，以及历史验证记录的澄清。报告完成时给出启动方式、页面入口、验证摘要和剩余差异。

允许范围内的普通错误继续修复；证据齐备即停止，不扩展无关功能。外部阻塞先保存复现并推进其他独立工作；无事可推进时报告阻塞及所需输入。不覆盖用户修改，不做无关框架重构，不自动提交、推送、发布或部署。

## 可以直接发给接手 agent 的指令

> 请阅读 `HANDOFF-PLAYGROUND.md` 和 `GOAL-PLAYGROUND.md`，按后者实施 React playground 到 Solid 的迁移。先核对当前工作区并接续已有进度，以 React 18 为页面主基线，保留稳定流式行为，完成 Solid 特性演示及可复现验证。持续维护移植台账，直至完成条件全部满足或出现需要外部输入的明确阻塞。不要只重写计划，不要自动提交、推送、发布或部署；不要把历史验证报告当作本次通过证据。
