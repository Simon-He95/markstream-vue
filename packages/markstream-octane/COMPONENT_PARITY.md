# Vue3 ↔ Octane 逐组件对照表（markstream）

说明：
- Vue 源码在 `src/components/*`，Octane 源码在 `packages/markstream-octane/src/components/*`。
- Octane 组件统一从 `packages/markstream-octane/src/index.ts` 导出；样式来自 `markstream-octane/index.css`（选择器前缀 `.markstream-octane`）。
- 绝大多数“节点组件”在两端都是同名组件：输入 `node`（以及 renderer 透传的 `ctx` / `indexKey` / `customId` / `isDark` / `typewriter`），无额外 API 差异。

## 组件映射

| Vue 组件 | Octane 组件 | 备注（props / events / 样式） |
|---|---|---|
| `src/components/AdmonitionNode/AdmonitionNode.vue` | `packages/markstream-octane/src/components/AdmonitionNode/AdmonitionNode.tsrx` | 节点组件（`node` + renderer 透传字段） |
| `src/components/BlockquoteNode/BlockquoteNode.vue` | `packages/markstream-octane/src/components/BlockquoteNode/BlockquoteNode.tsrx` | 节点组件 |
| `src/components/CheckboxNode/CheckboxNode.vue` | `packages/markstream-octane/src/components/CheckboxNode/CheckboxNode.tsrx` | 节点组件 |
| `src/components/CodeBlockNode/CodeBlockNode.vue` | `packages/markstream-octane/src/components/CodeBlockNode/CodeBlockNode.tsrx` | `CodeBlockNodeProps` 两端一致（见 `src/types/component-props.ts` 与 `packages/markstream-octane/src/types/component-props.ts`）；Vue emits `copy`/`previewCode` ↔ Octane `onCopy`/`onPreviewCode` |
| `src/components/DefinitionListNode/DefinitionListNode.vue` | `packages/markstream-octane/src/components/DefinitionListNode/DefinitionListNode.tsrx` | 节点组件 |
| `src/components/EmojiNode/EmojiNode.vue` | `packages/markstream-octane/src/components/EmojiNode/EmojiNode.tsrx` | 节点组件 |
| `src/components/EmphasisNode/EmphasisNode.vue` | `packages/markstream-octane/src/components/EmphasisNode/EmphasisNode.tsrx` | 节点组件 |
| `src/components/FootnoteAnchorNode/FootnoteAnchorNode.vue` | `packages/markstream-octane/src/components/FootnoteAnchorNode/FootnoteAnchorNode.tsrx` | 节点组件 |
| `src/components/FootnoteNode/FootnoteNode.vue` | `packages/markstream-octane/src/components/FootnoteNode/FootnoteNode.tsrx` | 节点组件 |
| `src/components/FootnoteReferenceNode/FootnoteReferenceNode.vue` | `packages/markstream-octane/src/components/FootnoteReferenceNode/FootnoteReferenceNode.tsrx` | 节点组件 |
| `src/components/HardBreakNode/HardBreakNode.vue` | `packages/markstream-octane/src/components/HardBreakNode/HardBreakNode.tsrx` | 节点组件 |
| `src/components/HeadingNode/HeadingNode.vue` | `packages/markstream-octane/src/components/HeadingNode/HeadingNode.tsrx` | 节点组件 |
| `src/components/HighlightNode/HighlightNode.vue` | `packages/markstream-octane/src/components/HighlightNode/HighlightNode.tsrx` | 节点组件 |
| `src/components/HtmlBlockNode/HtmlBlockNode.vue` | `packages/markstream-octane/src/components/HtmlBlockNode/HtmlBlockNode.tsrx` | 节点组件 |
| `src/components/HtmlInlineNode/HtmlInlineNode.vue` | `packages/markstream-octane/src/components/HtmlInlineNode/HtmlInlineNode.tsrx` | 节点组件 |
| `src/components/ImageNode/ImageNode.vue` | `packages/markstream-octane/src/components/ImageNode/ImageNode.tsrx` | `ImageNodeProps` 两端一致；Octane 额外事件：`onLoad`/`onError`/`onClick`（不影响基础 API） |
| `src/components/InlineCodeNode/InlineCodeNode.vue` | `packages/markstream-octane/src/components/InlineCodeNode/InlineCodeNode.tsrx` | 节点组件 |
| `src/components/InsertNode/InsertNode.vue` | `packages/markstream-octane/src/components/InsertNode/InsertNode.tsrx` | 节点组件 |
| `src/components/LinkNode/LinkNode.vue` | `packages/markstream-octane/src/components/LinkNode/LinkNode.tsrx` | `LinkNodeProps` 两端一致；tooltip 使用单例实现（Vue `useSingletonTooltip` ↔ Octane `tooltip/singletonTooltip`） |
| `src/components/ListItemNode/ListItemNode.vue` | `packages/markstream-octane/src/components/ListItemNode/ListItemNode.tsrx` | 节点组件 |
| `src/components/ListNode/ListNode.vue` | `packages/markstream-octane/src/components/ListNode/ListNode.tsrx` | 节点组件 |
| `src/components/MathBlockNode/MathBlockNode.vue` | `packages/markstream-octane/src/components/MathBlockNode/MathBlockNode.tsrx` | `MathBlockNodeProps` 两端一致 |
| `src/components/MathInlineNode/MathInlineNode.vue` | `packages/markstream-octane/src/components/MathInlineNode/MathInlineNode.tsrx` | `MathInlineNodeProps` 两端一致 |
| `src/components/MermaidBlockNode/MermaidBlockNode.vue` | `packages/markstream-octane/src/components/MermaidBlockNode/MermaidBlockNode.tsrx` | `MermaidBlockNodeProps` 两端一致；Vue emits `copy`/`export`/`open-modal`/`toggle-mode` ↔ Octane `onCopy`/`onExport`/`onOpenModal`/`onToggleMode`；全屏为独立 Portal 弹层（样式在 `packages/markstream-octane/src/index.css` 的 `.mermaid-modal-*`） |
| `src/components/NodeRenderer/NodeRenderer.vue` | `packages/markstream-octane/src/components/NodeRenderer.tsrx` | 渲染器本体：增量渲染/虚拟列表/viewport priority；Octane 额外文件在 `packages/markstream-octane/src/components/NodeRenderer/*` |
| `src/components/NodeRenderer/FallbackComponent.vue` | `packages/markstream-octane/src/components/NodeRenderer/FallbackComponent.tsrx` | 未识别节点兜底组件 |
| `src/components/ParagraphNode/ParagraphNode.vue` | `packages/markstream-octane/src/components/ParagraphNode/ParagraphNode.tsrx` | 节点组件 |
| `src/components/PreCodeNode/PreCodeNode.vue` | `packages/markstream-octane/src/components/PreCodeNode/PreCodeNode.tsrx` | Octane 实际实现位于 `packages/markstream-octane/src/components/CodeBlockNode/PreCodeNode.tsrx` 并在此处 re-export |
| `src/components/ReferenceNode/ReferenceNode.vue` | `packages/markstream-octane/src/components/ReferenceNode/ReferenceNode.tsrx` | 节点组件 |
| `src/components/StrikethroughNode/StrikethroughNode.vue` | `packages/markstream-octane/src/components/StrikethroughNode/StrikethroughNode.tsrx` | 节点组件 |
| `src/components/StrongNode/StrongNode.vue` | `packages/markstream-octane/src/components/StrongNode/StrongNode.tsrx` | 节点组件 |
| `src/components/SubscriptNode/SubscriptNode.vue` | `packages/markstream-octane/src/components/SubscriptNode/SubscriptNode.tsrx` | 节点组件 |
| `src/components/SuperscriptNode/SuperscriptNode.vue` | `packages/markstream-octane/src/components/SuperscriptNode/SuperscriptNode.tsrx` | 节点组件 |
| `src/components/TableNode/TableNode.vue` | `packages/markstream-octane/src/components/TableNode/TableNode.tsrx` | 节点组件（注意 table 内部 wrapper/`display: contents` 规则由 `markstream-octane/index.css` 提供） |
| `src/components/TextNode/TextNode.vue` | `packages/markstream-octane/src/components/TextNode/TextNode.tsrx` | 节点组件 |
| `src/components/ThematicBreakNode/ThematicBreakNode.vue` | `packages/markstream-octane/src/components/ThematicBreakNode/ThematicBreakNode.tsrx` | 节点组件 |
| `src/components/Tooltip/Tooltip.vue` | `packages/markstream-octane/src/components/Tooltip/Tooltip.tsrx` | Tooltip 组件本体；常用调用方式是单例 tooltip API（两端一致思路） |
| `src/components/VmrContainerNode/VmrContainerNode.vue` | `packages/markstream-octane/src/components/VmrContainerNode/VmrContainerNode.tsrx` | 节点组件 |

## Octane 侧额外内部目录（无 Vue 对应）

- `packages/markstream-octane/src/components/Math/*`：Math 渲染内部拆分实现（对外仍由 `MathInlineNode` / `MathBlockNode` 对齐 Vue API）。
