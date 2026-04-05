# Component Style Inventory

> 每个组件的当前样式详情，按功能分类。
> 来源：`src/components/` 下各 `.vue` 文件的 `<style>` 块。

---

## 1. 文本类组件

### 1.1 HeadingNode — 标题

**文件**：`src/components/HeadingNode/HeadingNode.vue`

| 级别 | 类名 | 字号 | 字重 | 行高 | 上下边距 |
|---|---|---|---|---|---|
| h1 | `.heading-1` | `text-4xl` | `extrabold` | `calc(10/9*1)` | `0` / `calc(8/9*1em)` |
| h2 | `.heading-2` | `text-2xl` | `bold` | `calc(4/3*1)` | `2rem` / `1rem` |
| h3 | `.heading-3` | `text-xl` | `semibold` | `calc(5/3*1)` | `calc(8/5*1em)` / `calc(3/5*1em)` |
| h4 | `.heading-4` | `text-base` | `semibold` | 默认 | `1.5rem` / `0.5rem` |
| h5 | `.heading-5` | `text-base` | 默认 | 默认 | `0` / `0` |
| h6 | `.heading-6` | `text-base` | 默认 | 默认 | `0` / `0` |

- 通用类 `.heading-node`：`font-medium leading-tight`
- 特殊规则：`hr + .heading-node` 取消 `margin-top`

---

### 1.2 ParagraphNode — 段落

**文件**：`src/components/ParagraphNode/ParagraphNode.vue`

- `.paragraph-node`：`margin: 1.25em 0`
- 列表内嵌套时：`li .paragraph-node { margin: 0 }`

---

### 1.3 StrongNode / EmphasisNode — 加粗与斜体

- 无自定义样式，继承 HTML 默认 `<strong>` / `<em>` 行为

---

### 1.4 StrikethroughNode — 删除线

**文件**：`src/components/StrikethroughNode/StrikethroughNode.vue`

- `.strikethrough-node`：`text-decoration: line-through`

---

### 1.5 HighlightNode — 高亮

**文件**：`src/components/HighlightNode/HighlightNode.vue`

- `.highlight-node`：`background-color: #ffff00`，`padding: 0 0.2rem`
- **待改进**：仅有亮黄色，无暗色模式适配

---

### 1.6 SubscriptNode / SuperscriptNode — 上下标

- 无自定义样式，使用 HTML 原生 `<sub>` / `<sup>`

---

### 1.7 InsertNode — 插入标记

- 使用 HTML 原生 `<ins>` 样式

---

### 1.8 EmojiNode — 表情

**文件**：`src/components/EmojiNode/EmojiNode.vue`

- `.emoji-node`：`display: inline-block`

---

## 2. 链接与引用

### 2.1 LinkNode — 链接

**文件**：`src/components/LinkNode/LinkNode.vue`

| 属性 | 值 |
|---|---|
| 颜色 | `var(--link-color, #0366d6)` |
| 装饰 | 默认无下划线，hover 显示 |
| hover 效果 | `text-decoration: underline`，`text-underline-offset: 0.2rem` |
| 加载态 | 脉冲下划线动画（`underlinePulse` keyframe） |

CSS 变量（可自定义）：

```
--link-color, --underline-height, --underline-bottom,
--underline-opacity, --underline-rest-opacity,
--underline-duration, --underline-timing, --underline-iteration
```

---

### 2.2 FootnoteNode — 脚注

**文件**：`src/components/FootnoteNode/FootnoteNode.vue`

- 容器：`flex mt-2 mb-2 text-sm leading-relaxed`
- 上方分隔线：`border-t border-[#eaecef] pt-2`

### 2.3 FootnoteAnchorNode / FootnoteReferenceNode

- 上标链接样式，无复杂自定义

---

## 3. 代码类组件

### 3.1 InlineCodeNode — 行内代码

**文件**：`src/components/InlineCodeNode/InlineCodeNode.vue`

| 属性 | 值 |
|---|---|
| 字号 | `85%` |
| 字体 | `font-mono` |
| 颜色 | `hsl(var(--foreground))` |
| 背景 | `hsl(var(--secondary))` |
| 边框 | `1px solid hsl(var(--border) / 0.9)` |
| 内边距 | `px-1 py-0.5` |
| 圆角 | `rounded` |
| 换行 | `whitespace-normal break-words` |

流式更新动画：`inline-code-stream-update-fade-a/b`，duration 900ms

---

### 3.2 CodeBlockNode — 代码块

**文件**：`src/components/CodeBlockNode/CodeBlockNode.vue`（~2700 行）

**容器**：
- `contain: content`，`content-visibility: auto`
- `container-type: inline-size`（支持 Container Queries）
- `contain-intrinsic-size: 320px 180px`

**Header**：
- `gap: 16px`
- 标题：`font-size: 14px`，`font-weight: 650`，`letter-spacing: 0.01em`
- 说明：`font-size: 12px`，62% 透明度
- 操作按钮：`gap: 8px`，hover 态 `scale(0.98)`

**代码编辑器区域**：
- 使用 Monaco Editor / Shiki 高亮
- 主题可通过 `darkTheme` / `lightTheme` prop 切换
- 大量 `--markstream-code-*` 和 `--markstream-diff-*` CSS 变量（详见 tokens.md）

**加载骨架屏**：shimmer 动画，`linear-gradient(90deg, ...)` 背景滑动

**Diff 视图**：完整的增删行/内联 diff 颜色系统，含 Light/Dark 两套

---

### 3.3 PreCodeNode

**文件**：`src/components/PreCodeNode/PreCodeNode.vue`

- 简化版代码块，用于无高亮场景

---

### 3.4 MarkdownCodeBlockNode

- Markdown 渲染的代码块封装

---

## 4. 容器类组件

### 4.1 BlockquoteNode — 引用块

**文件**：`src/components/BlockquoteNode/BlockquoteNode.vue`

| 属性 | 值 |
|---|---|
| 字重 | `500` |
| 字体样式 | `italic` |
| 左边框 | `0.25rem solid var(--blockquote-border-color, #e2e8f0)` |
| 左内边距 | `1em` |
| 上下边距 | `1.6em` |
| 引号字符 | `"\201C" "\201D" "\2018" "\2019"` |

---

### 4.2 AdmonitionNode — 提示框

**文件**：`src/components/AdmonitionNode/AdmonitionNode.vue`

**基础样式**：
- 左边框：`4px solid`
- 圆角：`4px`
- 无 `overflow: hidden`

**类型色彩**：

| 类型 | 边框色 | 标题背景 |
|---|---|---|
| note / info | `#448aff` | `rgba(68, 138, 255, 0.06)` |
| tip | `#00bfa5` | `rgba(0, 191, 165, 0.06)` |
| warning / caution | `#ff9100` | `rgba(255, 145, 0, 0.06)` |
| danger / error | `#ff5252` | `rgba(255, 82, 82, 0.06)` |

**Dark 模式**：背景透明度从 6% 提升到 12%

**标题栏**：`padding: 0.5rem 1rem`，`font-weight: 600`，带图标
**内容区**：`padding: 0.5rem 1rem 1rem`
**折叠按钮**：`border-radius: 4px`，`focus: outline 2px`

---

### 4.3 VmrContainerNode — 通用容器

- 自定义容器节点封装

---

## 5. 列表类组件

### 5.1 ListNode — 列表

**文件**：`src/components/ListNode/ListNode.vue`

- `.list-node`：`my-5 pl-[calc(13/8*1em)]`
- `.list-decimal`：`list-style-type: decimal`
- `.list-disc`：`list-style-type: disc`
- 移动端：`max-lg:my-[calc(4/3*1em)] max-lg:pl-[calc(14/9*1em)]`

### 5.2 ListItemNode — 列表项

**文件**：`src/components/ListItemNode/ListItemNode.vue`

- `.list-item`：`pl-1.5 my-2`，`dir="auto"`
- 有序列表标记色：`var(--list-item-counter-marker, #64748b)`，`line-height: 1.6`
- 无序列表标记色：`var(--list-item-marker, #cbd5e1)`

### 5.3 CheckboxNode — 复选框

**文件**：`src/components/CheckboxNode/CheckboxNode.vue`

- `.checkbox-node`：`margin-right: 0.5rem`，`vertical-align: middle`
- `.checkbox-input`：`margin: 0`，`cursor: default`

---

### 5.4 DefinitionListNode — 定义列表

**文件**：`src/components/DefinitionListNode/DefinitionListNode.vue`

- `.definition-list`：`margin: 0 0 1rem`
- `.definition-term`：`font-weight: 600`，`margin-top: 0.5rem`
- `.definition-desc`：`margin-left: 1rem`，`margin-bottom: 0.5rem`

---

## 6. 表格组件

### 6.1 TableNode — 表格

**文件**：`src/components/TableNode/TableNode.vue`

**容器**：
- `.table-node-wrapper`：`max-width: 100%`，`overflow-x: auto`，`-webkit-overflow-scrolling: touch`，`scrollbar-gutter: stable`

**表格**：
- `table-layout: fixed`，`width: 100%`，`border-collapse: collapse`
- `my-8 text-sm`
- `th`：`font-semibold p-[calc(4/7*1em)]`
- `td`：`p-[calc(4/7*1em)]`
- 边框色：`var(--table-border, #cbd5e1)`

**加载态**：shimmer 骨架动画 + 旋转 spinner

**无障碍**：`.sr-only` 屏幕阅读器文本

---

## 7. 媒体类组件

### 7.1 ImageNode — 图片

**文件**：`src/components/ImageNode/ImageNode.vue`

- `.image-node__img`：`max-width: 24rem`
- 内联图片：`display: inline-block`，`vertical-align: middle`，无固定尺寸
- 切换动画：`opacity 220ms ease` + `translateY(6px)` 过渡
- 加载旋转器：`border: 2px solid`，`animate-spin`

---

### 7.2 MermaidBlockNode — Mermaid 图表

**文件**：`src/components/MermaidBlockNode/MermaidBlockNode.vue`

**容器**：`rounded-lg border shadow-sm overflow-hidden`

**Header**：
- Light：`bg-gray-50 border-gray-200`
- Dark：`bg-gray-800 border-gray-700/30`
- 模式切换按钮带 `shadow-sm`

**图表区域**：
- `.mermaid-container`：`min-h-[360px]`，`transition-[height] duration-150 ease-out`
- `content-visibility: auto`，`contain: content`，`contain-intrinsic-size: 360px 240px`
- 支持缩放、拖拽（`cursor-grab` / `cursor-grabbing`）

**全屏弹窗**：
- 遮罩：`bg-black/70`，`z-50`
- 面板：`shadow-lg`，入场 `scale(0.98)→1.0`

**操作按钮**：
- Light：`text-gray-600 hover:bg-gray-200`
- Dark：`text-gray-400 hover:bg-gray-700`
- Active：`scale(0.98)`

---

### 7.3 MathBlockNode / MathInlineNode — 数学公式

**文件**：`src/components/MathBlockNode/MathBlockNode.vue`

**块级**：
- `text-center overflow-x-auto min-h-[40px]`
- 加载遮罩：`backdrop-filter: blur(2px)`
- Spinner：`20px`，`border: 2px solid`，`0.8s linear spin`
- 渲染中：`opacity: 0.3`，`transition: opacity 0.2s ease`
- 切换：`opacity 0.3s ease`

---

### 7.4 D2BlockNode — D2 图表

- 类似 MermaidBlockNode，用于 D2 图表渲染

### 7.5 InfographicBlockNode — 信息图

- 信息图嵌入容器

---

## 8. 分隔与装饰组件

### 8.1 ThematicBreakNode — 分割线

**文件**：`src/components/ThematicBreakNode/ThematicBreakNode.vue`

- `.hr-node`：`border-t border-[var(--hr-border-color, #e2e8f0)] my-12`

---

## 9. HTML 嵌入

### 9.1 HtmlBlockNode / HtmlInlineNode

- 原始 HTML 渲染，样式由内容自身决定

---

## 10. 辅助组件

### 10.1 Tooltip — 提示浮层

**文件**：`src/components/Tooltip/Tooltip.vue`

| 属性 | Light | Dark |
|---|---|---|
| 背景 | `bg-white` | `bg-gray-900` |
| 文字 | `text-gray-900` | `text-white` |
| 边框 | `border-gray-200` | `border-gray-700` |
| 圆角 | `rounded-md` | 同 |
| 阴影 | `shadow-md` | 同 |
| 层级 | `z-[9999]` | 同 |

入场动画：`opacity 120ms linear`，`translateY(-6px) scale(0.98) → 0 scale(1)`
位移动画：`transform 220ms cubic-bezier(.16,1,.3,1)`

---

### 10.2 NodeRenderer — 渲染器

**文件**：`src/components/NodeRenderer/NodeRenderer.vue`

- 根容器传递 `isDark` prop 到所有子组件
- 使用 `.markstream-vue` 作为作用域根类

---

### 10.3 ReferenceNode — 引用

- 引用标记渲染
