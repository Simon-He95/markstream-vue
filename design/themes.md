# Theming System

> markstream-vue 的主题机制文档：Light/Dark 模式实现、CSS 变量架构、主题切换方式。

---

## 1. 主题架构概览

markstream-vue 采用 **混合主题方案**：

```
Props (isDark) → CSS Class (.is-dark / .dark) → CSS Variables Override → 组件渲染
```

三层机制互为补充：

| 层级 | 机制 | 说明 |
|---|---|---|
| 1. Props | `isDark: boolean` | 由宿主应用传入，最高优先级 |
| 2. CSS Class | `.dark` / `.is-dark` | 添加到根容器或组件上 |
| 3. Media Query | `prefers-color-scheme: dark` | 系统偏好兜底 |

---

## 2. 全局主题变量

### 2.1 挂载方式

```css
/* Light（默认） */
.markstream-vue {
  --border: 214.3 31.8% 91.4%;
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --secondary: 210 40% 96%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
}

/* Dark — 两种触发方式 */
.dark .markstream-vue,    /* 父级添加 .dark 类 */
.markstream-vue.dark {    /* 自身添加 .dark 类 */
  --border: 217.2 32.6% 17.5%;
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --secondary: 217.2 32.6% 17.5%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
}
```

### 2.2 使用方式

在组件中通过 `hsl()` 引用：

```css
color: hsl(var(--foreground));
background-color: hsl(var(--secondary));
border: 1px solid hsl(var(--border) / 0.9);
```

Tailwind 配置中也引用这些变量（带回退值）：

```js
'foreground': 'hsl(var(--foreground), 217.2 22.08% 19.5%)'
```

---

## 3. 组件级暗色模式

### 3.1 Props 传递链

```
NodeRenderer (isDark prop)
  └─ 所有子组件 (isDark prop)
       └─ :class="{ 'is-dark': props.isDark }"
```

### 3.2 CSS 类切换模式

各组件使用 `.is-dark` 类覆盖 CSS 变量：

```vue
<div class="code-block-container" :class="{ 'is-dark': props.isDark }">

<style scoped>
.code-block-container {
  --markstream-code-fallback-bg: #ffffff;
}
.code-block-container.is-dark {
  --markstream-code-fallback-bg: #111827;
}
</style>
```

### 3.3 各组件暗色实现方式

| 组件 | 暗色触发 | 方式 |
|---|---|---|
| 全局变量 | `.dark .markstream-vue` | CSS 变量覆盖 |
| CodeBlockNode | `.is-dark` class | ~30+ CSS 变量覆盖 |
| AdmonitionNode | `.is-dark` class | CSS 变量覆盖 + 透明度调整 |
| MermaidBlockNode | `:class` 条件 | Tailwind dark 类名切换 |
| Tooltip | `.is-dark` class | `bg-gray-900 text-white` |
| MathBlockNode | `.is-dark` class | spinner 颜色反转 |
| ImageNode | - | 无暗色适配 |
| HighlightNode | - | **无暗色适配**（固定 `#ffff00`） |
| BlockquoteNode | - | 仅通过全局 `--blockquote-border-color` |
| TableNode | - | 仅通过 `--table-border` |
| ListItemNode | - | 仅通过 `--list-item-marker` 等 |
| FootnoteNode | - | 固定 `#eaecef` 边框色，**无暗色适配** |

---

## 4. Monaco Editor 主题

代码块支持独立的编辑器主题系统：

```ts
interface Props {
  darkTheme?: CodeBlockMonacoTheme   // 暗色编辑器主题
  lightTheme?: CodeBlockMonacoTheme  // 亮色编辑器主题
}

// 运行时根据 isDark 切换
const activeTheme = props.isDark ? props.darkTheme : props.lightTheme
```

支持：
- 字符串形式：内置主题名
- 对象形式：`CodeBlockMonacoThemeObject` 自定义主题

VSCode 变量自动映射：
- `--vscode-editor-background`
- `--vscode-editor-foreground`
- `--vscode-editor-selectionBackground`

---

## 5. 媒体查询兜底

部分组件使用系统偏好作为兜底：

```css
@media (prefers-color-scheme: dark) {
  .math-loading-spinner {
    border-color: rgba(255, 255, 255, 0.1);
    border-top-color: rgba(255, 255, 255, 0.6);
  }
}
```

JavaScript 检测：

```js
window.matchMedia('(prefers-color-scheme: dark)').matches
```

---

## 6. Tailwind 作用域隔离

所有 Tailwind 工具类限定在 `.markstream-vue` 内生效，避免全局污染：

```js
// tailwind.config.js
important: '.markstream-vue'
```

按钮重置使用 `:where()` 保持低特异性：

```css
:where(.markstream-vue) button {
  appearance: none;
  background: transparent;
  border: 0;
}
```

---

## 7. 双构建输出

| 构建 | 输出文件 | 说明 |
|---|---|---|
| 标准构建 | `dist/index.css` | 包含完整 Tailwind 工具类 |
| Tailwind 构建 | `dist/index.tailwind.css` | 不含 Tailwind，供宿主项目自行引入 |

---

## 8. 当前主题体系的问题

| 问题 | 详情 |
|---|---|
| 暗色覆盖不完整 | HighlightNode、FootnoteNode、ImageNode 等无暗色适配 |
| 变量命名不统一 | 全局用 HSL 裸值，组件用 HEX/RGB/rgba，缺乏统一规范 |
| 暗色触发方式不一致 | 全局用 `.dark`，组件用 `.is-dark`，Mermaid 用条件 class |
| 硬编码颜色散落 | `#e2e8f0`、`#eaecef`、`#cbd5e1` 等直接写在组件中 |
| 语义色彩未统一 | Admonition 语义色与全局体系分离 |
| CSS 变量缺乏 Dark 值 | `--blockquote-border-color`、`--table-border` 等无暗色默认值 |
