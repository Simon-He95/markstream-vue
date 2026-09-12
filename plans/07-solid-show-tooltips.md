# 07：让 Solid `showTooltips` 真正生效

优先级：合并前。对照 React `MarkdownRender` 的 `showTooltips`（默认 `true`）：总开关，管 LinkNode、代码块工具栏、以及完成后 HTML 增强里的 tooltip。

## 问题与目标

Solid 已在 `NodeRendererProps` / `SolidRenderContext` 声明 `showTooltips`，`LinkNode` 也会读 `context.showTooltips`。但主渲染器没有把它接到所有真正画 tooltip 的路径：

- `NodeRenderer` 调用 `enhanceRenderedHtml` 时 **不传** `showTooltips`。完成后的 `[title]` / footnote 增强在 `false` 时仍会挂 singleton tooltip。
- `CodeBlockNode` **没有** `showTooltips`，工具栏只有 `aria-label`，没有 React 那种 hover/focus singleton tooltip，总开关也关不掉。
- React 会把 renderer 级 `showTooltips` merge 进 `codeBlockProps`（显式 boolean 才写入，且 `codeBlockProps` 覆盖 renderer）。Solid 没有这步。

目标：`showTooltips={false}` 时，链接、代码块按钮、HTML 增强都不再弹出 Markstream tooltip；默认（未传或 `true`）行为与现在 LinkNode「默认开」一致，并补上代码块 hover tooltip。

## React 对照

React `NodeRenderer`：

- context 带 `showTooltips`
- `enhance` / 代码块 props：`...(typeof showTooltips === 'boolean' ? { showTooltips } : {})`，然后展开 `codeBlockProps`
- `CodeBlockNode`：`showTooltips !== false` 时 `showTooltipForAnchor`；关掉时 `hideTooltip(true)` 并提前 return
- `LinkNode`：`showTooltip={ctx.showTooltips}`；关掉时走原生 `title`

不要求 Solid 复制 React 的每一个 hover 细节，但三条路径都要受同一个 prop 约束。

## 工作队列

1. `NodeRenderer` 把 `props.showTooltips` 传给 `enhanceRenderedHtml`。`false` 时 `enhanceTooltips` 直接 return，header Copy 不写 `title`（`enhanceRenderedHtml.ts` 已有判断，缺的是传入）。
2. `buildRenderContext` 继续转发 `showTooltips`。按 React 把 renderer 级开关 merge 进实际传给 `CodeBlockNode` 的 props：显式 boolean 写入，`codeBlockProps.showTooltips` 优先。
3. `CodeBlockNode` 增加 `showTooltips?: boolean`。默认开。为 Copy/Preview/Expand 等按钮接 `showTooltipForAnchor` / `hideTooltip`，与 React 相同；`false` 时不弹出，必要时清掉已显示的 tooltip。保留 `aria-label`。
4. `LinkNode` 已有 `props.showTooltip ?? context.showTooltips ?? true`。补测试确认 renderer 传入 `false` 时不再调用 singleton tooltip，原生 `title` 仍可用。
5. 测试（jsdom）：
   - `showTooltips={false}`：hover 链接不出现 `.markstream-solid` tooltip 层；`enhanceRenderedHtml` 后 footnote/title 目标也没有 tooltip 监听副作用（或 `isTooltipVisible()` 仍为 false）。
   - 默认或 `true`：链接 hover 能显示 tooltip。
   - 代码块：`true` 时按钮 hover 显示；`false` 时不显示。
   - `codeBlockProps={{ showTooltips: true }}` 能覆盖 renderer 的 `false`（与 React merge 顺序一致）。
6. README / `CAPABILITY.md`：`showTooltips` 从「声明即支持」改成已验证行为；注明默认 `true`，影响 LinkNode、代码块工具栏、HTML 增强。

## 验收与范围

`showTooltips={false}` 可观察地关掉上述三条路径；默认不回退成「链接也没 tooltip」。失败不得靠注释掉 `enhanceTooltips` 或忽略 prop。

运行 `pnpm --filter markstream-solid typecheck/test`。不必为此单独加浏览器 e2e；若改了 playground 默认值再补。

只改 Solid 包、测试和说明。不改 tooltip 定位算法，不把 Vue/React 的虚拟化 tooltip 统计搬过来。
