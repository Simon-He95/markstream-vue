# Solid 移植交接

更新日期：2026-09-10。

## 接手时先看这里

当前只交付准备文档，没有保留下来的 Solid 实现。用户曾启动实现，随后明确要求撤销全部实现改动、仅保留文档；已执行撤销。本轮用户只要求补充交接文件，不应据此自动恢复实现。

阅读顺序：

1. [GOAL.md](./GOAL.md)：最终交付范围、完成证据和工作边界。
2. [SOLID_PORTING.md](./SOLID_PORTING.md)：源框架到 Solid 的具体移植规则。
3. 本文件：当前状态、调查发现和接手建议。

## 用户最后确定的要求

- **以 Svelte 实现的完整度为范围**，已有能力应在 Solid 中获得等价支持。
- **组件形状参考 React**：组件名称、JSX 调用、props 和回调；内部不照搬 React hooks。
- **稳定更新非常重要**：持续追加内容不能反复销毁节点、代码编辑器或重组件。
- **首轮不要求 React 级别性能**，不要将性能基准作为额外发布门槛。
- 不再要求逐项追齐 React 独有功能，也不是只做基础 Markdown 的精简版。
- 参考 Bun 的移植方法：先确定映射规则、小样本试搬，再按规则完整迁移和验证，最后再考虑大规模重构。

早期讨论中的“Day 1 全部 React 功能与速度”已被用户后续澄清替代。早期工期估算不是当前目标契约。

## 当前仓库状态

交接前核对的 HEAD：`f808226cd747ae266e5a046819d374c707b63f80`，也是两份目标文档记录的 Svelte 基线。

- `GOAL.md`、`SOLID_PORTING.md` 以及本文件是新增文档，尚未提交。
- `packages/markstream-solid/` 已删除，包括试写组件、包配置和临时 `PORTING_STATUS.md`。
- `pnpm-lock.yaml` 已恢复；现有源码和配置没有保留本次修改。
- 本轮创建的根目录 `node_modules`、parser/core 的 `node_modules` 以及 Solid 包依赖目录已删除。
- 没有提交、推送、发布或部署。
- 没有完成 Solid 构建、类型检查、行为测试、浏览器或 SSR 验证；不能将这轮工作视为经过验证的原型。

接手时重新运行 `git status --short`，当前状态优先于本文。不要删除后续接手者或用户新增的内容。

## 已调查到的代码入口

以下都是源代码审阅发现，不是 Solid 已验证的行为。

| 路径 | 用途与注意点 |
| --- | --- |
| `packages/markstream-svelte/src/index.ts` | 公开组件、helper、loader、Worker 和 HTML API 的完整清单起点 |
| `packages/markstream-svelte/package.json` | CSS/Worker 子路径、optional peers、构建与分发基线 |
| `packages/markstream-svelte/src/components/NodeRenderer.svelte` | 平滑输出、effectiveFinal、分批渲染、context、HTML 增强与节点列表 |
| `packages/markstream-svelte/src/components/NodeOutlet.svelte` | 自定义组件和内建节点分发、代码块实例 key |
| `packages/markstream-svelte/src/components/RenderChildren.svelte` | 嵌套节点按位置构造 key；Solid 需要明确槽位身份 |
| `packages/markstream-svelte/src/components/TextNode.svelte` | previousKey/previousContent、共享文本 Map、追加文字 fade 状态 |
| `packages/markstream-svelte/src/components/CodeBlockNode.svelte` | syncEditor、异步安装、语言前缀恢复、配置改变时清理和卸载清理 |
| `packages/markstream-svelte/src/components/shared/` | node-helpers、分发辅助、窗口计算、图表高度等纯 TS 逻辑 |
| `packages/markstream-svelte/src/composables/useSmoothMarkdownStream.svelte.ts` | core 控制器的响应式封装；返回 getter，销毁时 unsubscribe + destroy |
| `packages/markstream-svelte/src/customComponents.ts` | global/scoped 注册表、revision 和订阅；Solid 要有独立 store key 和组件类型 |
| `packages/markstream-svelte/src/enhanceRenderedHtml.ts` | imperative DOM 增强；审查取消、dispose 和声明式节点的所有权边界 |
| `packages/markstream-svelte/src/optional/`、`src/workers/` | 重依赖加载和 Worker 客户端，许多逻辑可机械搬运 |
| `packages/markstream-core/src/index.ts` | 平滑输出控制器、流式文本状态、diff 和语言工具；直接依赖 |
| `packages/markdown-parser/` | 实际包名 `stream-markdown-parser`；直接依赖，不复制解析器 |
| `packages/markstream-react/src/index.ts`、`src/types.ts`、`src/types/component-props.ts` | React 风格公开接口参考 |
| `test/*svelte*`、`test/react-*.test.tsx`、`scripts/e2e-svelte-playground.mjs` | 复用输入、交互和断言；先核实测试是否真的验证运行时行为 |

源 Svelte `src/` 当时共 78 个文件。文件数量只是台账起点，不代表能力数量或完成比例。

## 需要格外留意的细节

1. Svelte 的 NodeRenderer/RenderChildren 使用位置相关 key。Solid 的 `For` 默认按对象身份管理条目，解析器产生新对象时不能直接认为它等价于源 keyed each。选择 Index、For 或显式槽位前，验证追加、重排、类型变化和 reset。
2. NodeOutlet 的代码块 key 包含 language 和 diff 模式。语言从不完整前缀变成完整标识时是否重建、怎样保留编辑器状态，需要试搬验证，不能机械复制 key 后宣称稳定。
3. 平滑输出中外部 final 与可见文本追平不是同一时刻；保留 effectiveFinal 以及嵌套 renderer 的自动模式抑制。`nodes=[]` 仍然是 nodes 模式，不能回退到解析 content。
4. Solid props 必须持续响应读取；不要初始化时解构动态值。外部编辑器实例不应放入深代理。effect 的重跑清理和组件卸载清理不可混淆。
5. TextNode 的派生计算会维护 previousContent 和 context 文本 Map；Solid 执行/依赖时机需要实际测试，不能只翻译语法。
6. Svelte 的 `COMPONENT_PARITY.md` 对代码块与图表的说明可能落后于实际组件代码。以源实现及行为为准，不用旧说明跳过直接编辑器生命周期。
7. core 尚不是完整的跨框架 renderer。节点调度、状态管理和资源处理仍有大量逻辑位于各框架组件中。
8. 根 tsconfig 面向 Vue，已有测试还涉及 React。Solid 应使用独立 JSX、类型与测试编译配置，不能全局替换 JSX 设置。
9. 包 exports 只能指向真实产物。浏览器、SSR、Solid 源码条件入口、声明文件、CSS 和 Worker 均需结合实际构建设计；撤销前的配置没有构建验证，不可作为既定方案。

## 建议的下一轮顺序

收到继续实现的任务后：

1. 核对基线和工作区；建立文件、公开 API、props/行为、分发入口台账，区分待移植、已实现、已验证。
2. 建立新包及最小独立测试环境，准备 parser/core；记录源端基线失败，控制锁文件变化范围。
3. 试搬 TextNode、NodeRenderer/NodeOutlet 最小链路、CodeBlockNode。先得到真实行为证据：props 更新、DOM/编辑器实例复用、final/reset、过期任务和卸载。
4. 发现通用问题先修正 `SOLID_PORTING.md`，再按其规则检查已搬文件并继续完整移植。
5. 保留 Svelte 现有能力、默认值与降级处理。纯 TS 模块可以先保留有来源的副本，不必先抽象全仓库公共引擎。
6. 逐批补齐测试和台账，最终完成真实安装包、浏览器、SSR/hydration 和仓库回归；交付 `VERIFICATION.md`。完整完成条件以 `GOAL.md` 为准。

## 环境记录

- 使用 `pnpm`，项目 `packageManager` 为 `pnpm@10.34.5`。
- 当时通过 registry 查询得到 `solid-js@1.9.15`、`vite-plugin-solid@2.11.14`；只是查询记录，不是已经确认兼容的版本方案，接手时再核实。
- 曾成功执行 `pnpm install --filter markstream-solid... --no-frozen-lockfile`。即使 filter 只有 3 个包，也重新解析了整个 workspace，并对锁文件产生较多变化；这些改动已撤销。
- 安装提示已有 peer 不匹配，以及部分 esbuild、@parcel/watcher build scripts 被忽略。未继续验证这些提示是否影响构建，不应提前归因为阻塞。
- 本会话默认沙箱启动时报 `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`，后续命令经工具权限机制执行成功。这是环境问题，不能据此修改项目代码；下个环境不一定复现。
- 安装工具可能留下 workspace 以外的下载缓存，未做全局清理；不要为了回滚项目去删除用户共享缓存。

## 参考材料

- [Bun: Rewriting Bun in Rust](https://bun.com/blog/bun-in-rust)：移植方法来源，已落实为 `SOLID_PORTING.md`。
- [write-goal 技能](https://github.com/AkaraChen/skills-public/tree/main/write-goal)：`GOAL.md` 的完成契约结构来源，不是运行依赖。
- Solid 官方文档链接见 `SOLID_PORTING.md`。

下一位接手者拿到的是明确的目标和移植规则，以及已审阅的源码线索；实现与全部验收仍待完成。
