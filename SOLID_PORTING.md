# Solid 移植约定

状态：准备阶段；本文件确定搬运方式，不表示 Solid 包已经实现或通过验证。

## 目标与基线

新增 `packages/markstream-solid`，以当前 Svelte 实现为功能和行为来源，组件的公开形状参考 React，使用 Solid 自身的响应式和生命周期机制。

- 基线提交：`f808226cd747ae266e5a046819d374c707b63f80`。
- 功能来源：`packages/markstream-svelte/src/index.ts`、包的 `exports`、各组件 props、实现、测试和 playground。不能只照着导出名生成空壳。
- API 参考：`packages/markstream-react/src/index.ts`、`types.ts`、`types/component-props.ts`。参考组件名称、JSX 调用方式、props 和回调形状，不扩大到 React 独有功能。
- 必须保持流式稳定更新。首轮不要求达到 React 的性能基准，但不能用全树重建、逐 token 重建编辑器或重复启动重任务换取实现简单。
- 本次先完成移植方法文档；后续实现按本文件执行。

遇到冲突时，按以下顺序判断：用户确定的范围与稳定更新要求 → Svelte 可观察行为 → React API 形状 → Solid 实现习惯。明确的源实现缺陷要记录、修复并添加回归验证，不能为了形式一致复制缺陷。

## 方法来源

参考 Bun 的 [Rewriting Bun in Rust](https://bun.com/blog/bun-in-rust)：先建立移植规则，以最少行为变化进行机械移植，试搬小样本，复用行为测试，并用独立审查寻找错误；发现系统性问题时修正生成与审查规则。这里采用这些原则，不照搬其并发规模或耗时预期。

本项目的具体执行约定如下，其余细节是针对 Markstream 的设计。

## 搬运边界

先保持 Svelte 的模块职责、状态转换、默认值、异步顺序、降级行为和资源所有权。不要在移植期间顺便重新设计所有框架的公共引擎。

| 来源 | 处理方式 |
| --- | --- |
| `stream-markdown-parser`、`markstream-core` | 直接依赖；不复制解析器或平滑输出算法 |
| Svelte 普通 `.ts` 工具、optional loaders、Worker、HTML/SVG 安全逻辑 | 审查框架依赖后搬运，保留算法和错误处理；同步修改包内引用 |
| `.svelte`、`.svelte.ts`、context、组件注册类型 | 转为 Solid 组件和响应式封装 |
| CSS、图标、翻译 | 保留视觉与行为；验证 CSS 作用域、构建扫描和资源路径 |
| Svelte 专属命名和组件类型 | 改为 Solid 对应名称与类型，并记入 API 映射 |
| React 专属 `/next`、React 类型和 hooks 机制 | 不作为新增功能要求；SSR 能力按 Svelte 基线验证 |

不让 Solid 运行时依赖 `markstream-svelte` 或 `markstream-react`。必要的纯 TS 文件可以先在新包内保留对应副本并标注来源；提取共享包是后续独立工作。

## 完整度台账

实现开始时建立 `packages/markstream-solid/PORTING_STATUS.md`，按来源文件、导出和可观察能力展开。每项记录：源路径、目标路径、API 差异、验证用例、状态和已知问题。状态区分待移植、已实现、已验证，只有存在验证证据才可标为已验证。

至少覆盖：

| 能力组 | 范围 |
| --- | --- |
| 节点组件 | `src/index.ts` 全部节点、NodeOutlet、RenderChildren、FallbackComponent、Tooltip、HtmlPreviewFrame |
| 主渲染器 | content/nodes、解析配置、final、嵌套渲染、批量渲染及实际调度行为 |
| 流式 | smoothStreaming 自动与显式模式、typewriter、fade、结束收敛、重置 |
| 代码块 | stream-diffs、普通与 diff、主题、工具栏、预览、复制、折叠、尺寸及 fallback |
| 重节点 | Mermaid、KaTeX、D2、Infographic；交互、加载、取消、错误恢复及可选依赖缺失 |
| 扩展 | scoped/global 自定义组件、注册变化通知、自定义标签、嵌套 Markdown |
| HTML | 字符串渲染接口、安全策略、HTML 增强与释放、SVG 处理 |
| 工具 | i18n、语言图标、loader 配置、Worker 注入与 CDN helper、公开类型 |
| 分发 | CSS 各入口、Worker 子路径、声明文件、可选 peers、SSR 导入与 hydration、playground |

公开 props 要追踪到真实消费位置。源包声明了参数但未实现行为时，记为源端差异，不把“类型里存在”算作功能，也不擅自引入 React 的完整实现。

## 响应式映射规则

| Svelte 写法 | Solid 方向 | 必须检查 |
| --- | --- | --- |
| `$props()` | 保持响应式的 `props.x`，必要时 `mergeProps` / `splitProps` | 不在初始化时解构动态值；默认值语义一致 |
| `$state` | `createSignal`，确需字段级更新时使用 store | 普通对象和数组不是自动深响应式；外部编辑器实例不要代理化 |
| `$derived` / `$derived.by` | `createMemo` 或 accessor | 保留延迟读取和依赖；派生计算不创建编辑器或订阅 |
| `$effect` / `$effect.pre` | 根据用途选择 effect、显式依赖和挂载处理 | 分别审查 DOM 前后时机，不能统一替换；防止读写自身导致循环 |
| `onMount` / `onDestroy` | `onMount` / `onCleanup` | cleanup 注册在正确 owner 下；effect 重跑清理不等于组件卸载 |
| `tick()` | 按目的选择挂载时机或调度 | 写明等待的是响应式提交、DOM 还是布局；不统一换成微任务 |
| `setContext` / `getContext` | Solid context + accessor | 不冻结为初始化快照，保留嵌套平滑输出抑制 |
| keyed each / key block | 明确节点身份后选 `Index`、`For` 或显式槽位 | 新节点对象不应自动意味着新组件 |
| 动态组件、snippet、children | 稳定组件类型、Solid JSX / render callback | 不把动态 props 捕获为快照；不重复实例化 children |

Solid 的组件函数只初始化一次，不能依赖 React 式函数重执行更新局部变量。具体时机以目标依赖版本的官方文档和小样本测试确认：

- [Solid 组件生命周期](https://docs.solidjs.com/concepts/components/basics)
- [Solid props](https://docs.solidjs.com/concepts/components/props)
- [Solid Index](https://docs.solidjs.com/reference/components/index-component)

## 稳定更新与资源所有权

移植 NodeRenderer、NodeOutlet 和每个重组件前，在台账中记录其资源：创建者、更新入口、失效条件、释放位置、异步完成后的有效性检查。

1. **节点身份**：区分内容变化、节点类型变化、文档重置和显式 key 变化。追加流的同一位置可复用槽位；任意插入、删除、重排及类型改变必须单独验证，不能假设所有输入只追加。
2. **代码块**：普通文本追加走原实例更新，保留 DOM、滚动和选区。主题、语言及 code/diff 切换是否需要重建，按 runtime 能力和源实现逐项记录。当前 Svelte NodeOutlet 的代码块 key 包含 language/diff，语言前缀收敛尤其需要验证。
3. **异步结果**：沿用并核实 lifecycle ID、请求 token 或等价机制。过期解析、图表渲染、动态 import 的结果不得覆盖较新内容，也不得写入已卸载 DOM。
4. **资源释放**：编辑器、observer、RAF、timer、订阅和 DOM 事件要有明确 owner。全局共享 Worker/cache 与组件私有资源分开处理，不能因一个组件卸载终止其他组件正在使用的服务。
5. **流式结束**：外部 final 到达与平滑输出追平是两个状态；保留 Svelte 的 effectiveFinal 处理。显式 nodes、嵌套渲染和 reset 都必须覆盖。
6. **HTML 增强**：声明式组件和 imperative DOM 增强的所有权必须清晰，不得同时初始化同一个容器。增强重跑时保留取消和 dispose 语义。

## API 形状

目标用法如下，仅表达接口方向，当前并非可运行示例：

```tsx
import MarkdownRender, { CodeBlockNode } from 'markstream-solid'
import 'markstream-solid/index.css'

const Message = (props: { content: string, final: boolean }) => (
  <MarkdownRender content={props.content} final={props.final} />
)
```

提供默认 MarkdownRender 和相应具名组件导出；采用 Solid JSX 类型、普通 props 和 `onX` 回调。已有 Svelte 能力全部获得可表达的入口，包括单独使用节点组件与 HTML 工具。React 中相同能力的命名优先参考；Svelte 独有能力保留等价入口。框架命名的类型与别名转换必须列清单。

平滑输出 helper 的名字与返回形状在试搬阶段固定：返回值必须可以持续响应更新，不能照抄 React 的快照对象。不要通过 `any`、宽泛索引签名或被忽略的 props 伪装 API 完成。

## 执行顺序

1. 固定源基线，展开功能/API 台账和资源所有权表；记录工作区差异，避免后续源代码漂移混入移植。
2. 建立 Solid 包、独立 JSX/测试配置及最小 playground，不改变既有包的 JSX 编译方式。
3. 试搬三个代表性单元：TextNode（fade/流式状态）、NodeRenderer + NodeOutlet 的最小链路（身份和重置）、CodeBlockNode（异步 runtime 与清理）。依赖按需搬入，试搬不是缩减最终范围。
4. 使用相同分片输入对比 Svelte，先证明 props 更新、实例保留、final 收敛及卸载清理。暴露的通用问题先修订本文件，再检查全部已搬文件。
5. 按模块继续机械移植：普通节点 → 自定义/HTML → 其余重节点 → 公共工具与分发。每批完成后运行对应类型检查和行为验证。
6. 把编译错误和测试失败整理为可复现队列，按根因修复。不得用空函数、永久 fallback、关闭类型检查或删除断言清空队列。
7. 审查分别关注源行为遗漏和 Solid 响应式/生命周期错误。采用独立审查者时，提供源文件、目标 diff、规则和验收要求，不依赖实现者的自我解释；修改后重验。不能把尚未执行的独立审查记为通过。
8. 完成真实安装包和浏览器验证，核对台账没有被遗漏的能力，再报告结果与剩余差异。

完整迁移在独立新包中完成，不建立依赖 Svelte/React runtime 的临时兼容桥。按批次实现和验证，不要求一口气生成全部代码后才首次编译。提交、发布及并行执行由具体任务授权决定，本文件不自动触发这些操作。

## 验证与完成条件

复用 Svelte 测试的输入、操作序列和行为断言；框架挂载工具换成 Solid。React 回归用例只补充共同能力的边界，不据此扩大范围。对比语义 DOM、用户交互和状态，不要求框架生成的注释及内部标记逐字一致。

- 覆盖静态内容、逐字符和不规则分片、未闭合语法、语言前缀、长代码、替换/reset、final、嵌套自定义组件、主题切换、卸载后异步完成及重组件错误恢复。
- 使用 DOM 引用和 runtime 创建/销毁计数验证稳定更新；截图不能证明实例复用。模拟 runtime 的单测之外，浏览器中验证真实代码块、图表和公式。
- SSR 验证包可导入、服务端输出、客户端 hydration 与后续追加更新；浏览器 API 按源能力正确延迟。
- 从打包产物安装到消费端验证公开入口、类型、CSS、Worker 和可选依赖降级，不能只通过源码 alias 验证。
- 性能首轮记录代表性流式场景是否卡顿、重组件是否重复初始化、卸载是否泄漏，不设 React 比分门槛。
- 检查实际 scripts 后运行 Solid 专属检查；请求代码 review 前按仓库要求执行 `pnpm lint`、`pnpm typecheck`、`pnpm test` 并验证 playground。既有失败单列，不计为 Solid 通过证据。

完成意味着：台账各项均有实现和验证证据；稳定更新用例通过；没有通过 stub、忽略参数或禁用能力隐藏缺口；构建及真实消费验证通过。未完成的能力应明确报告，不能以“首版”名义默认删减 Svelte 已有功能。
