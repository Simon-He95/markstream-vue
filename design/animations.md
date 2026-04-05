# Animations & Transitions

> 所有动画、过渡效果与运动设计清单。

---

## 1. CSS 变量控制的动画

| 变量 | 默认值 | 用途 |
|---|---|---|
| `--typewriter-fade-duration` | `900ms` | 流式打字机淡入时长 |
| `--typewriter-fade-ease` | `ease-out` | 流式打字机缓动 |
| `--stream-update-fade-duration` | 同上回退 | 流式内容更新淡入时长 |
| `--stream-update-fade-ease` | 同上回退 | 流式内容更新缓动 |

---

## 2. Keyframe 动画

### 2.1 流式内容淡入

**组件**：InlineCodeNode

```css
@keyframes inline-code-stream-update-fade-a { from { opacity: 0 } to { opacity: 1 } }
@keyframes inline-code-stream-update-fade-b { from { opacity: 0 } to { opacity: 1 } }
```

- 使用 a/b 交替触发避免重复动画不生效
- Duration：`var(--stream-update-fade-duration, var(--typewriter-fade-duration, 900ms))`
- Easing：`var(--stream-update-fade-ease, var(--typewriter-fade-ease, ease-out))`
- `will-change: opacity`

### 2.2 骨架屏 Shimmer

**组件**：CodeBlockNode, TableNode

```css
/* CodeBlockNode */
@keyframes code-skeleton-shimmer {
  0%   { background-position: -200% 0 }
  100% { background-position: 200% 0 }
}
/* background: linear-gradient(90deg, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.04) 75%) */

/* TableNode */
@keyframes table-node-shimmer {
  0%   { background-position: -200% 0 }
  100% { background-position: 200% 0 }
}
```

### 2.3 Spinner 旋转

**组件**：MathBlockNode, TableNode, ImageNode

```css
/* MathBlockNode */
@keyframes math-spin {
  to { transform: rotate(360deg) }
}
/* 0.8s linear infinite */

/* TableNode */
/* Tailwind animate-spin */

/* ImageNode */
/* Tailwind animate-spin */
```

### 2.4 链接脉冲下划线

**组件**：LinkNode

```css
@keyframes underlinePulse {
  0%, 100% { opacity: var(--underline-rest-opacity, 0.18) }
  50%      { opacity: var(--underline-opacity, 0.35) }
}
/* Duration: var(--underline-duration, 1.6s) */
/* Timing: var(--underline-timing, ease-in-out) */
/* Iteration: var(--underline-iteration, infinite) */
```

---

## 3. CSS Transitions

### 3.1 通用过渡模式

| 组件 | 属性 | 时长 | 缓动 |
|---|---|---|---|
| CodeBlockNode | `height, max-height` | `180ms` | `ease` |
| MathBlockNode 渲染中 | `opacity` | `200ms` | `ease` |
| MermaidBlockNode 容器 | `height` | `150ms` | `ease-out` |
| Tooltip 位移 | `transform, box-shadow` | `220ms` | `cubic-bezier(.16,1,.3,1)` |

### 3.2 Vue Transition 组件

#### ImageNode — 图片切换

```
名称：img-switch
enter: opacity 220ms ease + translateY(6px → 0)
leave:  opacity 220ms ease + translateY(0 → 6px)
```

#### MathBlockNode — 公式切换

```
名称：math-fade
enter: opacity 0.3s ease (0 → 1)
leave:  opacity 0.3s ease (1 → 0)
```

#### TableNode — 表格淡入

```
名称：table-node-fade
enter: opacity 0.18s ease
leave:  opacity 0.18s ease
```

#### Tooltip — 浮层出入

```
名称：tooltip
enter-from:  opacity: 0, translateY(-6px) scale(0.98)
enter-to:    opacity: 1, translateY(0) scale(1)
enter-active: opacity 120ms linear
leave-active: opacity 120ms linear
```

#### MermaidBlockNode — 弹窗

```
名称：mermaid-dialog
enter: opacity 200ms ease + scale(0.98 → 1.0)
leave:  opacity 200ms ease + scale(1.0 → 0.98)
```

---

## 4. 交互反馈

### 4.1 按钮点击缩放

| 组件 | 选择器 | 效果 |
|---|---|---|
| CodeBlockNode | `.code-action-btn:active` | `transform: scale(0.98)` |
| MermaidBlockNode | `.mermaid-action-btn:active` | `transform: scale(0.98)` |
| AdmonitionNode | `.admonition-toggle` | `focus: outline 2px solid rgba(0,0,0,0.08)` |

### 4.2 禁用状态

| 组件 | 效果 |
|---|---|
| MermaidBlockNode 按钮 | `opacity: 0.5`, `cursor: not-allowed` |

---

## 5. 性能优化

### 5.1 `will-change` 使用

| 组件 | 元素 | `will-change` 值 |
|---|---|---|
| InlineCodeNode | `.inline-code-stream-delta` | `opacity` |
| LinkNode | `.link-loading-indicator` | `opacity` |

### 5.2 减少动效偏好

支持 `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  .inline-code-stream-delta { animation: none !important }
}
```

**组件**：InlineCodeNode, LinkNode

---

## 6. 动画时长速查表

| 速度等级 | 时长 | 用途 |
|---|---|---|
| 极快 | `120ms` | Tooltip 出入 |
| 快速 | `150ms` | Mermaid 容器高度 |
| 快速 | `180ms` | 代码块高度、表格淡入 |
| 标准 | `200ms` | Mermaid 弹窗、数学公式渲染 |
| 标准 | `220ms` | 图片切换、Tooltip 位移 |
| 慢速 | `300ms` | 数学公式切换 |
| 流式 | `900ms` | 打字机/流式更新淡入 |
| 脉冲 | `1600ms` | 链接加载指示器 |

---

## 7. 缓动函数速查

| 缓动 | 用途 |
|---|---|
| `ease` | 代码块高度、数学公式、图片 |
| `ease-out` | Mermaid 容器、打字机淡入 |
| `ease-in-out` | 链接脉冲 |
| `linear` | Spinner 旋转、Tooltip 透明度 |
| `cubic-bezier(.16,1,.3,1)` | Tooltip 位移（弹性过冲） |
