# 样式架构方案

> 核心决策：**带默认样式 + CSS 变量全量可定制**，非 headless。
> shadcn 兼容：继承宿主变量，不覆盖；无宿主时回退到内置默认值。

---

## 设计原则

1. **开箱即用** — 引入即有完整合理的 Markdown 渲染样式
2. **变量换肤** — 用户只需覆盖 CSS 变量即可定制全部视觉表现
3. **零硬编码** — 组件内不允许出现硬编码的色值、间距等魔法数字
4. **Light/Dark 内建** — 两套主题开关切换，暗色模式完整覆盖所有组件
5. **不污染宿主** — 所有样式限定在 `.markstream-vue` 作用域内
6. **不覆盖宿主** — 不重定义 shadcn 同名变量，通过继承 + 回退兼容

---

## 变量不冲突策略

### 问题

如果我们在 `.markstream-vue` 上直接定义 `--background`，会覆盖宿主从 `:root` 继承下来的值：

```
宿主 :root { --background: 210 20% 98% }   ← 用户自定义的暖灰
我们 .markstream-vue { --background: 0 0% 100% }  ← 覆盖成了纯白 ❌
```

### 解决方案：Bridge Tokens

引入 `--ms-*` 前缀的桥接层，用 `var()` 继承宿主变量，未定义时回退到默认值：

```css
.markstream-vue {
  --ms-background: var(--background, 0 0% 100%);
  /*                    ↑ 宿主有则用宿主的   ↑ 没有则用回退值 */
}
```

**shadcn 宿主**：

```
:root { --background: 210 20% 98% }     ← 宿主定义
  └─ .markstream-vue 继承 --background = 210 20% 98%
       └─ --ms-background: var(--background, 0 0% 100%)
            = 210 20% 98%  ✅ 宿主主题穿透生效
```

**独立使用（无 shadcn）**：

```
:root 未定义 --background
  └─ .markstream-vue 未继承到 --background
       └─ --ms-background: var(--background, 0 0% 100%)
            = 0 0% 100%  ✅ 回退值生效，开箱即用
```

---

## 分层架构

```
┌──────────────────────────────────────────────┐
│  Layer 4: Dark Theme                         │  仅覆盖 Layer 1 bridge + ext 的回退值
│  .dark .markstream-vue { --ms-bg: var(...) } │
├──────────────────────────────────────────────┤
│  Layer 3: Component Styles                   │  引用 Layer 2 变量，不允许硬编码
│  .heading { color: var(--blockquote-fg) }    │
├──────────────────────────────────────────────┤
│  Layer 2: Semantic Tokens                    │  组件级变量，引用 Layer 1
│  --code-bg: hsl(var(--ms-background));       │
├──────────────────────────────────────────────┤
│  Layer 1: Base Tokens                        │
│  ├─ Bridge (--ms-*): 继承 shadcn + 回退     │
│  └─ Extension (--*): 本项目独有             │
└──────────────────────────────────────────────┘
```

---

## Layer 1: Base Tokens

### 1.1 Bridge Tokens（`--ms-*`，继承 shadcn 同名变量）

> 内部桥接用。用户定制时直接覆盖 shadcn 变量名（如 `--background`）或覆盖 semantic token 即可。

#### Light（默认）

```css
.markstream-vue {

  /* ── 背景 / 前景 ── */
  --ms-background:            var(--background,            0 0% 100%);
  --ms-foreground:            var(--foreground,            222.2 84% 4.9%);

  /* ── 弱化 ── */
  --ms-muted:                 var(--muted,                 210 40% 96.1%);
  --ms-muted-foreground:      var(--muted-foreground,      215.4 16.3% 46.9%);

  /* ── 次要 ── */
  --ms-secondary:             var(--secondary,             210 40% 96.1%);
  --ms-secondary-foreground:  var(--secondary-foreground,  222.2 47.4% 11.2%);

  /* ── 强调 ── */
  --ms-accent:                var(--accent,                210 40% 96.1%);
  --ms-accent-foreground:     var(--accent-foreground,     222.2 47.4% 11.2%);

  /* ── 主要操作 ── */
  --ms-primary:               var(--primary,               222.2 47.4% 11.2%);
  --ms-primary-foreground:    var(--primary-foreground,     210 40% 98%);

  /* ── 危险 ── */
  --ms-destructive:           var(--destructive,           0 84.2% 60.2%);
  --ms-destructive-foreground: var(--destructive-foreground, 210 40% 98%);

  /* ── 边框 / Focus ── */
  --ms-border:                var(--border,                214.3 31.8% 91.4%);
  --ms-ring:                  var(--ring,                  222.2 84% 4.9%);

  /* ── 弹出层 ── */
  --ms-popover:               var(--popover,               0 0% 100%);
  --ms-popover-foreground:    var(--popover-foreground,     222.2 84% 4.9%);

  /* ── 圆角 ── */
  --ms-radius:                var(--radius,                0.5rem);
}
```

#### Dark

```css
.dark .markstream-vue,
.markstream-vue.dark {

  --ms-background:            var(--background,            222.2 84% 4.9%);
  --ms-foreground:            var(--foreground,            210 40% 98%);

  --ms-muted:                 var(--muted,                 217.2 32.6% 17.5%);
  --ms-muted-foreground:      var(--muted-foreground,      215 20.2% 65.1%);

  --ms-secondary:             var(--secondary,             217.2 32.6% 17.5%);
  --ms-secondary-foreground:  var(--secondary-foreground,  210 40% 98%);

  --ms-accent:                var(--accent,                217.2 32.6% 17.5%);
  --ms-accent-foreground:     var(--accent-foreground,     210 40% 98%);

  --ms-primary:               var(--primary,               210 40% 98%);
  --ms-primary-foreground:    var(--primary-foreground,     222.2 47.4% 11.2%);

  --ms-destructive:           var(--destructive,           0 62.8% 30.6%);
  --ms-destructive-foreground: var(--destructive-foreground, 210 40% 98%);

  --ms-border:                var(--border,                217.2 32.6% 17.5%);
  --ms-ring:                  var(--ring,                  212.7 26.8% 83.9%);

  --ms-popover:               var(--popover,               222.2 84% 4.9%);
  --ms-popover-foreground:    var(--popover-foreground,     210 40% 98%);
}
```

**工作原理**：

- shadcn 宿主有 `.dark { --background: X }` → `var(--background, fallback)` 取 X → 宿主暗色穿透
- 独立使用，无 `--background` → 取 fallback 中的暗色值 → 内置暗色生效

### 1.2 Extension Tokens（本项目独有，无冲突风险）

> 这些变量名 shadcn 不存在，直接定义即可。

#### Light

```css
.markstream-vue {

  /* ── 语义色 ── */
  --ms-info:                  217 91% 60%;          /* 信息/备注 (#448aff) */
  --ms-info-foreground:       210 40% 98%;

  --ms-success:               168 100% 37.5%;       /* 成功/提示 (#00bfa5) */
  --ms-success-foreground:    210 40% 98%;

  --ms-warning:               34 100% 50%;          /* 警告 (#ff9100) */
  --ms-warning-foreground:    0 0% 100%;

  /* ── Diff ── */
  --ms-diff-added:            174 60% 51%;          /* 新增 (#14b8a6) */
  --ms-diff-removed:          350 100% 60%;         /* 删除 (#ff3658) */

  /* ── 其他 ── */
  --ms-highlight:             54 100% 62%;          /* 文本高亮 */
  --ms-highlight-foreground:  0 0% 0%;

  --ms-link:                  212 100% 42%;         /* 链接色 (#0366d6) */

  /* ── 排版 ── */
  --ms-font-sans:  ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --ms-font-mono:  ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
```

#### Dark

```css
.dark .markstream-vue,
.markstream-vue.dark {

  --ms-diff-added:            174 72% 70%;          /* 暗色更亮 (#5eead4) */
  --ms-diff-removed:          0 92% 82%;            /* 暗色更柔 (#fda4af) */

  --ms-highlight:             54 80% 42%;           /* 暗色降低亮度 */
  --ms-highlight-foreground:  0 0% 100%;

  --ms-link:                  213 94% 68%;          /* 暗色更亮链接 */

  /* info / success / warning 在暗色下保持不变，仍然醒目 */
}
```

### 1.3 圆角推算规则

```
sm   = calc(var(--ms-radius) - 2px)    → 6px
base = var(--ms-radius)                → 8px (0.5rem)
md   = calc(var(--ms-radius) + 2px)    → 10px
lg   = calc(var(--ms-radius) + 4px)    → 12px
full = 9999px
```

---

## Layer 2: Semantic Tokens

全部引用 Layer 1 的 `--ms-*` 变量。Dark 模式下 Layer 1 变化 → Layer 2 自动跟随，无需重复定义。

```css
.markstream-vue {

  /* ── 行内代码 ── */
  --inline-code-bg:             hsl(var(--ms-secondary));
  --inline-code-fg:             hsl(var(--ms-foreground));
  --inline-code-border:         hsl(var(--ms-border) / 0.9);

  /* ── 代码块 ── */
  --code-bg:                    hsl(var(--ms-background));
  --code-fg:                    hsl(var(--ms-foreground));
  --code-border:                hsl(var(--ms-border));
  --code-header-bg:             hsl(var(--ms-muted));
  --code-selection-bg:          hsl(var(--ms-accent) / 0.3);
  --code-line-number:           hsl(var(--ms-muted-foreground));

  /* ── 代码块操作栏 ── */
  --code-action-fg:             hsl(var(--ms-muted-foreground));
  --code-action-hover-bg:       hsl(var(--ms-accent));
  --code-action-hover-fg:       hsl(var(--ms-accent-foreground));
  --code-action-active-bg:      hsl(var(--ms-primary));
  --code-action-active-fg:      hsl(var(--ms-primary-foreground));

  /* ── Diff ── */
  --diff-added-fg:              hsl(var(--ms-diff-added));
  --diff-removed-fg:            hsl(var(--ms-diff-removed));
  --diff-added-bg:              hsl(var(--ms-diff-added) / 0.1);
  --diff-added-inline-bg:       hsl(var(--ms-diff-added) / 0.2);
  --diff-removed-bg:            hsl(var(--ms-diff-removed) / 0.1);
  --diff-removed-inline-bg:     hsl(var(--ms-diff-removed) / 0.2);

  /* ── 引用块 ── */
  --blockquote-border:          hsl(var(--ms-border));
  --blockquote-fg:              hsl(var(--ms-foreground));

  /* ── 提示框 (Admonition) ── */
  --admonition-bg:              hsl(var(--ms-muted));
  --admonition-border:          hsl(var(--ms-border));
  --admonition-fg:              hsl(var(--ms-foreground));
  --admonition-muted:           hsl(var(--ms-muted-foreground));
  --admonition-header-bg:       hsl(var(--ms-muted) / 0.5);
  --admonition-note:            hsl(var(--ms-info));
  --admonition-tip:             hsl(var(--ms-success));
  --admonition-warning:         hsl(var(--ms-warning));
  --admonition-danger:          hsl(var(--ms-destructive));

  /* ── 表格 ── */
  --table-border:               hsl(var(--ms-border));
  --table-header-bg:            hsl(var(--ms-muted));
  --table-header-fg:            hsl(var(--ms-foreground));
  --table-row-hover-bg:         hsl(var(--ms-accent) / 0.5);

  /* ── 链接 ── */
  --link-color:                 hsl(var(--ms-link));

  /* ── 列表 ── */
  --list-marker:                hsl(var(--ms-border));
  --list-counter-marker:        hsl(var(--ms-muted-foreground));

  /* ── 分割线 ── */
  --hr-border:                  hsl(var(--ms-border));

  /* ── 高亮 ── */
  --highlight-bg:               hsl(var(--ms-highlight));
  --highlight-fg:               hsl(var(--ms-highlight-foreground));

  /* ── 脚注 ── */
  --footnote-border:            hsl(var(--ms-border));

  /* ── Tooltip ── */
  --tooltip-bg:                 hsl(var(--ms-popover));
  --tooltip-fg:                 hsl(var(--ms-popover-foreground));
  --tooltip-border:             hsl(var(--ms-border));

  /* ── Modal ── */
  --modal-overlay:              hsl(0 0% 0% / 0.7);
  --modal-bg:                   hsl(var(--ms-popover));
  --modal-fg:                   hsl(var(--ms-popover-foreground));

  /* ── 图表容器 (Mermaid / D2 / Infographic) ── */
  --diagram-bg:                 hsl(var(--ms-muted));
  --diagram-border:             hsl(var(--ms-border));
  --diagram-header-bg:          hsl(var(--ms-muted));

  /* ── 数学公式 ── */
  --math-fg:                    hsl(var(--ms-foreground));

  /* ── 加载态 ── */
  --loading-spinner:            hsl(var(--ms-muted-foreground));
  --loading-shimmer:            hsl(var(--ms-muted) / 0.5);

  /* ── 图片 ── */
  --image-placeholder-bg:       hsl(var(--ms-muted));

  /* ── Focus ring ── */
  --focus-ring:                 hsl(var(--ms-ring));
}
```

**Dark 模式下无需重复定义 Layer 2** — 因为 Layer 1 的 `--ms-*` 值变了，这里自动跟随。

---

## Layer 3: Component Styles

组件中只引用 Layer 2 语义变量：

```css
/* ❌ 之前 */
.blockquote { border-left: 0.25rem solid #e2e8f0; }
.admonition-note { border-left-color: #448aff; }
.highlight-node { background-color: #ffff00; }

/* ✅ 之后 */
.blockquote { border-left: 0.25rem solid var(--blockquote-border); }
.admonition-note { border-left-color: var(--admonition-note); }
.highlight-node { background: var(--highlight-bg); }
```

---

## 暗色模式统一方案

**去掉组件级 `.is-dark` CSS**，统一为：

```
之前：isDark prop → 每个组件 .is-dark → 30+ 组件各自覆盖 CSS 变量
之后：.dark 类 → Layer 1 bridge 回退值切换 → Layer 2 自动跟随 → 全部组件适配
```

**保留 `isDark` prop** 仅用于 JS 逻辑（不用于 CSS）：
- Monaco Editor 主题名切换
- Mermaid 主题名切换
- `prefers-color-scheme` 检测兜底

### CodeBlockNode `.is-dark` 例外

CodeBlockNode 保留 `.is-dark` CSS 块。此处 `.is-dark` 的语义是**"编辑器表面为暗色"**
（由 Monaco 主题检测 `resolvedSurfaceIsDark` 决定），与页面级 `.dark` 无关。

- 一个亮色页面上可以出现暗色主题的代码块
- `.is-dark` 块包含 ~15 个 diff 视图的阴影/透明度/渐变差异值
- 这些值已全部引用 `--ms-*` 语义令牌，只是 opacity 系数不同

### Admonition header-bg 例外

提示框标题背景需要在 dark 下使用更高透明度（6% → 12%），因此
`--admonition-*-header-bg` 在 `.dark` 区块中重新定义。这是 Layer 2 中
唯一需要 dark 覆盖的语义令牌。

---

## shadcn 兼容矩阵

| 变量来源 | 我们的处理 | 用户如何定制 |
|---|---|---|
| shadcn 同名（`--background` 等 14 个） | `--ms-*` 桥接继承 + 回退 | 在 `:root` 设置 shadcn 变量，自动穿透 |
| 本项目独有（`--ms-info` 等 8 个） | 直接定义在 `.markstream-vue` | 在 `.markstream-vue` 上覆盖 |
| 组件语义（`--code-bg` 等 ~35 个） | 引用 `--ms-*`，定义一次 | 在 `.markstream-vue` 上覆盖 |

### shadcn 未采用（本项目不需要）

| Token | 原因 |
|---|---|
| `--card` / `--card-foreground` | 无 card 组件 |
| `--input` | 无输入框 |
| `--sidebar-*` | 无侧边栏 |
| `--chart-*` | Mermaid 自带主题 |

### 本项目扩展（shadcn 没有）

| Token | 用途 |
|---|---|
| `--ms-info` / `--ms-success` / `--ms-warning` | Admonition 语义色 |
| `--ms-diff-added` / `--ms-diff-removed` | Diff 视图 |
| `--ms-highlight` / `--ms-highlight-foreground` | `==高亮==` 语法 |
| `--ms-link` | 链接色 |

---

## 当前控件清单

| 控件 | 出现组件 | 涉及 tokens |
|---|---|---|
| 操作按钮（复制/折叠/全屏/导出） | CodeBlock, Mermaid, D2, Infographic, Admonition | `--code-action-*`, `--focus-ring` |
| 字号调节按钮组 | CodeBlock, MarkdownCodeBlock | `--code-action-*` |
| 模式切换（Preview/Source） | CodeBlock, Mermaid, D2, Infographic | `--code-action-active-*` |
| 缩放控制 | Mermaid, Infographic | `--code-action-*` |
| Tooltip | 全局 | `--tooltip-*` |
| Modal | CodeBlock, Mermaid, Infographic | `--modal-*` |
| Checkbox（只读） | CheckboxNode | `--ms-foreground` |
| Spinner | Image, Table, MathBlock | `--loading-spinner` |
| Shimmer 骨架屏 | CodeBlock, Table | `--loading-shimmer` |
| 错误态 | ImageNode | `--ms-destructive` |
| 可点击引用 | FootnoteRef, ReferenceNode | `--link-color` |

---

## 用户定制示例

### 场景 1：shadcn 项目（零配置接入）

```js
// 只需引入样式，shadcn 变量自动穿透
import 'markstream-vue/dist/index.css'
```

宿主 `:root` 上的 `--background`、`--foreground` 等自动继承进 `.markstream-vue`。

如需补充 Markdown 扩展色：

```css
.markstream-vue {
  --ms-info: 217 91% 60%;
  --ms-success: 142 71% 45%;
  --ms-link: 221 83% 53%;
}
```

### 场景 2：独立项目，换整体配色

```css
/* 方式 A：覆盖 bridge 识别的 shadcn 变量名 */
:root {
  --background: 0 0% 98%;
  --foreground: 240 10% 10%;
  --border: 240 5% 85%;
}

/* 方式 B：直接覆盖 --ms-* bridge token */
.markstream-vue {
  --ms-background: 0 0% 98%;
  --ms-foreground: 240 10% 10%;
  --ms-border: 240 5% 85%;
}
```

### 场景 3：只改代码块（覆盖 semantic token）

```css
.markstream-vue {
  --code-bg: #1e1e2e;
  --code-fg: #cdd6f4;
  --code-border: transparent;
}
```

### 场景 4：只改提示框色彩

```css
.markstream-vue {
  --ms-info: 221 83% 53%;
  --ms-success: 142 71% 45%;
  --ms-warning: 38 92% 50%;
  --ms-destructive: 0 72% 51%;
}
```

---

## 已知边界情况

**shadcn 宿主 + 仅对 markstream-vue 启用 dark**：

```html
<!-- 宿主全局 light，但 markstream-vue 想用 dark -->
<div class="markstream-vue dark">...</div>
```

此时宿主的 light `--background` 仍会继承进来，bridge 的 dark 回退值不会生效。
**解决**：shadcn 宿主应在文档级切换 `.dark`，或通过覆盖 semantic token 单独控制。

---

## 迁移策略

分步进行，每步可独立验证：

| 阶段 | 内容 | 影响范围 |
|---|---|---|
| 1 | 定义 Bridge Tokens + Extension Tokens（Layer 1） | 仅新增变量，不破坏现有 |
| 2 | 定义 Semantic Tokens（Layer 2），引用 `--ms-*` | 仅新增变量，不破坏现有 |
| 3 | 逐组件替换硬编码值为 Semantic Token 引用 | 逐组件改，可逐个验证 |
| 4 | 补全 Dark 的 Bridge Token 回退值 | 暗色模式完整 |
| 5 | 移除组件内 `.is-dark` CSS 覆盖 | 简化暗色逻辑 |
| 6 | 清理：删除废弃变量、统一动画变量 | 最终打磨 |
