# 实现完整的 Markstream Solid 支持

> Historical task brief. Current product status: [`packages/markstream-solid/CAPABILITY.md`](./packages/markstream-solid/CAPABILITY.md). Do not re-run this goal from scratch.

## 目标

按照 [SOLID_PORTING.md](./SOLID_PORTING.md)，实现可构建、可安装、可在真实 Solid 应用中使用的 `markstream-solid` 包和对应 playground。

以提交 `f808226cd747ae266e5a046819d374c707b63f80` 的 `markstream-svelte` 为功能和行为基线，完整搬运其实际支持的能力；组件命名、JSX 调用、props 和回调形状参考 `markstream-react`，内部使用 Solid 的响应式和生命周期机制。无需追齐 React 独有能力，也不要求首轮达到 React 性能基准。必须保持本项目的稳定流式更新，不能通过反复重建节点、编辑器或重组件完成内容更新。

本文件是目标文本；写入文件不代表已经启动目标执行或完成实现。

## 工作队列与执行方式

1. 建立 `packages/markstream-solid/PORTING_STATUS.md`，枚举 Svelte 的源文件、公开导出、组件 props、实际行为、CSS/Worker 子路径和消费方式。逐项记录目标文件、API 映射、验证用例、状态和差异。源端已有缺陷或未生效的参数单列，不算作已验证功能。
2. 建立 Solid 包和独立编译、类型检查、测试配置，直接依赖现有 parser/core；先试搬 TextNode、NodeRenderer/NodeOutlet 最小链路和 CodeBlockNode，验证响应式、节点身份及资源清理。
3. 按台账搬运全部普通节点、流式控制、自定义组件与标签、HTML 渲染和增强、代码块、Mermaid、KaTeX、D2、Infographic、工具及分发能力。保留源实现的默认值、错误恢复和可选依赖降级。
4. 每批执行对应检查，把失败按根因整理成队列并修复。重复出现的映射错误先更新移植规则，再检查已搬文件。针对源行为遗漏和 Solid 响应式/生命周期分别审查，不用“编译通过”代替行为验收。
5. 完成 playground、实际打包安装、浏览器与 SSR/hydration 验证，生成 `packages/markstream-solid/VERIFICATION.md`，记录实际命令、退出码、用例结果、浏览器证据及剩余差异。

## 完成条件与证据

只有以下条件全部满足，才可报告目标完成：

- **完整度**：台账覆盖源包全部实际能力，每项都有实现位置和验证证据，待移植、待验证及未解决的 Solid 回归为零。框架专属名称通过明确映射保留等价能力，不要求照搬 Svelte 类型。
- **稳定更新**：测试覆盖逐字符和不规则分片、未闭合语法、语言前缀收敛、final 追平、内容替换/reset、节点类型改变、插入/删除/重排、嵌套自定义组件及主题切换。用 DOM 引用、组件挂载次数和 runtime 创建/销毁计数证明普通追加复用实例；验证编辑器滚动和选区保留。必要重建的触发条件有记录与测试。
- **异步与清理**：覆盖过期图表/公式结果、卸载后完成的异步操作、错误恢复以及多组件共享资源。旧任务不覆盖新内容，私有 timer、RAF、observer、事件和订阅得到释放，单组件卸载不破坏共享服务。
- **行为一致**：沿用 Svelte 的输入、操作序列与行为断言，必要时使用共同能力的 React 回归用例补充。真实浏览器验证流式聊天、代码/diff、图表、公式、自定义组件、交互和依赖缺失降级，不能只依靠 mock 或源码字符串检查。
- **类型与构建**：`pnpm --filter markstream-solid typecheck`、`pnpm --filter markstream-solid build` 和新增的 Solid 专属测试命令均退出 0；在验证报告中写出实际测试命令。声明文件表达真实 Solid props/回调，不以宽泛类型掩盖缺口。
- **实际消费**：从打包产物安装的测试应用通过公开 API、CSS、Worker 和可选 peer 检查；服务端可导入并输出内容，hydration 后可以继续流式更新。不能仅凭 workspace 源码 alias 判定包可用。
- **仓库回归**：运行 `pnpm lint`、`pnpm typecheck`、`pnpm test` 并验证 playground；正常情况下全部通过。若存在与本次无关的既有失败，必须提供基线复现和本次未引入新失败的证据；不能将失败命令记为通过，无法归因则保持未完成。
- **交付记录**：新增包、playground、必要的使用文档、完整台账和验证报告均在仓库中；报告修改范围、验证结果和已知源端差异。性能仅记录实际体验和明显问题，不设 React 对比门槛。

## 工作边界

允许修改新 Solid 包、playground、相关测试/脚本/文档，以及必要的 workspace、依赖锁文件、构建和 CI 接入配置。共享文件只做完成本目标必需的兼容性调整，并验证既有消费者。

不顺便重构 Vue、React、Svelte 或 parser/core 的架构；不让 Solid 运行时依赖 React/Svelte 包；不删除、跳过或弱化有效测试来制造通过；不通过空函数、被忽略的 props、永久 fallback 或禁用功能伪装完成。不覆盖用户已有修改，不执行破坏性 Git 操作。本目标不包含提交、推送、发布 npm 包或部署。

## 停止与阻塞规则

验收证据齐备后停止实现并报告结果，不继续扩展功能或追逐性能指标。

普通编译错误、测试失败和移植困难属于修复队列，继续处理。遇到权限、无法获取的依赖、不可用的外部服务或必须突破上述边界才能解决的问题，先保留复现信息并完成不受影响的工作；若已无可继续的独立工作，停止并报告具体阻塞、未完成项和所需输入，不声称完成、不绕过权限、不无限重复同一失败命令。

不设置默认 token、轮数或时间预算；以完成证据或明确阻塞作为结束依据。
