# Solid 技术债整理计划

过程材料，不是产品文档。当前能力表：[`packages/markstream-solid/CAPABILITY.md`](../packages/markstream-solid/CAPABILITY.md)。

规划日期：2026-09-11。代码基线：`a5dfbac562b5662b923e2a66b60bf7d91a3989fd`。

目标是让 Solid PR 的公开能力、实际行为、验证证据和维护文档一致。无需在本次 PR 内重构全部框架，也不以零技术债为合并条件。

## 执行顺序

| 计划 | 优先级 | 依赖与交付 |
| --- | --- | --- |
| [01 接入 CI 与可重复验证](./01-solid-ci-and-verification.md) | 合并前 | 可先接入现有检查；最终浏览器场景等待 02、03 的修复。交付自动检查与证据 |
| [02 对齐公开 API 与行为](./02-solid-api-and-behavior.md) | 合并前 | 修复明确的行为缺口，记录真实限制，为 01 提供回归场景 |
| [03 修正 Playground 观察与完成状态](./03-playground-observability.md) | 合并前 | 可独立于 02 开始；外部/内部平滑边界遵循 02 的结论 |
| [04 整理文档与 PR 范围](./04-documentation-and-pr-scope.md) | 合并前收尾 | 先盘点，等 01–03 的实际结果确定后更新能力与验证说明 |
| [05 降低长期维护成本](./05-solid-maintainability.md) | 可后续 | 发布前先审核不必要的公开导出；内部拆分和重复逻辑治理可另开 PR |
| [06 去掉 scoped 注册表](./06-solid-drop-scoped-registry.md) | 合并前 | 公开形状跟 React：隔离只用 renderer `customComponents`；不引入 `streamingComponents` |
| [07 实现 `showTooltips`](./07-solid-show-tooltips.md) | 合并前 | 链接、代码块工具栏、HTML 增强共用一个开关 |
| [08 实现 `debugPerformance`](./08-solid-debug-performance.md) | 合并前 | 只打 parse(sync) 日志，与 React 源码一致 |
| [09 按点名收口公开 API](./09-solid-api-honesty.md) | 合并前 | 删空虚拟化 props、测试钩子退出入口、加回 scoped 注册、工具栏 i18n、按 Svelte 收导出。`renderWindow` 用户自删 |

01–03 可以交错推进，不代表自动授权启动多个 agent。多人执行时分别认领文件；共享配置与最终整合由明确的负责人处理。

## 执行状态（2026-09-11，HEAD `bd7d5121`）

| 计划 | 状态 | 证据 |
| --- | --- | --- |
| 01 CI 与可重复验证 | 代码已接入，GitHub 尚未证明 | 根脚本 `check:solid` / `test:smoke:solid*` / `test:e2e:solid-*`；`.github/workflows/ci.yml` Ubuntu 步骤。HEAD 上没有对应 GitHub Actions run；上一笔 CI（`a5dfbac5`）停在 `action_required` |
| 02 公开 API 与行为 | 已落地主要缺口 | `stream ?? codeBlockStream ?? true`、嵌套 auto-smooth、live theme/line-numbers；未接线虚拟化标为 known limit |
| 03 Playground 观察 | 已落地 | 资源计数走 `resourceEpoch`；暂停 / 传输完成 / stop-reveal 分开；未覆盖项显示 `uncovered` |
| 04 文档与 PR 范围 | 进行中 | 入口改指向 CAPABILITY.md；过程文件仍在 PR diff 里。删除或移出 git 需用户授权 |
| 05 长期维护 | 部分预研 | `CAPABILITY.md`、`SYNC.md`、exports 分类测试。类型收紧和文件拆分仍可后续 |
| 06 去掉 scoped 注册表 | 未开始 | 计划已写。playground 隔离 demo 要改成 `customComponents` prop |
| 07 `showTooltips` | 未开始 | 计划已写。可与 08 并行；与 06 无代码依赖 |
| 08 `debugPerformance` | 代码已落地 | parse(sync) 日志与测试 |
| 09 公开 API 收口 | 待执行 | 用户点名：1/3/5/6/8 + 观察面板回归。2 用户自删 renderWindow |

未跟踪：`HANDOFF-PLAYGROUND-BUGS.md`、`diagnostics/`。不要 `git add`。

## 已有事实与边界

- 最近评审运行 Solid 包测试 63 项、playground 测试 20 项，以及两者 typecheck，均通过。这只是基线记录，不能代替修改后的验证。
- 旧图表分发与 pre fallback 响应式问题已在当前基线修复并增加测试，不要从旧 handoff 重做同一修复。真实浏览器与生产消费仍需本轮重新证明。
- `HANDOFF-PLAYGROUND-BUGS.md` 和 `diagnostics/` 当前未跟踪，属于已有调查材料；任何计划都不授权直接删除或覆盖。
- 这里的“合并前”是建议的质量关卡；真实尚未实现的能力可以在用户认可的范围内明确限制，不能默默删除需求或用不生效的 props 冒充支持。
- 不修改无关框架架构，不弱化有效测试，不自动提交、推送、改写 Git 历史、发布或部署。文档迁移和文件删除必须先确认引用与内容去向。

接手者先检查 HEAD、工作区和适用的 `AGENTS.md`。每完成一项，记录实现文件、检查命令、结果与剩余问题；不把整份计划直接标记为“全部通过”。普通失败进入修复队列；外部阻塞记录复现并继续独立工作，无事可推进时报告所需输入。

## 最终交付标准

Solid 的实际检查由 CI 执行；公开 API 的支持与限制明确；观察面板反映真实数据；关键浏览器和包消费场景可重跑；PR 中主要保留实现、测试、使用说明和长期设计理由。未偿还的内部维护债务有具体条目，不再散落在互相矛盾的过程文档里。
