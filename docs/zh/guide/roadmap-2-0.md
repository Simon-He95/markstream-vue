---
title: 2.0 路线图
description: markstream-vue 2.0.0 路线图与任务清单。跟踪 2.0 的破坏性变更、发布验证、运行时验证与遗留清理。
keywords:
  - 2.0 路线图
  - 破坏性变更
  - 发布验证
---

# 2.0.0 路线图

`markstream-vue@2.0.0` 是一个破坏性的大版本。本页是 2.0 范围的持续更新路线图：每个目标带任务清单，已完成项标注 commit/PR，同一份清单在 GitHub 的 `2.0.0` milestone 下跟踪。

## 目标 1：移除 Monaco 与 stream-markdown，只保留 `stream-diffs` ✅

2.0 的核心破坏性变更：移除基于 Monaco 的代码块 API 与基于 Shiki 的 `stream-markdown` 渲染器。代码块只由 `stream-diffs` 渲染（未安装可选 peer 时回退为普通 `<pre>`）。

跟踪于 [issue #615](https://github.com/Simon-He95/markstream-vue/issues/615)。实现在分支 `2.0.0-remove-monaco` 上，尚未合并到 `main`；请通过 PR 合并后再关闭本清单。本页中「— `2.0.0-remove-monaco` 分支」表示该项在该分支上完成。

- [x] 移除 `monacoOptions` / `codeBlockMonacoOptions` 与全部 `CodeBlockMonaco*` 参数/API（无替代；diff 选项回退 stream-diffs 内置默认值）— `2.0.0-remove-monaco` 分支
- [x] 删除 `stream-markdown` 的 `MarkdownCodeBlockNode` 组件及其样式 — `2.0.0-remove-monaco` 分支
- [x] `codeRenderer` 取值 `'monaco'` → `'stream-diffs'`；删除 `'shiki'` / `'markdown'` 渲染器类型 — `2.0.0-remove-monaco` 分支
- [x] 公共标识符去 Monaco 命名（`CodeBlockTheme`、`resolveLanguageId`、`getStreamDiffsRuntime`）— `2.0.0-remove-monaco` 分支
- [x] vue2 / react / svelte / angular / octane 迁移到仅 stream-diffs — `2.0.0-remove-monaco` 分支
- [x] 更新测试与快照；全量测试通过（313 文件 / 2684 用例）— `2.0.0-remove-monaco` 分支
- [x] 清理 playground（依赖、vite 配置、sandbox 页面）— `2.0.0-remove-monaco` 分支
- [x] 更新文档（en + zh）、LLM 文档、包描述 — `2.0.0-remove-monaco` 分支

## 目标 2：2.0.0 发布验证

在发布前跑通常规发布门禁。

- [ ] 全量库构建（`pnpm build`）与 DTS 生成
- [ ] `pnpm test:api:strict`（public API 快照、exports、子路径隔离）
- [ ] 各框架 smoke：react / octane / vue2-cjs / minimal / pack（可选 peer）
- [ ] 收敛 `check:peer-deps` 工作区根目录可选 peer
- [ ] 版本号提升到 2.0.0 并编写 release notes

## 目标 3：运行时视觉验证

在真实浏览器中验证 stream-diffs 交接（目前迁移仅通过单测/类型检查验证）。

- [ ] playground：代码块高度同步、diff 主题切换、inline/side-by-side 行为
- [ ] `test:e2e:octane-playground` 在 stream-diffs 选择器下通过
- [ ] svelte 在 `.is-diff .code-block-body` 上的 diff 颜色映射

## 目标 4：遗留清理（低优先）

目标 1 中刻意未纳入的小型一致性清理。

- [ ] 重命名 svelte / react / vue2 包内的 Monaco 命名内部变量（如 `resolvedMonacoOptions`）
- [ ] 更新仍使用旧 `.stream-monaco-diff-*` 选择器的手动 e2e 调试脚本（`e2e-diff-theme-switch.mjs`、`e2e-codeblock-diff-line-info-debug.mjs`）
- [ ] 移除 react / vue2 代码块主题类型中未使用的 `langs` 字段
- [ ] 已知既有 typecheck 问题（不在 2.0 范围）：`markstream-core` rootDir TS6059、`HtmlPreviewFrame.vue` 的 `import.meta.env`

## 相关

- GitHub milestone：`2.0.0`
- 路线图 checklist issue：与 `2.0.0` milestone 同步跟踪
- 1.0 基线：[1.0 Release Readiness](/zh/guide/release-1-0)
