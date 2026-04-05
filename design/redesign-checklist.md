# Redesign Checklist

> 所有需要重新设计的元素清单，按优先级和类别组织。
> 架构方案：**带默认样式 + CSS 变量全量可定制**（详见 architecture.md）

---

## 0. Token 化改造（最高优先级，前置工作）

> 所有后续设计工作的基础。详细架构见 `architecture.md`。

- [ ] **定义 Base Tokens** — 在 `index.css` 中建立完整的基础变量集（色彩、排版、间距、圆角、阴影）
- [ ] **定义 Semantic Tokens** — 组件级语义变量，引用 Base Tokens（如 `--code-bg: var(--secondary)`）
- [ ] **逐组件替换硬编码值** — 把所有组件中的硬编码色值、间距替换为 Semantic Token 引用
- [ ] **补全 Dark Base Tokens** — `.dark` 下覆盖全部 Base Tokens，实现完整暗色
- [ ] **移除组件级 `.is-dark` CSS** — 暗色样式全部由 Base Token 覆盖驱动，组件不再单独处理
- [ ] **统一暗色触发方式** — 去掉 `.is-dark`，统一为根容器 `.dark` 类

---

## A. 全局体系（高优先级）

### A1. Design Tokens 统一

- [ ] **CSS 变量命名规范** — 当前全局用 HSL 裸值 (`--border: 214.3 31.8% 91.4%`)，组件用 HEX (`#111827`)、RGB (`rgb(229 231 235)`)、rgba 混用。需统一为一套命名和格式体系
- [ ] **颜色格式统一** — 决定统一使用 HSL、HEX 还是 oklch，消除混用
- [ ] **语义色彩层级** — 目前仅 6 个全局变量，缺乏 `--accent`、`--destructive`、`--success`、`--warning` 等语义色
- [ ] **组件硬编码颜色提取** — 大量颜色硬编码在组件中：`#e2e8f0`、`#eaecef`、`#cbd5e1`、`#64748b`、`#0366d6`、`#ffff00` 等，需抽取为全局变量

### A2. 暗色模式补全

- [ ] **HighlightNode** — 高亮仅 `#ffff00`，暗色下刺眼且与暗色背景冲突
- [ ] **FootnoteNode** — 固定 `#eaecef` 边框色，无暗色适配
- [ ] **BlockquoteNode** — `--blockquote-border-color` 无暗色默认值
- [ ] **TableNode** — `--table-border` 无暗色默认值
- [ ] **ListItemNode** — `--list-item-marker` / `--list-item-counter-marker` 无暗色默认值
- [ ] **ThematicBreakNode** — `--hr-border-color` 无暗色默认值
- [ ] **ImageNode** — 无暗色背景适配

### A3. 暗色触发方式统一

- [ ] **统一暗色类名** — 全局用 `.dark`，组件用 `.is-dark`，MermaidBlockNode 用条件 Tailwind 类，需统一为一种方式
- [ ] **消除冗余判断** — `isDark` prop 传递链 + CSS class + media query 三层并存，简化为清晰的单一优先级链

---

## B. 色彩体系（高优先级）

### B1. 基础色板

- [ ] **重新定义色板** — 当前 Light/Dark 色彩对比度、和谐度需审查
- [ ] **灰阶系统** — 散落多个灰色系：Tailwind gray、slate、自定义 HEX，需统一
- [ ] **中性色梯度** — 建立从 50-950 的完整中性色阶（用于背景、边框、文字等）

### B2. 语义色彩

- [ ] **Admonition 色彩** — `#448aff`、`#00bfa5`、`#ff9100`、`#ff5252` 需要重新评估与整体色板的协调性
- [ ] **Diff 色彩** — Added/Removed 的 Light/Dark 配色需与新色板统一
- [ ] **Link 色** — `#0366d6` 来自 GitHub 风格，需要决定是否保留
- [ ] **Highlight 色** — `#ffff00` 过于刺眼，需要更精致的方案

### B3. 对比度与可读性

- [ ] **WCAG AA 达标检查** — 所有前景/背景色组合的对比度检查
- [ ] **暗色模式对比度** — 确保暗色下文字可读性

---

## C. 排版系统（中优先级）

### C1. 标题层级

- [ ] **h1-h6 字号梯度** — 当前 h4/h5/h6 都是 `text-base`，层级区分不足
- [ ] **标题间距** — 使用 calc 表达式（如 `calc(8/9*1em)`），可读性差，考虑简化
- [ ] **标题字重梯度** — extrabold → bold → semibold → semibold → 默认，h5/h6 缺乏区分

### C2. 正文排版

- [ ] **段落间距** — `1.25em` 是否合适需评估
- [ ] **行高系统** — 各标题用不同 calc 行高，缺乏统一的行高阶梯
- [ ] **字体栈** — 未显式定义，依赖 Tailwind 默认，考虑是否需要自定义

### C3. 代码排版

- [ ] **行内代码字号** — `85%` 与正文的视觉平衡
- [ ] **代码块字号** — `12px` 固定值，缺乏响应式
- [ ] **代码标题字号** — `14px` / `12px`，考虑是否与排版系统关联

---

## D. 间距系统（中优先级）

### D1. 垂直间距

- [ ] **统一间距阶梯** — 当前混用 rem、em、calc 表达式、Tailwind 间距值
- [ ] **块间距规范** — 段落 `1.25em`、引用块 `1.6em`、列表 `1.25rem`、表格 `2rem`、分割线 `3rem`，缺乏统一节奏
- [ ] **嵌套间距** — 列表内段落归零、其他嵌套场景需检查

### D2. 水平间距

- [ ] **列表缩进** — `calc(13/8*1em)` 难以理解，考虑使用更直观的值
- [ ] **提示框内边距** — `0.5rem 1rem` 是否与其他容器协调
- [ ] **表格单元格** — `calc(4/7*1em)` 不够直观

---

## E. 边框与装饰（中优先级）

### E1. 边框系统

- [ ] **边框色统一** — 至少 5 种边框色散落各处：`var(--border)`、`#eaecef`、`#e2e8f0`、`#cbd5e1`、`rgb(229 231 235)`
- [ ] **边框粗细** — `1px`、`0.25rem`、`4px` 混用
- [ ] **边框圆角** — `rounded`(4px)、`4px`、`rounded-md`(6px)、`rounded-lg`(8px) 混用，需建立圆角阶梯

### E2. 阴影系统

- [ ] **阴影层级** — `shadow-sm`、`shadow-md`、`shadow-lg` 加上自定义 Diff 阴影，需统一为设计令牌
- [ ] **暗色阴影** — 当前阴影在暗色下效果需检查

### E3. 分隔线

- [ ] **ThematicBreakNode** — 仅 `border-t`，考虑是否需要更多样式选项
- [ ] **FootnoteNode** — 使用独立边框色 `#eaecef`，应统一

---

## F. 组件逐一审查

### F1. 代码块（CodeBlockNode）— 复杂度最高

- [ ] Header 布局与视觉
- [ ] 操作按钮样式
- [ ] 加载骨架屏效果
- [ ] Diff 视图完整样式
- [ ] Diff 阴影和渐变（是否过度设计？）
- [ ] Monaco 主题集成
- [ ] Container Query 断点
- [ ] 行号区域样式

### F2. 提示框（AdmonitionNode）

- [ ] 整体视觉风格（左边框 vs 全边框 vs 背景色块）
- [ ] 图标设计
- [ ] 折叠交互
- [ ] 4 种语义类型的色彩协调
- [ ] 暗色模式效果

### F3. 表格（TableNode）

- [ ] 表头样式
- [ ] 斑马纹/分隔线选择
- [ ] 溢出横向滚动指示
- [ ] 加载态设计
- [ ] 对齐方式视觉

### F4. Mermaid 图表（MermaidBlockNode）

- [ ] 容器边框与阴影
- [ ] Header 栏布局
- [ ] 模式切换按钮组
- [ ] 缩放/拖拽交互反馈
- [ ] 全屏弹窗设计
- [ ] 操作按钮组样式

### F5. 数学公式（MathBlockNode）

- [ ] 加载态（blur 遮罩是否合适）
- [ ] 渲染过渡效果
- [ ] 块级/内联一致性

### F6. 图片（ImageNode）

- [ ] 最大宽度（`24rem` 是否合理）
- [ ] 占位与加载态
- [ ] 错误态设计
- [ ] 切换过渡效果

### F7. 链接（LinkNode）

- [ ] 链接色
- [ ] hover 效果
- [ ] 加载脉冲动画
- [ ] 外部链接指示

### F8. 引用块（BlockquoteNode）

- [ ] 左边框风格
- [ ] 斜体是否保留
- [ ] 嵌套引用视觉

### F9. 列表（ListNode / ListItemNode）

- [ ] 标记颜色与样式
- [ ] 嵌套缩进
- [ ] 任务列表（Checkbox）样式

### F10. Tooltip

- [ ] 背景/边框/阴影
- [ ] 入场出场动画
- [ ] 箭头指示器（当前无箭头）

### F11. 其他组件

- [ ] HighlightNode — 高亮色
- [ ] StrikethroughNode — 删除线样式
- [ ] SubscriptNode / SuperscriptNode — 上下标
- [ ] EmojiNode — 表情显示
- [ ] DefinitionListNode — 定义列表排版
- [ ] FootnoteNode — 脚注分隔与排版
- [ ] HtmlBlockNode / HtmlInlineNode — HTML 嵌入样式隔离
- [ ] D2BlockNode — D2 图表容器
- [ ] InfographicBlockNode — 信息图容器

---

## G. 动画与交互（低优先级）

### G1. 动画时长体系

- [ ] **建立统一时长阶梯** — 当前 120ms / 150ms / 180ms / 200ms / 220ms / 300ms / 900ms / 1600ms 过于分散
- [ ] **缓动函数规范** — ease / ease-out / ease-in-out / linear / cubic-bezier 各用各的

### G2. 交互反馈

- [ ] **按钮点击效果** — `scale(0.98)` 是否统一应用于所有可交互元素
- [ ] **Focus 状态** — 仅 Admonition 折叠按钮有 focus outline，其他按钮需补全
- [ ] **Hover 效果** — 各组件 hover 效果不统一

### G3. 加载态

- [ ] **Shimmer 动画** — CodeBlock 和 Table 各自实现，需抽取为复用
- [ ] **Spinner 样式** — MathBlock / Table / Image 三种不同 spinner，需统一
- [ ] **Blur 遮罩** — MathBlock 使用 `backdrop-filter: blur(2px)`，是否推广

### G4. 无障碍动效

- [ ] **`prefers-reduced-motion` 覆盖** — 仅 InlineCodeNode 和 LinkNode 支持，需全面覆盖

---

## H. 架构改进（低优先级）

### H1. CSS 架构

- [ ] **样式文件组织** — 当前仅一个 `index.css`，考虑拆分为 tokens / base / components
- [ ] **Tailwind @apply 过度使用** — 部分组件大量 `@apply`，考虑平衡
- [ ] **Scoped vs Global** — 部分样式需要全局穿透（`:deep()`），架构是否合理

### H2. 构建优化

- [ ] **CSS 产物体积** — 检查未使用的 Tailwind 类
- [ ] **双构建是否必要** — `index.css` + `index.tailwind.css` 的策略是否最优
- [ ] **PostCSS 插件链** — 是否需要增加 cssnano 等优化

---

## 统计摘要

| 类别 | 待设计项数 |
|---|---|
| A. 全局体系 | 10 |
| B. 色彩体系 | 9 |
| C. 排版系统 | 8 |
| D. 间距系统 | 6 |
| E. 边框与装饰 | 7 |
| F. 组件逐一审查 | 40+ |
| G. 动画与交互 | 10 |
| H. 架构改进 | 5 |
| **总计** | **~95 项** |
