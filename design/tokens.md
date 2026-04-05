# Design Tokens

> markstream-vue 当前所有设计令牌（Design Tokens）清单。
> 来源：`src/index.css`、`tailwind.config.js`、各组件 `<style>` 块。

---

## 1. 全局 CSS 变量（Global CSS Variables）

定义在 `src/index.css`，挂载于 `.markstream-vue` 根选择器。

### 1.1 基础色彩（HSL 格式）

| 变量名 | Light 值 | Dark 值 | 用途 |
|---|---|---|---|
| `--border` | `214.3 31.8% 91.4%` | `217.2 32.6% 17.5%` | 边框色 |
| `--background` | `0 0% 100%` | `222.2 84% 4.9%` | 背景色 |
| `--foreground` | `222.2 84% 4.9%` | `210 40% 98%` | 前景/文字色 |
| `--secondary` | `210 40% 96%` | `217.2 32.6% 17.5%` | 次要背景（如行内代码底色） |
| `--muted` | `210 40% 96%` | `217.2 32.6% 17.5%` | 弱化背景 |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `215 20.2% 65.1%` | 弱化文字 |

### 1.2 Tailwind 扩展色彩映射

定义在 `tailwind.config.js`，带回退值：

```js
colors: {
  'border':           'hsl(var(--border), 214.3 21.44% 93.4%)',
  'background':       'hsl(var(--background), 0 0% 100%)',
  'foreground':       'hsl(var(--foreground), 217.2 22.08% 19.5%)',
  'secondary':        'hsl(var(--secondary), 214.3 21.44% 93.4%)',
  'muted':            'hsl(var(--muted), 210 28% 98.1%)',
  'muted-foreground': 'hsl(var(--muted-foreground), 215 12.16% 67.1%)',
}
```

---

## 2. 组件级 CSS 变量

### 2.1 代码块（CodeBlockNode）

| 变量名 | Light | Dark | 用途 |
|---|---|---|---|
| `--markstream-code-fallback-bg` | `#ffffff` | `#111827` | 代码区背景 |
| `--markstream-code-fallback-fg` | `#111827` | `#e5e7eb` | 代码区文字 |
| `--markstream-code-border-color` | `rgb(229 231 235)` | `rgb(55 65 81 / 0.3)` | 代码块边框 |
| `--markstream-code-fallback-selection-bg` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` | 选区背景 |
| `--markstream-code-padding-y` | `8px` | - | 代码内上下边距 |
| `--markstream-code-padding-x` | `12px` | - | 代码内左右边距 |
| `--markstream-code-padding-left` | `52px` | - | 代码内左边距（含行号） |
| `--vscode-editor-font-size` | `12px` | - | 编辑器字号 |
| `--vscode-editor-background` | 来自 Monaco 主题 | - | Monaco 背景色 |
| `--vscode-editor-foreground` | 来自 Monaco 主题 | - | Monaco 前景色 |

### 2.2 Diff 视图变量

| 变量名 | Light | Dark |
|---|---|---|
| `--markstream-diff-frame-border` | `rgb(203 213 225 / 0.56)` | 深色变体 |
| `--markstream-diff-frame-shadow` | `0 16px 40px -32px rgb(15 23 42 / 0.18)` | 深色变体 |
| `--markstream-diff-shell-fg` | `#0f172a` | 深色变体 |
| `--markstream-diff-shell-muted` | `#64748b` | 深色变体 |
| `--markstream-diff-shell-border` | `rgb(148 163 184 / 0.18)` | 深色变体 |
| `--markstream-diff-editor-bg` | `#ffffff` | 深色变体 |
| `--markstream-diff-editor-fg` | `#435266` | 深色变体 |
| `--markstream-diff-added-fg` | `#14b8a6` | `#5eead4` |
| `--markstream-diff-removed-fg` | `#ff3658` | `#fda4af` |
| `--markstream-diff-added-line` | `rgb(232 249 245 / 0.98)` | 深色变体 |
| `--markstream-diff-removed-line` | `rgb(255 241 241 / 0.98)` | 深色变体 |
| `--markstream-diff-added-inline` | `rgb(197 245 219 / 0.96)` | 深色变体 |
| `--markstream-diff-removed-inline` | `rgb(255 215 217 / 0.92)` | 深色变体 |

### 2.3 提示框（AdmonitionNode）

| 变量名 | Light | Dark | 用途 |
|---|---|---|---|
| `--admonition-bg` | `#f8f8f8` | `#0b1220` | 提示框背景 |
| `--admonition-border` | `#eaecef` | `rgba(255,255,255,0.06)` | 提示框边框 |
| `--admonition-header-bg` | `rgba(0,0,0,0.03)` | `rgba(255,255,255,0.03)` | 标题栏背景 |
| `--admonition-text` | `#111827` | `#e6eef8` | 正文色 |
| `--admonition-muted` | `#374151` | `#cbd5e1` | 标题文字色 |
| `--admonition-note-color` | `#448aff` | 同 | 蓝色-提示 |
| `--admonition-tip-color` | `#00bfa5` | 同 | 绿色-技巧 |
| `--admonition-warning-color` | `#ff9100` | 同 | 橙色-警告 |
| `--admonition-danger-color` | `#ff5252` | 同 | 红色-危险 |

### 2.4 其他组件变量

| 变量名 | 默认值 | 组件 |
|---|---|---|
| `--blockquote-border-color` | `#e2e8f0` | BlockquoteNode |
| `--hr-border-color` | `#e2e8f0` | ThematicBreakNode |
| `--table-border` | `#cbd5e1` | TableNode |
| `--list-item-counter-marker` | `#64748b` | ListItemNode（有序列表数字） |
| `--list-item-marker` | `#cbd5e1` | ListItemNode（无序列表圆点） |
| `--link-color` | `#0366d6` | LinkNode |
| `--underline-height` | `2px` | LinkNode |
| `--underline-bottom` | `-3px` | LinkNode |
| `--underline-opacity` | `0.35` | LinkNode（动画最大透明度） |
| `--underline-rest-opacity` | `0.18` | LinkNode（静止态透明度） |
| `--underline-duration` | `1.6s` | LinkNode |
| `--underline-timing` | `ease-in-out` | LinkNode |

### 2.5 动画相关变量

| 变量名 | 默认值 | 用途 |
|---|---|---|
| `--typewriter-fade-duration` | `900ms` | 打字机淡入时长 |
| `--typewriter-fade-ease` | `ease-out` | 打字机缓动函数 |
| `--stream-update-fade-duration` | 同上 | 流式更新淡入时长 |
| `--stream-update-fade-ease` | 同上 | 流式更新缓动函数 |

---

## 3. 色彩体系（Color Palette）

### 3.1 语义色彩

| 语义 | 色值 | 用途 |
|---|---|---|
| Note / Info | `#448aff` | 信息提示 |
| Tip | `#00bfa5` | 技巧提示 |
| Warning | `#ff9100` | 警告提示 |
| Danger / Error | `#ff5252` | 危险/错误提示 |
| Link | `#0366d6` | 链接色 |
| Highlight | `#ffff00` | 文本高亮 |
| Diff Added | `#14b8a6` (light) / `#5eead4` (dark) | 新增行 |
| Diff Removed | `#ff3658` (light) / `#fda4af` (dark) | 删除行 |

### 3.2 灰阶色彩（散落于各组件）

| 色值 | 出现位置 |
|---|---|
| `#111827` (gray-900) | 代码区前景、提示框文字 |
| `#e5e7eb` (gray-200) | 代码区暗色前景 |
| `#e2e8f0` (slate-200) | 引用线、分割线 |
| `#cbd5e1` (slate-300) | 表格边框、列表标记 |
| `#64748b` (slate-500) | 有序列表标记 |
| `#374151` (gray-700) | 提示框标题文字 |
| `#eaecef` | 提示框边框、脚注边框 |
| `#0b1220` | 暗色提示框背景 |

---

## 4. 排版（Typography）

### 4.1 标题层级

| 等级 | 字号 | 字重 | 上边距 | 下边距 | 行高 |
|---|---|---|---|---|---|
| h1 | `text-4xl` (2.25rem) | `font-extrabold` (800) | `0` | `calc(8/9*1em)` | `calc(10/9*1)` |
| h2 | `text-2xl` (1.5rem) | `font-bold` (700) | `2rem` | `1rem` | `calc(4/3*1)` |
| h3 | `text-xl` (1.25rem) | `font-semibold` (600) | `calc(8/5*1em)` | `calc(3/5*1em)` | `calc(5/3*1)` |
| h4 | `text-base` (1rem) | `font-semibold` (600) | `1.5rem` | `0.5rem` | 默认 |
| h5 | `text-base` (1rem) | 默认 | `0` | `0` | 默认 |
| h6 | `text-base` (1rem) | 默认 | `0` | `0` | 默认 |

共有基类：`font-medium leading-tight`

### 4.2 正文

| 元素 | 字号 | 字重 | 行距 | 边距 |
|---|---|---|---|---|
| 段落 `<p>` | 继承 | 继承 | 继承 | `1.25em 0` |
| 行内代码 | `85%` | `font-mono` | - | `px-1 py-0.5` |
| 引用块 | 继承 | `500` | - | `mt-1.6em mb-1.6em pl-1em` |
| 定义列表 term | 继承 | `600` | - | `mt-0.5rem` |
| 定义列表 desc | 继承 | 继承 | - | `ml-1rem mb-0.5rem` |
| 脚注 | `text-sm` | - | `leading-relaxed` | `mt-2 mb-2` |

### 4.3 代码块

| 属性 | 值 |
|---|---|
| 字号 | `var(--vscode-editor-font-size, 12px)` |
| 字体 | monospace（系统等宽） |
| 标题字号 | `14px` |
| 标题字重 | `650` |
| 标题字间距 | `0.01em` |
| 说明文字字号 | `12px` |

---

## 5. 间距（Spacing）

### 5.1 块级元素垂直间距

| 元素 | margin-top | margin-bottom |
|---|---|---|
| 段落 | `1.25em` | `1.25em` |
| 标题 h1 | `0` | `calc(8/9*1em)` |
| 标题 h2 | `2rem` | `1rem` |
| 标题 h3 | `calc(8/5*1em)` | `calc(3/5*1em)` |
| 标题 h4 | `1.5rem` | `0.5rem` |
| 引用块 | `1.6em` | `1.6em` |
| 列表 | `1.25rem` | `1.25rem` |
| 列表项 | `0.5rem` | `0.5rem` |
| 提示框 | `1rem` | `1rem` |
| 表格 | `2rem` | `2rem` |
| 分割线 | `3rem` | `3rem` |
| Mermaid 图 | `1rem` | `1rem` |
| 定义列表 | `0` | `1rem` |

### 5.2 内边距（Padding）

| 元素 | padding |
|---|---|
| 行内代码 | `px-1 py-0.5` (4px 2px) |
| 提示框标题 | `0.5rem 1rem` |
| 提示框内容 | `0.5rem 1rem 1rem` |
| 引用块左侧 | `1em` |
| 列表缩进 | `calc(13/8*1em)` |
| 列表缩进（移动端） | `calc(14/9*1em)` |
| 列表项 | `pl-1.5` (6px) |
| 表格单元格 | `calc(4/7*1em)` |
| 代码块内容 | `8px 12px` (左侧 `52px` 含行号) |

---

## 6. 边框与圆角（Borders & Radius）

| 元素 | 边框 | 圆角 |
|---|---|---|
| 行内代码 | `1px solid hsl(var(--border) / 0.9)` | `rounded` (0.25rem) |
| 提示框 | `border-left: 4px solid` | `4px` |
| 引用块 | `border-left: 0.25rem solid` | - |
| 代码块 | `var(--markstream-code-border-color)` | 由 Monaco 控制 |
| 表格 | `var(--table-border, #cbd5e1)` | - |
| 分割线 | `border-t` | - |
| 脚注 | `border-t border-[#eaecef]` | - |
| Mermaid 图 | `border rounded-lg` | `0.5rem` |
| Tooltip | `border rounded-md` | `0.375rem` |

---

## 7. 阴影（Shadows）

| 元素 | 阴影值 |
|---|---|
| Mermaid 块 | `shadow-sm` |
| Tooltip | `shadow-md` |
| Diff 外框 | `0 16px 40px -32px rgb(15 23 42 / 0.18)` |
| Diff shell | `0 30px 70px -48px rgb(15 23 42 / 0.42)` |
| Mermaid 模态弹窗 | `shadow-lg` |
| Mermaid 激活按钮 | `shadow-sm` |

---

## 8. 性能相关令牌

| 属性 | 值 | 组件 |
|---|---|---|
| `content-visibility` | `auto` | markdown-renderer, CodeBlockNode, MermaidBlockNode |
| `contain` | `content` / `layout` | 多个组件 |
| `contain-intrinsic-size` | `320px 180px` | CodeBlockNode |
| `contain-intrinsic-size` | `360px 240px` | MermaidBlockNode |
| `container-type` | `inline-size` | CodeBlockNode |
