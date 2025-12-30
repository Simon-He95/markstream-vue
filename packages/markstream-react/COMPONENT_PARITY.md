# Vue3 ↔ React 逐组件对照表（markstream）

说明：
- Vue 源码在 `src/components/*`，React 源码在 `packages/markstream-react/src/components/*`。
- React 组件统一从 `packages/markstream-react/src/index.ts` 导出；样式来自 `markstream-react/index.css`（选择器前缀 `.markstream-vue` 与 Vue 保持一致）。
- 绝大多数“节点组件”在两端都是同名组件：输入 `node`（以及 renderer 透传的 `ctx` / `indexKey` / `customId` / `isDark` / `typewriter`），无额外 API 差异。

## 组件映射

| Vue 组件 | React 组件 | 备注（props / events / 样式） |
|---|---|---|
| `src/components/AdmonitionNode/AdmonitionNode.vue` | `packages/markstream-react/src/components/AdmonitionNode/AdmonitionNode.tsx` | 节点组件（`node` + renderer 透传字段） |
| `src/components/BlockquoteNode/BlockquoteNode.vue` | `packages/markstream-react/src/components/BlockquoteNode/BlockquoteNode.tsx` | 节点组件 |
| `src/components/CheckboxNode/CheckboxNode.vue` | `packages/markstream-react/src/components/CheckboxNode/CheckboxNode.tsx` | 节点组件 |
| `src/components/CodeBlockNode/CodeBlockNode.vue` | `packages/markstream-react/src/components/CodeBlockNode/CodeBlockNode.tsx` | `CodeBlockNodeProps` 两端一致（见 `src/types/component-props.ts` 与 `packages/markstream-react/src/types/component-props.ts`）；Vue emits `copy`/`previewCode` ↔ React `onCopy`/`onPreviewCode` |
| `src/components/DefinitionListNode/DefinitionListNode.vue` | `packages/markstream-react/src/components/DefinitionListNode/DefinitionListNode.tsx` | 节点组件 |
| `src/components/EmojiNode/EmojiNode.vue` | `packages/markstream-react/src/components/EmojiNode/EmojiNode.tsx` | 节点组件 |
| `src/components/EmphasisNode/EmphasisNode.vue` | `packages/markstream-react/src/components/EmphasisNode/EmphasisNode.tsx` | 节点组件 |
| `src/components/FootnoteAnchorNode/FootnoteAnchorNode.vue` | `packages/markstream-react/src/components/FootnoteAnchorNode/FootnoteAnchorNode.tsx` | 节点组件 |
| `src/components/FootnoteNode/FootnoteNode.vue` | `packages/markstream-react/src/components/FootnoteNode/FootnoteNode.tsx` | 节点组件 |
| `src/components/FootnoteReferenceNode/FootnoteReferenceNode.vue` | `packages/markstream-react/src/components/FootnoteReferenceNode/FootnoteReferenceNode.tsx` | 节点组件 |
| `src/components/HardBreakNode/HardBreakNode.vue` | `packages/markstream-react/src/components/HardBreakNode/HardBreakNode.tsx` | 节点组件 |
| `src/components/HeadingNode/HeadingNode.vue` | `packages/markstream-react/src/components/HeadingNode/HeadingNode.tsx` | 节点组件 |
| `src/components/HighlightNode/HighlightNode.vue` | `packages/markstream-react/src/components/HighlightNode/HighlightNode.tsx` | 节点组件 |
| `src/components/HtmlBlockNode/HtmlBlockNode.vue` | `packages/markstream-react/src/components/HtmlBlockNode/HtmlBlockNode.tsx` | 节点组件 |
| `src/components/HtmlInlineNode/HtmlInlineNode.vue` | `packages/markstream-react/src/components/HtmlInlineNode/HtmlInlineNode.tsx` | 节点组件 |
| `src/components/ImageNode/ImageNode.vue` | `packages/markstream-react/src/components/ImageNode/ImageNode.tsx` | `ImageNodeProps` 两端一致；React 额外事件：`onLoad`/`onError`/`onClick`（不影响基础 API） |
| `src/components/InlineCodeNode/InlineCodeNode.vue` | `packages/markstream-react/src/components/InlineCodeNode/InlineCodeNode.tsx` | 节点组件 |
| `src/components/InsertNode/InsertNode.vue` | `packages/markstream-react/src/components/InsertNode/InsertNode.tsx` | 节点组件 |
| `src/components/LinkNode/LinkNode.vue` | `packages/markstream-react/src/components/LinkNode/LinkNode.tsx` | `LinkNodeProps` 两端一致；tooltip 使用单例实现（Vue `useSingletonTooltip` ↔ React `tooltip/singletonTooltip`） |
| `src/components/ListItemNode/ListItemNode.vue` | `packages/markstream-react/src/components/ListItemNode/ListItemNode.tsx` | 节点组件 |
| `src/components/ListNode/ListNode.vue` | `packages/markstream-react/src/components/ListNode/ListNode.tsx` | 节点组件 |
| `src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue` | `packages/markstream-react/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.tsx` | 节点组件（markdown fenced code 的轻量渲染） |
| `src/components/MathBlockNode/MathBlockNode.vue` | `packages/markstream-react/src/components/MathBlockNode/MathBlockNode.tsx` | `MathBlockNodeProps` 两端一致 |
| `src/components/MathInlineNode/MathInlineNode.vue` | `packages/markstream-react/src/components/MathInlineNode/MathInlineNode.tsx` | `MathInlineNodeProps` 两端一致 |
| `src/components/MermaidBlockNode/MermaidBlockNode.vue` | `packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode.tsx` | `MermaidBlockNodeProps` 两端一致；Vue emits `copy`/`export`/`open-modal`/`toggle-mode` ↔ React `onCopy`/`onExport`/`onOpenModal`/`onToggleMode`；全屏为独立 Portal 弹层（样式在 `packages/markstream-react/src/index.css` 的 `.mermaid-modal-*`） |
| `src/components/NodeRenderer/NodeRenderer.vue` | `packages/markstream-react/src/components/NodeRenderer.tsx` | 渲染器本体：增量渲染/虚拟列表/viewport priority；React 额外文件在 `packages/markstream-react/src/components/NodeRenderer/*` |
| `src/components/NodeRenderer/FallbackComponent.vue` | `packages/markstream-react/src/components/NodeRenderer/FallbackComponent.tsx` | 未识别节点兜底组件 |
| `src/components/ParagraphNode/ParagraphNode.vue` | `packages/markstream-react/src/components/ParagraphNode/ParagraphNode.tsx` | 节点组件 |
| `src/components/PreCodeNode/PreCodeNode.vue` | `packages/markstream-react/src/components/PreCodeNode/PreCodeNode.tsx` | React 实际实现位于 `packages/markstream-react/src/components/CodeBlockNode/PreCodeNode.tsx` 并在此处 re-export |
| `src/components/ReferenceNode/ReferenceNode.vue` | `packages/markstream-react/src/components/ReferenceNode/ReferenceNode.tsx` | 节点组件 |
| `src/components/StrikethroughNode/StrikethroughNode.vue` | `packages/markstream-react/src/components/StrikethroughNode/StrikethroughNode.tsx` | 节点组件 |
| `src/components/StrongNode/StrongNode.vue` | `packages/markstream-react/src/components/StrongNode/StrongNode.tsx` | 节点组件 |
| `src/components/SubscriptNode/SubscriptNode.vue` | `packages/markstream-react/src/components/SubscriptNode/SubscriptNode.tsx` | 节点组件 |
| `src/components/SuperscriptNode/SuperscriptNode.vue` | `packages/markstream-react/src/components/SuperscriptNode/SuperscriptNode.tsx` | 节点组件 |
| `src/components/TableNode/TableNode.vue` | `packages/markstream-react/src/components/TableNode/TableNode.tsx` | 节点组件（注意 table 内部 wrapper/`display: contents` 规则由 `markstream-react/index.css` 提供） |
| `src/components/TextNode/TextNode.vue` | `packages/markstream-react/src/components/TextNode/TextNode.tsx` | 节点组件 |
| `src/components/ThematicBreakNode/ThematicBreakNode.vue` | `packages/markstream-react/src/components/ThematicBreakNode/ThematicBreakNode.tsx` | 节点组件 |
| `src/components/Tooltip/Tooltip.vue` | `packages/markstream-react/src/components/Tooltip/Tooltip.tsx` | Tooltip 组件本体；常用调用方式是单例 tooltip API（两端一致思路） |
| `src/components/VmrContainerNode/VmrContainerNode.vue` | `packages/markstream-react/src/components/VmrContainerNode/VmrContainerNode.tsx` | 节点组件 |

## React 侧额外内部目录（无 Vue 对应）

- `packages/markstream-react/src/components/Math/*`：Math 渲染内部拆分实现（对外仍由 `MathInlineNode` / `MathBlockNode` 对齐 Vue API）。
