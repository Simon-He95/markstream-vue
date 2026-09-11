# 02：对齐 Solid 公开 API 与实际行为

优先级：合并前。范围遵循原 Solid 移植约定：Svelte 实际行为为基线，React 提供接口参考，不追齐 React 独有能力。

## 已定位的问题

- `components/CodeBlockNode.tsx` 声明 `stream`，context 传递 `codeBlockStream`，但 runtime options 固定 `stream: false`。Svelte 对应代码读取 `stream ?? context?.codeBlockStream ?? true`，属于具体行为差异。
- `components/NodeRenderer.tsx` 提供 `SMOOTH_STREAMING_CONTEXT`，没有消费父 context。Svelte 会在父 renderer 已平滑时抑制嵌套 auto 模式再次平滑；当前缺少对应逻辑及行为验证。
- 部分 props 如 `viewportPriority`、`deferNodesUntilVisible`、`liveNodeBuffer`、`debugPerformance` 没有接入相应 renderer 行为；导出 `render-window` 工具并不意味着主 renderer 已实现虚拟化。
- `onHandleArtifactClick` 等回调也应追踪到真正触发位置，不能只因 context 内有字段就认定支持。

这些发现是静态代码与源基线对照，不把尚未运行的用户场景写成已复现。

## 工作队列

1. 从 `src/index.ts`、`NodeRendererProps`、节点 props 和包 exports 建立 API 审核表：公开名称、消费位置、默认值、更新语义、源端行为、测试、差异。对每个入口明确“生效”“仅工具导出”“兼容但不生效”“待实现”，不要只枚举名字。
2. 为 `stream`/`codeBlockStream` 增加默认值、优先级和真实 runtime 行为测试。核实当前 runtime 的两种模式及生命周期，再修复映射；不要只把 `false` 改成 `true` 就宣称完成。覆盖普通代码、diff、追加、final 和模式切换。
3. 为父级平滑 + 嵌套 auto 的场景添加失败回归，修复父 context 消费。显式 `smoothStreaming=true` 的选择仍应保留；覆盖 false、auto、显式 nodes、reset 和 ThinkingNode 嵌套，确保无双重积压或错误 final。
4. 检查 smooth options 是否应动态响应，以及 context、回调、主题、行号等 props 更新是否真实生效。优先处理仍有初始化快照风险的消费位置，不全局机械改写所有局部变量。
5. 对源端同样未接入的参数，记录兼容限制；对 Solid 丢失的共同能力，补实现和回归。移除或改变公开 API 需要核对现有消费者及发布状态，不能以精简接口之名静默破坏兼容。
6. 更新包 README 中的支持范围和示例，保留一份准确的能力表供计划 04 收拢。不要引入虚拟化或 React 独有引擎作为补齐文档的手段。

## 验收条件

每个公开入口能追踪到实现和测试，或有明确兼容限制。`stream` 选择的优先级与实际效果经过验证；嵌套 auto 不重复平滑，显式选项不被覆盖；流式结束、reset、主题及必要模式切换不破坏节点和编辑器稳定性。

运行 Solid 包 typecheck/test/build 和受影响的 playground 检查；真实 runtime 行为由计划 01 的浏览器关卡覆盖。失败不能通过 `any`、忽略 props、永久 fallback 或重挂载绕过。

修改边界为 Solid 包、相关测试与文档。共享 parser/core 如确实需要改动，先给出最小复现及必要性，单独确认扩展范围。
