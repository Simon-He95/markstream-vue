# 04：收拢文档与整理 PR 范围

优先级：合并前收尾。此计划不授权现在删除文件或改写 Git 历史。

## 目标

让 reviewer 从最终 diff 中读懂产品能力、设计理由、用法、验证和已知限制。移植过程中的任务指令、环境故障、临时路径及重复状态不继续作为当前产品事实。

## 文档处置队列

| 文件 | 建议处理方式 |
| --- | --- |
| 根 `GOAL.md`、`GOAL-PLAYGROUND.md` | 保留任务历史；最终产品 PR 通常不需要。移出前保存可追溯副本或确定的 issue/附件去向 |
| 根 `handoff.md`、`HANDOFF-PLAYGROUND.md` | 历史快照包含“尚无实现”等过时状态，退出当前维护入口；不继续让后来者按旧状态重做工作 |
| 未跟踪 `HANDOFF-PLAYGROUND-BUGS.md`、`diagnostics/` | 保留本地原始证据；把有效输入和断言迁入正式测试。未经确认不删除，不用整包 `git add .` 带进 PR |
| `SOLID_PORTING.md`、`playground-solid/PORTING.md` | 提炼为一份长期设计说明：行为基线、响应式映射、身份、资源所有权、公开消费方式与明确取舍 |
| 两份 `PORTING_STATUS.md` | 合并或形成有明确职责的能力表；每项区分已实现、已验证、已知限制，避免多个互相冲突的完成状态 |
| 两份 `VERIFICATION.md` | 可重跑流程放 scripts/CI，PR 描述记录本次结果；删除“全部已验证”这种超出实际证据的结论 |
| 包与 playground README | 保留并补足接入、启动、示例、真实支持范围、限制和验证入口 |
| 本 `plans/` 目录 | 同样属于实施过程材料；完成后提炼长期结论，不因本轮新增就必须进入最终发布文档 |

若选择移到 issue、外部文档或发送给他人，属于外部写入，需要用户授权。执行者先给出文件级迁移清单及内容去向，再实际处理；不为“PR 干净”丢弃唯一证据。

## 具体步骤

1. 盘点新增文档及互相引用，标注目标合同、历史交接、长期设计、当前能力、运行记录五类用途。以当前代码和计划 01–03 的证据校准状态。
2. 移除对本机绝对路径、旧 scratch 目录和特定 agent 会话的依赖。历史记录注明对应提交，不写成当前版本通过情况；没有新证据的项目保留待验证。
3. 修正测试数、能力范围、hydration 与 peer 缺失的表述。不得把客户端 render、源码关键词或 shell 身份写成更强的验证。
4. 审核 PR 非 Solid 改动：特别是 `test/playground-native-print.test.ts` 的 30 秒 timeout，以及全局 lint ignore、共享 fixtures、锁文件变动。必要改动写出理由，无关稳定性修复建议独立处理；不自动回滚用户代码。
5. 审核新增依赖和锁文件噪声，确认来自本次 Solid 所需依赖，避免借清理升级其他 workspace。根 scripts 和共享框架卡片保持最小接入。
6. 准备最终 PR 标题和描述，围绕新增 Solid renderer 与 playground 的最终行为、支持范围、验证和限制。`wip/unslop` 不作为面向 reviewer 的最终说明；squash/rebase/推送仅在用户明确授权后执行。

## 验收条件

当前文档入口不含互相矛盾的实现状态；长期说明与 README 链接有效；运行证据可通过 scripts/CI 找到，不依赖维护者的临时目录；所有范围外改动有处理决定。PR 描述中的每项验证都有对应实际结果，未实现能力明确列出。

检查 Markdown 链接、`git diff --check` 和最终 diff 范围即可；仅文档整理不要求重跑全部应用测试。若移动/删除文件影响测试或构建路径，运行对应检查。

## 执行记录（2026-09-11）

已做、不删除文件：历史横幅改为“冻结快照 / 不要当现行指令”；去掉 VitePress 里指向 `main` 上尚不存在的 `CAPABILITY.md` 链接；`playground-solid/VERIFICATION.md` 不再依赖 `/tmp` scratch，也不再写“全部已验证”。

### 文件级去向（等授权再移出 git）

| 文件 | 建议 | 内容去向 |
| --- | --- | --- |
| `GOAL.md`、`GOAL-PLAYGROUND.md` | 移出最终产品 PR | 任务历史；能力以 `packages/markstream-solid/CAPABILITY.md` 为准 |
| `handoff.md`、`HANDOFF-PLAYGROUND.md` | 移出最终产品 PR | 过时 agent 指令；实现后不要按“尚无实现”重做 |
| `HANDOFF-PLAYGROUND-BUGS.md`、`diagnostics/` | 保持未跟踪 | 图表分发 / fallback 延迟的原始复现；有效断言已进测试 |
| `SOLID_PORTING.md`、`playground-solid/PORTING.md` | 保留 | 长期设计约定（Svelte 行为基线、资源所有权、响应式映射） |
| 两份 `PORTING_STATUS.md`、两份 `VERIFICATION.md` | 可再收成 CAPABILITY + scripts | 当前已降级为历史台账/日志 |
| `plans/` | 过程材料，通常不进最终产品 diff | 本目录；完成后只留 CAPABILITY / SYNC / README |
| 包与 playground README、`docs/frameworks/solid.md` | 保留 | 产品入口 |

未授权：删除这些文件、改写 Git 历史、更新 GitHub PR 标题/正文、push。

### 建议的 PR 标题和正文（草稿，未发布）

标题：`feat: add markstream-solid renderer and playground`

正文要点：

- Solid 渲染器，行为基线是 Svelte；playground 从 React 18 搬过来，用来展示稳定流式更新、代码块实例保留、自定义节点、图表/Worker。
- `stream` / `codeBlockStream` 与嵌套 auto-smooth 对齐 Svelte；虚拟化 props 是兼容 no-op。
- 验证：`pnpm check:solid`、packed smoke（有/无 optional peers）、SSR hydration e2e、playground 浏览器 e2e。Ubuntu CI 已接线；需确认 GitHub Actions 真正跑过 PR head。
- 已知限制见 `packages/markstream-solid/CAPABILITY.md`。
- 非 Solid：Vue playground 打印测试 30s timeout 保留在本分支，因为根 Vitest job 需要它。
